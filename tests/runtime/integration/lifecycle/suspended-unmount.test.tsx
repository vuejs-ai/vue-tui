import { PassThrough } from "node:stream";
import ansiEscapes from "ansi-escapes";
import { defineComponent, onUnmounted } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import {
  INTERNAL_KITTY_KEYBOARD,
  INTERNAL_SUSPENSION_HOST,
  createInternalMountOptions,
  createManualSuspensionHost,
  useStdout,
} from "../../../../packages/runtime/dist/internal.mjs";

function makeInput(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {},
    unref() {},
  });
  return stream;
}

function makeOutput(columns: number, rows: number): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { columns, rows, isTTY: true });
  return stream;
}

// Teardown releases a suspended session without reacquiring the terminal or
// waiting for console output that cannot run until resume.
test("unmounting a suspended Fullscreen session releases without terminal writes", async () => {
  const App = defineComponent(() => {
    const { write } = useStdout();
    onUnmounted(() => {
      write("goodbye from an unmount hook\n");
    });
    return () => <Text>hello</Text>;
  });

  const stdin = makeInput();
  const stdout = makeOutput(20, 4);
  const stderr = makeOutput(20, 4);
  const writes: string[] = [];
  stdout.on("data", (chunk: Buffer) => writes.push(chunk.toString()));
  const suspensionHost = createManualSuspensionHost();
  const app = createApp(App);

  app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      mode: "fullscreen",
      maxFps: 0,
      patchConsole: true,
      [INTERNAL_KITTY_KEYBOARD]: { mode: "disabled" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    }),
  );
  await app.waitUntilRenderFlush();
  await suspensionHost.suspend();

  const afterSuspend = writes.length;
  console.log("queued while suspended");
  app.unmount();
  await app.waitUntilExit();

  const duringTeardown = writes.slice(afterSuspend).join("");
  expect(duringTeardown).not.toContain(ansiEscapes.enterAlternativeScreen);
  expect(duringTeardown).not.toContain("goodbye from an unmount hook");
  expect(duringTeardown).not.toContain("queued while suspended");
});
