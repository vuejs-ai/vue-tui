import { expect, test } from "vite-plus/test";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { useMouseDrag, useMouseEvent } from "@vue-tui/runtime/fullscreen";
import { defineComponent, h, nextTick, shallowRef, type ComponentPublicInstance } from "vue";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "./lifecycle/test-streams.ts";

const SGR_MOUSE_ENABLE = "\x1b[?1000h\x1b[?1006h";
const SGR_MOUSE_DISABLE = "\x1b[?1000l\x1b[?1006l";
const SGR_DRAG_ENABLE = "\x1b[?1002h\x1b[?1006h";
const SGR_BUTTON_TO_DRAG = SGR_MOUSE_DISABLE + SGR_DRAG_ENABLE;
const SGR_UNCERTAIN_CLEANUP = "\x1b[?1002l\x1b[?1000l\x1b[?1006l";

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

test("SGR mouse replacement disables every possibly owned mode when stdout throws after the write", async () => {
  const previousTerm = process.env["TERM"];
  process.env["TERM"] = "xterm-256color";
  const { stream: stdin } = makeFakeStdin();
  const input = stdin as WritableTestStdin;
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const writes = captureWrites(stdout);
  const dragActive = shallowRef(false);
  let refBalance = 0;
  let failReplacement = false;
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
  stdout.write = ((...args: unknown[]) => {
    const value = String(args[0]);
    const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    if (failReplacement && value === SGR_BUTTON_TO_DRAG) {
      failReplacement = false;
      throw new Error("replacement failed after write");
    }
    return result;
  }) as NodeJS.WriteStream["write"];
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "click", () => "continue");
    useMouseDrag(target, () => {}, { isActive: dragActive });
    return () =>
      h(
        Box,
        { ref: target },
        {
          default: () => h(Text, null, { default: () => "x" }),
        },
      );
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
    await waitForWrite(writes, SGR_MOUSE_ENABLE);
    failReplacement = true;
    dragActive.value = true;
    await expect(flushRenderedTarget()).rejects.toThrow("replacement failed after write");

    const output = writes.join("");
    const replacementIndex = output.indexOf(SGR_BUTTON_TO_DRAG);
    const cleanupIndex = output.indexOf(
      SGR_UNCERTAIN_CLEANUP,
      replacementIndex + SGR_BUTTON_TO_DRAG.length,
    );
    expect(replacementIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBeGreaterThan(replacementIndex);
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
