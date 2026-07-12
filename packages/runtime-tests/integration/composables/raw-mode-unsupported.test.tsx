import { PassThrough } from "node:stream";
import { nextTick, defineComponent, onMounted, onUnmounted } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useFocus, useInput, useStdin } from "@vue-tui/runtime";
import { makeFakeWritable } from "../lifecycle/test-streams.ts";

// Builds a stdin that is NOT a TTY, so isRawModeSupported is false. This mirrors
// piping input into a program (e.g. `echo x | node app.js`) where raw mode can't
// be enabled. Matches Ink's isRawModeSupported = stdin.isTTY check. The optional
// setRawMode spy lets a test assert the underlying ioctl is NEVER issued on an
// unsupported stdin (parity with Ink's test/components.tsx setRawMode-throw test).
function makeNonTtyStdin(setRawModeCalls?: boolean[]): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: false,
    setRawMode(this: NodeJS.ReadStream, mode: boolean) {
      setRawModeCalls?.push(mode);
      return this;
    },
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
    app.mount({ stdout, stdin, maxFps: 0, exitOnCtrlC: false });
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
  // Assert the FULL custom-stdin message (a non-process.stdin PassThrough hits the
  // "provided to Vue TUI" branch), so exact two-line parity with Ink's wording +
  // docs URL can't silently regress (mirrors Ink App.tsx:323-325).
  expect(error?.message).toBe(
    "Raw mode is not supported on the stdin provided to Vue TUI.\n" +
      "Read about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported",
  );
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

// Test C: the PUBLIC useStdin().setRawMode must be SYMMETRIC on a non-TTY stdin —
// BOTH setRawMode(true) (enable) AND setRawMode(false) (disable) throw the same
// descriptive error, and the underlying stdin.setRawMode ioctl is never issued.
// Mirrors Ink's test/components.tsx "setRawMode() should throw if raw mode is not
// supported" (asserts didCatchInMount === 1 AND didCatchInUnmount === 1 AND
// !stdin.setRawMode.called) and Ink's handleSetRawMode (App.tsx:317-327), which
// guards at the TOP, before the enable/disable split. Before the fix vue threw on
// the enable branch (acquireRawMode) but silently no-opped the disable branch
// (releaseRawMode's `if (!isRawModeSupported) return`) — an asymmetry Ink lacks.
test("useStdin().setRawMode is symmetric on a non-TTY: both enable AND disable throw", async () => {
  const setRawModeCalls: boolean[] = [];
  const enableErrors: Error[] = [];
  const disableErrors: Error[] = [];

  const App = defineComponent(() => {
    const { setRawMode } = useStdin();

    onMounted(() => {
      try {
        setRawMode(true);
      } catch (e) {
        enableErrors.push(e as Error);
      }
    });

    onUnmounted(() => {
      try {
        setRawMode(false);
      } catch (e) {
        disableErrors.push(e as Error);
      }
    });

    return () => <Text>test</Text>;
  });

  const stdout = makeFakeWritable();
  const stdin = makeNonTtyStdin(setRawModeCalls);

  const app = createApp(App);
  app.waitUntilExit().catch(() => {});
  app.mount({ stdout, stdin, maxFps: 0, exitOnCtrlC: false });
  await nextTick();
  app.unmount();
  await nextTick();

  const expectedMessage =
    "Raw mode is not supported on the stdin provided to Vue TUI.\n" +
    "Read about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported";

  // Enable path throws (this already held before the fix).
  expect(enableErrors).toHaveLength(1);
  expect(enableErrors[0]?.message).toBe(expectedMessage);

  // Disable path throws too (this is the fix: pre-fix it silently no-opped).
  expect(disableErrors).toHaveLength(1);
  expect(disableErrors[0]?.message).toBe(expectedMessage);

  // The underlying terminal ioctl is never issued — both throws short-circuit
  // before touching stdin.setRawMode (Ink: t.false(stdin.setRawMode.called)).
  expect(setRawModeCalls).toEqual([]);
});
