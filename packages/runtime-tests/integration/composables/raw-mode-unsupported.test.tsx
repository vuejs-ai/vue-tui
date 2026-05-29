import { PassThrough } from "node:stream";
import { nextTick, defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useFocus, useInput } from "@vue-tui/runtime";
import { makeFakeWritable } from "../lifecycle/test-streams.ts";

// Builds a stdin that is NOT a TTY, so isRawModeSupported is false. This mirrors
// piping input into a program (e.g. `echo x | node app.js`) where raw mode can't
// be enabled. Matches Ink's isRawModeSupported = stdin.isTTY check.
function makeNonTtyStdin(): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: false,
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
  });
  (s as { ref?: () => void }).ref = () => {};
  (s as { unref?: () => void }).unref = () => {};
  return s;
}

// Mounts a component against a non-TTY stdin and resolves with any error that
// surfaces through the app's exit promise (the error-boundary → exit path the
// testing render() helper relies on), or undefined if it mounts cleanly.
async function mountNonTtyAndCaptureError(component: Parameters<typeof createApp>[0]): Promise<{
  error: Error | undefined;
  unmount: () => void;
}> {
  const stdout = makeFakeWritable();
  const stdin = makeNonTtyStdin();

  const app = createApp(component);

  let error: Error | undefined;
  app.waitUntilExit().catch((e) => {
    error = e as Error;
  });

  try {
    app.mount({ stdout, stdin, debug: true, exitOnCtrlC: false });
  } catch (e) {
    error = e as Error;
  }

  // Flush the Vue queue so the error boundary → nextTick → exit → reject chain runs.
  await nextTick();
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((r) => setImmediate(r));
  await Promise.resolve();

  return { error, unmount: () => app.unmount() };
}

// Test A: useInput on an unsupported stdin must surface Ink's descriptive error.
test("useInput on a non-TTY stdin throws a descriptive raw-mode error", async () => {
  const App = defineComponent(() => {
    useInput(() => {});
    return () => <Text>listening</Text>;
  });

  const { error, unmount } = await mountNonTtyAndCaptureError(App);
  unmount();

  expect(error).toBeInstanceOf(Error);
  expect(error?.message).toContain("Raw mode is not supported on the stdin provided");
  expect(error?.message).toContain("https://github.com/vadimdemedes/ink/#israwmodesupported");
});

// Test B (regression): useFocus must guard like Ink's use-focus.ts and NOT throw
// on a non-TTY stdin. This guards against over-throwing in the acquire chokepoint.
test("useFocus on a non-TTY stdin does not throw (graceful no-op)", async () => {
  const App = defineComponent(() => {
    useFocus();
    return () => <Text>focusable</Text>;
  });

  const { error, unmount } = await mountNonTtyAndCaptureError(App);
  unmount();

  expect(error).toBeUndefined();
});
