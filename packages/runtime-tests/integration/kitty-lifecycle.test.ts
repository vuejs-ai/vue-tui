import { PassThrough } from "node:stream";
import {
  createManualSuspensionHost,
  INTERNAL_SUSPENSION_HOST,
} from "../../runtime/dist/internal.mjs";
import { INTERNAL_KITTY_KEYBOARD } from "../../runtime/dist/internal.mjs";
import { createInternalMountOptions } from "../../runtime/dist/internal.mjs";
import { createApp, useInput, type TuiApp, type TuiInputEvent } from "@vue-tui/runtime";
import { defineComponent, h, nextTick, shallowRef, type ShallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";

type TrackedStdin = NodeJS.ReadStream &
  PassThrough & {
    isRaw: boolean;
    setRawMode(mode: boolean): NodeJS.ReadStream;
  };

function makeTrackedStdin(): {
  readonly stdin: TrackedStdin;
  readonly rawModeCalls: boolean[];
  readonly refBalance: () => number;
} {
  const stdin = new PassThrough() as TrackedStdin;
  const rawModeCalls: boolean[] = [];
  let refs = 0;
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode(mode: boolean) {
      rawModeCalls.push(mode);
      stdin.isRaw = mode;
      return stdin;
    },
    setEncoding() {
      return stdin;
    },
    ref() {
      refs++;
      return stdin;
    },
    unref() {
      refs--;
      return stdin;
    },
  });
  return { stdin, rawModeCalls, refBalance: () => refs };
}

function makeTrackedStdout(
  options: {
    readonly isTTY?: boolean;
    readonly fail?: (data: string) => void;
  } = {},
): {
  readonly stdout: NodeJS.WriteStream & PassThrough;
  readonly writes: string[];
} {
  const stdout = new PassThrough() as NodeJS.WriteStream & PassThrough;
  Object.assign(stdout, {
    isTTY: options.isTTY ?? true,
    columns: 100,
    rows: 40,
  });
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    const data = String(args[0]);
    writes.push(data);
    options.fail?.(data);
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  return { stdout, writes };
}

function inputText(event: TuiInputEvent): string | null {
  return event.type === "text" || event.type === "paste" ? event.text : null;
}

function mountInputApp({
  stdin,
  stdout,
  stderr,
  active,
  kittyMode,
  suspensionHost,
}: {
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr?: NodeJS.WriteStream;
  readonly active?: ShallowRef<boolean>;
  readonly kittyMode?: "auto" | "enabled" | "disabled";
  readonly suspensionHost?: ReturnType<typeof createManualSuspensionHost>;
}): { readonly app: TuiApp; readonly inputs: string[] } {
  const inputs: string[] = [];
  const App = defineComponent(() => {
    useInput(
      (event) => {
        const text = inputText(event);
        if (text !== null) inputs.push(text);
      },
      active ? { isActive: active } : undefined,
    );
    return () => h("tui-text", null, "ready");
  });
  const app = createApp(App);
  app.mount(
    createInternalMountOptions({
      stdout,
      ...(stderr ? { stderr } : {}),
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      ...(kittyMode ? { [INTERNAL_KITTY_KEYBOARD]: { mode: kittyMode } } : {}),
      ...(suspensionHost ? { [INTERNAL_SUSPENSION_HOST]: suspensionHost } : {}),
    }),
  );
  return { app, inputs };
}

const flushInput = () => new Promise<void>((resolve) => setImmediate(resolve));

async function settleLifecycle(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await flushInput();
}

function count(writes: readonly string[], sequence: string): number {
  return writes.filter((write) => write === sequence).length;
}

function expectReleased(stdin: TrackedStdin, refBalance: () => number): void {
  expect({
    isRaw: stdin.isRaw,
    refs: refBalance(),
    listeners: stdin.listenerCount("data"),
  }).toEqual({ isRaw: false, refs: 0, listeners: 0 });
}

describe("private Kitty negotiation at the Runtime boundary", () => {
  test("an input-free mount never negotiates", () => {
    const { stdin, refBalance } = makeTrackedStdin();
    const { stdout, writes } = makeTrackedStdout();
    const app = createApp(defineComponent(() => () => h("tui-text", null, "idle")));

    try {
      app.mount(
        createInternalMountOptions({
          stdout,
          stdin,
          patchConsole: false,
          liveUpdates: true,
          maxFps: 0,
        }),
      );
      expect(writes).not.toContain("\x1b[?u");
      expect(writes).not.toContain("\x1b[>1u");
      expectReleased(stdin, refBalance);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("the first active useInput negotiates and enables only disambiguation", async () => {
    const { stdin, refBalance } = makeTrackedStdin();
    const { stdout, writes } = makeTrackedStdout();
    const { app } = mountInputApp({ stdin, stdout });

    try {
      expect(writes).toContain("\x1b[?u");
      stdin.write("\x1b[?1u");
      await settleLifecycle();

      expect(writes).toContain("\x1b[>1u");
      expect(writes.filter((write) => /^\x1b\[>\d+u$/.test(write))).toEqual(["\x1b[>1u"]);
    } finally {
      app.unmount();
      expect(writes).toContain("\x1b[<u");
      expectReleased(stdin, refBalance);
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("a non-TTY document host keeps useInput inert without Kitty negotiation", async () => {
    const { stdin, refBalance } = makeTrackedStdin();
    const { stdout, writes } = makeTrackedStdout({ isTTY: false });
    const { app, inputs } = mountInputApp({ stdin, stdout });

    try {
      stdin.write("x");
      await settleLifecycle();
      // Document hosts accept useInput setup but never deliver events or negotiate.
      expect(inputs).toEqual([]);
      expect(writes).not.toContain("\x1b[?u");
      expect(writes).not.toContain("\x1b[>1u");
    } finally {
      app.unmount();
      expectReleased(stdin, refBalance);
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("a timed-out query falls back without swallowing ordinary input", async () => {
    const { stdin, refBalance } = makeTrackedStdin();
    const { stdout, writes } = makeTrackedStdout();
    const { app, inputs } = mountInputApp({ stdin, stdout });

    try {
      stdin.write("a");
      await settleLifecycle();
      expect(inputs).toEqual(["a"]);

      await new Promise<void>((resolve) => setTimeout(resolve, 230));
      stdin.write("b");
      await settleLifecycle();
      expect(inputs).toEqual(["a", "b"]);
      expect(writes).not.toContain("\x1b[>1u");
    } finally {
      app.unmount();
      expectReleased(stdin, refBalance);
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("the final demand restores Kitty and a later demand reuses confirmed support", async () => {
    const { stdin, refBalance } = makeTrackedStdin();
    const { stdout, writes } = makeTrackedStdout();
    const active = shallowRef(true);
    const { app } = mountInputApp({ stdin, stdout, active });

    try {
      stdin.write("\x1b[?1u");
      await settleLifecycle();
      expect(count(writes, "\x1b[>1u")).toBe(1);

      active.value = false;
      await settleLifecycle();
      expect(count(writes, "\x1b[<u")).toBe(1);
      expectReleased(stdin, refBalance);

      active.value = true;
      await settleLifecycle();
      expect(count(writes, "\x1b[?u")).toBe(1);
      expect(count(writes, "\x1b[>1u")).toBe(2);
    } finally {
      app.unmount();
      expect(count(writes, "\x1b[<u")).toBe(2);
      expectReleased(stdin, refBalance);
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("suspend releases and resume reacquires the confirmed protocol", async () => {
    const { stdin, refBalance } = makeTrackedStdin();
    const { stdout, writes } = makeTrackedStdout();
    const suspensionHost = createManualSuspensionHost();
    const { app } = mountInputApp({ stdin, stdout, suspensionHost });

    try {
      stdin.write("\x1b[?1u");
      await settleLifecycle();
      expect(count(writes, "\x1b[>1u")).toBe(1);

      await suspensionHost.suspend();
      expect(count(writes, "\x1b[<u")).toBe(1);
      expectReleased(stdin, refBalance);

      await suspensionHost.resume();
      await settleLifecycle();
      expect(count(writes, "\x1b[?u")).toBe(1);
      expect(count(writes, "\x1b[>1u")).toBe(2);
      expect(stdin.isRaw).toBe(true);
    } finally {
      app.unmount();
      expect(count(writes, "\x1b[<u")).toBe(2);
      expectReleased(stdin, refBalance);
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("a rejected query write rolls back managed input acquisition", async () => {
    const { stdin, rawModeCalls, refBalance } = makeTrackedStdin();
    const queryError = new Error("query write rejected");
    const { stdout } = makeTrackedStdout({
      fail(data) {
        if (data === "\x1b[?u") throw queryError;
      },
    });
    const { stdout: stderr } = makeTrackedStdout({ isTTY: false });
    const App = defineComponent(() => {
      useInput(() => {});
      return () => h("tui-text", null, "ready");
    });
    const app = createApp(App);
    app.config.warnHandler = () => {};
    app.config.errorHandler = () => {};

    const exited = app.waitUntilExit();
    expect(() =>
      app.mount(
        createInternalMountOptions({
          stdout,
          stderr,
          stdin,
          patchConsole: false,
          liveUpdates: true,
          maxFps: 0,
        }),
      ),
    ).toThrow(queryError);
    await expect(exited).rejects.toBe(queryError);
    await settleLifecycle();
    expect(rawModeCalls).toEqual([true, false]);
    expectReleased(stdin, refBalance);
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  });

  test("a rejected enable write preserves surrounding input and teardown cleanup", async () => {
    let rejectPush = false;
    const { stdin, refBalance } = makeTrackedStdin();
    const { stdout } = makeTrackedStdout({
      fail(data) {
        if (rejectPush && data === "\x1b[>1u") throw new Error("enable write rejected");
      },
    });
    const { stdout: stderr } = makeTrackedStdout({ isTTY: false });
    const { app, inputs } = mountInputApp({ stdin, stdout, stderr });

    try {
      rejectPush = true;
      expect(() => stdin.emit("data", "a\x1b[?1ub")).toThrow("enable write rejected");
      expect(inputs).toEqual(["a", "b"]);
    } finally {
      app.unmount();
      await settleLifecycle();
      expectReleased(stdin, refBalance);
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    }
  });

  test("the repository-only disabled override avoids a fake-host query", async () => {
    const { stdin, refBalance } = makeTrackedStdin();
    const { stdout, writes } = makeTrackedStdout();
    const { app, inputs } = mountInputApp({ stdin, stdout, kittyMode: "disabled" });

    try {
      stdin.write("x");
      await settleLifecycle();
      expect(inputs).toEqual(["x"]);
      expect(writes).not.toContain("\x1b[?u");
      expect(writes).not.toContain("\x1b[>1u");
    } finally {
      app.unmount();
      expectReleased(stdin, refBalance);
      stdin.destroy();
      stdout.destroy();
    }
  });
});
