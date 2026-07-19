import { expect, test } from "vite-plus/test";
import { Text, createApp } from "@vue-tui/runtime";
import { useMouseEvent } from "@vue-tui/runtime/fullscreen";
import { defineComponent, h, nextTick, shallowRef, type ComponentPublicInstance } from "vue";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "./lifecycle/test-streams.ts";

const SGR_MOUSE_ENABLE = "\x1b[?1000h\x1b[?1006h";
const SGR_MOUSE_DISABLE = "\x1b[?1000l\x1b[?1006l";

type WritableTestStdin = NodeJS.ReadStream & {
  write(chunk: string | Uint8Array): boolean;
  isRaw?: boolean;
  setRawMode(mode: boolean): NodeJS.ReadStream;
};

const flushInput = () => new Promise<void>((resolve) => setImmediate(resolve));

async function flushRenderedTarget(): Promise<void> {
  await nextTick();
  await nextTick();
  await flushInput();
  await nextTick();
  await flushInput();
}

async function waitForWrite(writes: readonly string[], expected: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (writes.join("").includes(expected)) return;
    await nextTick();
    await flushInput();
  }
  throw new Error(
    `Timed out waiting for terminal write ${JSON.stringify(expected)}; writes=${JSON.stringify(writes)}`,
  );
}

test("SGR mouse enable restores the terminal when stdout throws after the write", async () => {
  const previousTerm = process.env["TERM"];
  process.env["TERM"] = "xterm-256color";
  const { stream: stdin } = makeFakeStdin();
  const input = stdin as WritableTestStdin;
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const writes = captureWrites(stdout);
  const active = shallowRef(false);
  let refBalance = 0;
  let failEnable = false;
  input.isRaw = false;
  input.setRawMode = (mode: boolean) => {
    input.isRaw = mode;
    return stdin;
  };
  stdin.ref = () => {
    refBalance++;
    return stdin;
  };
  stdin.unref = () => {
    refBalance--;
    return stdin;
  };
  const originalWrite = stdout.write.bind(stdout);
  const enableError = new Error("enable failed after write");
  stdout.write = ((...args: unknown[]) => {
    const value = String(args[0]);
    const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    if (failEnable && value === SGR_MOUSE_ENABLE) {
      failEnable = false;
      throw enableError;
    }
    return result;
  }) as NodeJS.WriteStream["write"];
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "wheel", () => "continue", { isActive: active });
    return () => h(Text, { ref: target }, () => "x");
  });
  const app = createApp(App);
  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      mode: "fullscreen",
      kittyKeyboard: { mode: "disabled" },
    });
    await waitForWrite(writes, "x");
    const exited = app.waitUntilExit();
    failEnable = true;
    active.value = true;
    await flushRenderedTarget();
    await expect(exited).rejects.toBe(enableError);

    expect(
      writes.filter((value) => value === SGR_MOUSE_ENABLE || value === SGR_MOUSE_DISABLE),
    ).toEqual([SGR_MOUSE_ENABLE, SGR_MOUSE_DISABLE]);
    expect({
      isRaw: input.isRaw,
      refBalance,
      dataListeners: stdin.listenerCount("data"),
    }).toEqual({ isRaw: false, refBalance: 0, dataListeners: 0 });
  } finally {
    app.unmount();
    await app.waitUntilExit().catch(() => {});
    if (previousTerm === undefined) delete process.env["TERM"];
    else process.env["TERM"] = previousTerm;
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
