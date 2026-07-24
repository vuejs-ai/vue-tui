import { PassThrough } from "node:stream";
import { defineComponent, nextTick, onScopeDispose, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import {
  createApp,
  renderToString,
  Text,
  useInput,
  useStdin,
  type UseStdinReturn,
} from "@vue-tui/runtime";
import {
  createManualSuspensionHost,
  createInternalMountOptions,
  INTERNAL_KITTY_KEYBOARD,
  INTERNAL_SUSPENSION_HOST,
  type InternalMountOptions,
  type InternalMountOptionsInput,
} from "../../../runtime/dist/internal.mjs";
import { captureWrites, makeFakeWritable } from "../lifecycle/test-streams.ts";

const PASTE_ON = "\x1b[?2004h";
const PASTE_OFF = "\x1b[?2004l";

function makeTrackedStdin(): {
  readonly stream: NodeJS.ReadStream;
  readonly rawModeCalls: boolean[];
  readonly setEncodingCalls: unknown[];
  readonly refBalance: () => number;
} {
  const rawModeCalls: boolean[] = [];
  const setEncodingCalls: unknown[] = [];
  let refs = 0;
  const stream = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: typeof stream, enabled: boolean) {
      rawModeCalls.push(enabled);
      this.isRaw = enabled;
      return this;
    },
    setEncoding(this: NodeJS.ReadStream, encoding: unknown) {
      setEncodingCalls.push(encoding);
      return this;
    },
    ref() {
      refs++;
    },
    unref() {
      refs--;
    },
  });
  return { stream, rawModeCalls, setEncodingCalls, refBalance: () => refs };
}

function disabledKittyOptions(options: InternalMountOptionsInput): InternalMountOptions {
  return createInternalMountOptions({
    ...options,
    [INTERNAL_KITTY_KEYBOARD]: { mode: "disabled" },
  });
}

async function settle(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
}

test("useStdin returns only the exact stream, raw capability, and an independent setter", () => {
  const stdout = makeFakeWritable();
  const { stream: stdin } = makeTrackedStdin();
  let observed: UseStdinReturn | undefined;
  const App = defineComponent(() => {
    observed = useStdin();
    return () => <Text>stdin</Text>;
  });
  const app = createApp(App);
  app.mount(disabledKittyOptions({ stdout, stdin, patchConsole: false }));

  expect(observed?.stdin).toBe(stdin);
  expect(Reflect.ownKeys(observed!)).toEqual(["stdin", "isRawModeSupported", "setRawMode"]);
  expect(observed?.isRawModeSupported).toBe(true);
  expect(observed).not.toHaveProperty("acquireRawMode");
  expect(observed).not.toHaveProperty("internal_inputRouting");

  app.unmount();
  stdin.destroy();
  stdout.destroy();
});

test.each([
  ["Inline", undefined],
  ["Fullscreen", "fullscreen"],
] as const)(
  "raw-only use in %s neither starts managed parsing nor negotiates input protocols",
  async (_label, mode) => {
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const { stream: stdin, rawModeCalls, setEncodingCalls, refBalance } = makeTrackedStdin();
    const directChunks: string[] = [];
    let raw: UseStdinReturn | undefined;
    const onData = (chunk: Buffer | string) => directChunks.push(chunk.toString());
    const App = defineComponent(() => {
      raw = useStdin();
      raw.setRawMode(true);
      raw.stdin.on("data", onData);
      onScopeDispose(() => raw!.stdin.off("data", onData));
      return () => <Text>raw</Text>;
    });
    const app = createApp(App);
    app.mount({ stdout, stdin, patchConsole: false, mode });

    expect(rawModeCalls).toEqual([true]);
    expect(refBalance()).toBe(1);
    expect(stdin.listenerCount("data")).toBe(1);
    expect(setEncodingCalls).toEqual([]);
    expect(writes.join("")).not.toContain(PASTE_ON);
    expect(writes.join("")).not.toContain("\x1b[?u");

    (stdin as unknown as PassThrough).write("direct");
    await settle();
    expect(directChunks).toEqual(["direct"]);

    raw!.setRawMode(false);
    await settle();
    expect(rawModeCalls).toEqual([true, false]);
    expect(refBalance()).toBe(0);
    expect(stdin.listenerCount("data")).toBe(1);

    app.unmount();
    expect(stdin.listenerCount("data")).toBe(0);
    expect(writes.join("")).not.toContain(PASTE_OFF);
    expect(writes.join("")).not.toMatch(/\x1b\[>\d+u/);
    expect(writes.join("")).not.toContain("\x1b[<u");
    stdin.destroy();
    stdout.destroy();
  },
);

test("two hook calls cannot release one another and repeated booleans are idempotent", async () => {
  const stdout = makeFakeWritable();
  const { stream: stdin, rawModeCalls, refBalance } = makeTrackedStdin();
  const handles: UseStdinReturn[] = [];
  const App = defineComponent(() => {
    handles.push(useStdin(), useStdin());
    return () => <Text>two raw owners</Text>;
  });
  const app = createApp(App);
  app.mount(disabledKittyOptions({ stdout, stdin, patchConsole: false }));

  handles[0]!.setRawMode(false);
  handles[0]!.setRawMode(true);
  handles[0]!.setRawMode(true);
  handles[1]!.setRawMode(true);
  expect(rawModeCalls).toEqual([true]);
  expect(refBalance()).toBe(1);

  handles[0]!.setRawMode(false);
  await settle();
  expect(rawModeCalls).toEqual([true]);
  expect(refBalance()).toBe(1);

  handles[1]!.setRawMode(false);
  await settle();
  expect(rawModeCalls).toEqual([true, false]);
  expect(refBalance()).toBe(0);

  app.unmount();
  stdin.destroy();
  stdout.destroy();
});

test("one hook remains idempotent when the host re-enters its setter during acquisition", async () => {
  const stdout = makeFakeWritable();
  const { stream: stdin, rawModeCalls, refBalance } = makeTrackedStdin();
  const originalSetRawMode = stdin.setRawMode.bind(stdin);
  let raw: UseStdinReturn | undefined;
  let reentered = false;
  stdin.setRawMode = (enabled: boolean) => {
    const result = originalSetRawMode(enabled);
    if (enabled && !reentered) {
      reentered = true;
      raw!.setRawMode(true);
    }
    return result;
  };
  const App = defineComponent(() => {
    raw = useStdin();
    return () => <Text>reentrant raw owner</Text>;
  });
  const app = createApp(App);
  app.mount(disabledKittyOptions({ stdout, stdin, patchConsole: false }));

  raw!.setRawMode(true);
  expect(rawModeCalls).toEqual([true]);
  expect(refBalance()).toBe(1);

  raw!.setRawMode(false);
  await settle();
  expect(rawModeCalls).toEqual([true, false]);
  expect(refBalance()).toBe(0);

  app.unmount();
  stdin.destroy();
  stdout.destroy();
});

test("two apps sharing stdin keep public raw mode until the final owner releases", async () => {
  const stdoutA = makeFakeWritable();
  const stdoutB = makeFakeWritable();
  const { stream: stdin, rawModeCalls, refBalance } = makeTrackedStdin();
  const handles: UseStdinReturn[] = [];
  const App = defineComponent(() => {
    const raw = useStdin();
    raw.setRawMode(true);
    handles.push(raw);
    return () => <Text>shared raw owner</Text>;
  });
  const appA = createApp(App);
  const appB = createApp(App);
  appA.mount(disabledKittyOptions({ stdout: stdoutA, stdin, patchConsole: false }));
  appB.mount(disabledKittyOptions({ stdout: stdoutB, stdin, patchConsole: false }));

  expect(rawModeCalls).toEqual([true]);
  expect(refBalance()).toBe(1);
  expect(stdin.listenerCount("data")).toBe(0);

  appA.unmount();
  await settle();
  expect(rawModeCalls).toEqual([true]);
  expect(refBalance()).toBe(1);

  appB.unmount();
  expect(rawModeCalls).toEqual([true, false]);
  expect(refBalance()).toBe(0);

  handles[0]!.setRawMode(true);
  handles[1]!.setRawMode(true);
  await settle();
  expect(rawModeCalls).toEqual([true, false]);
  expect(refBalance()).toBe(0);

  stdin.destroy();
  stdoutA.destroy();
  stdoutB.destroy();
});

test("a failed public raw acquisition rolls back and the same hook can retry", async () => {
  const stdout = makeFakeWritable();
  const { stream: stdin, rawModeCalls, refBalance } = makeTrackedStdin();
  const originalSetRawMode = stdin.setRawMode.bind(stdin);
  let rejectFirstEnable = true;
  stdin.setRawMode = (enabled: boolean) => {
    if (enabled && rejectFirstEnable) {
      rejectFirstEnable = false;
      throw new Error("raw enable failed");
    }
    return originalSetRawMode(enabled);
  };
  let raw: UseStdinReturn | undefined;
  const App = defineComponent(() => {
    raw = useStdin();
    return () => <Text>retry raw</Text>;
  });
  const app = createApp(App);
  app.mount(disabledKittyOptions({ stdout, stdin, patchConsole: false }));

  expect(() => raw!.setRawMode(true)).toThrow("raw enable failed");
  expect(rawModeCalls).toEqual([false]);
  expect(refBalance()).toBe(0);

  raw!.setRawMode(true);
  expect(rawModeCalls).toEqual([false, true]);
  expect(refBalance()).toBe(1);
  raw!.setRawMode(false);
  await settle();
  expect(rawModeCalls).toEqual([false, true, false]);
  expect(refBalance()).toBe(0);

  app.unmount();
  stdin.destroy();
  stdout.destroy();
});

test("public raw mode preserves an externally pre-raw stream baseline", async () => {
  const stdout = makeFakeWritable();
  const { stream: stdin, rawModeCalls, refBalance } = makeTrackedStdin();
  (stdin as NodeJS.ReadStream & { isRaw: boolean }).isRaw = true;
  let raw: UseStdinReturn | undefined;
  const App = defineComponent(() => {
    raw = useStdin();
    raw.setRawMode(true);
    return () => <Text>borrowed raw</Text>;
  });
  const app = createApp(App);
  app.mount(disabledKittyOptions({ stdout, stdin, patchConsole: false }));

  expect(rawModeCalls).toEqual([]);
  expect(refBalance()).toBe(1);
  raw!.setRawMode(false);
  await settle();
  expect(rawModeCalls).toEqual([]);
  expect(refBalance()).toBe(0);
  expect((stdin as NodeJS.ReadStream & { isRaw: boolean }).isRaw).toBe(true);

  app.unmount();
  stdin.destroy();
  stdout.destroy();
});

test("a public raw hold survives managed-input deactivation without retaining its parser", async () => {
  const stdout = makeFakeWritable();
  const writes = captureWrites(stdout);
  const { stream: stdin, rawModeCalls, refBalance } = makeTrackedStdin();
  const active = shallowRef(true);
  let raw: UseStdinReturn | undefined;
  const App = defineComponent(() => {
    raw = useStdin();
    raw.setRawMode(true);
    useInput(() => {}, { isActive: active });
    return () => <Text>composed input</Text>;
  });
  const app = createApp(App);
  app.mount(disabledKittyOptions({ stdout, stdin, patchConsole: false }));

  expect(rawModeCalls).toEqual([true]);
  expect(stdin.listenerCount("data")).toBe(1);
  expect(writes.join("")).toContain(PASTE_ON);

  active.value = false;
  await settle();
  expect(rawModeCalls).toEqual([true]);
  expect(refBalance()).toBe(1);
  expect(stdin.listenerCount("data")).toBe(0);
  expect(writes.join("")).toContain(PASTE_OFF);

  raw!.setRawMode(false);
  await settle();
  expect(rawModeCalls).toEqual([true, false]);
  expect(refBalance()).toBe(0);

  app.unmount();
  stdin.destroy();
  stdout.destroy();
});

test("suspension restores and resume reacquires a surviving public raw hold", async () => {
  const stdout = makeFakeWritable();
  const { stream: stdin, rawModeCalls, refBalance } = makeTrackedStdin();
  const suspension = createManualSuspensionHost();
  const App = defineComponent(() => {
    useStdin().setRawMode(true);
    return () => <Text>suspend raw</Text>;
  });
  const app = createApp(App);
  app.mount(
    disabledKittyOptions({
      stdout,
      stdin,
      patchConsole: false,
      [INTERNAL_SUSPENSION_HOST]: suspension,
    }),
  );

  expect(rawModeCalls).toEqual([true]);
  await suspension.suspend();
  expect(rawModeCalls).toEqual([true, false]);
  expect(refBalance()).toBe(0);
  await suspension.resume();
  expect(rawModeCalls).toEqual([true, false, true]);
  expect(refBalance()).toBe(1);

  app.unmount();
  expect(rawModeCalls).toEqual([true, false, true, false]);
  expect(refBalance()).toBe(0);
  stdin.destroy();
  stdout.destroy();
});

test("string rendering supplies one isolated inert Readable and disables retained setters", () => {
  let raw: UseStdinReturn | undefined;
  const App = defineComponent(() => {
    raw = useStdin();
    raw.setRawMode(true);
    return () => <Text>string stdin</Text>;
  });

  expect(renderToString(App)).toBe("string stdin");
  expect(raw?.stdin).not.toBe(process.stdin);
  expect(raw?.isRawModeSupported).toBe(false);
  expect(Reflect.ownKeys(raw!)).toEqual(["stdin", "isRawModeSupported", "setRawMode"]);
  expect(raw?.stdin.destroyed).toBe(true);
  expect(() => raw!.setRawMode(true)).not.toThrow();
});

test("string-render failure still disposes the inert stdin and its hook scope", () => {
  let raw: UseStdinReturn | undefined;
  const Boom = defineComponent(() => {
    raw = useStdin();
    raw.setRawMode(true);
    throw new Error("string stdin failure");
  });

  expect(() => renderToString(Boom)).toThrow("string stdin failure");
  expect(raw?.stdin).not.toBe(process.stdin);
  expect(raw?.stdin.destroyed).toBe(true);
  expect(() => raw!.setRawMode(true)).not.toThrow();
});
