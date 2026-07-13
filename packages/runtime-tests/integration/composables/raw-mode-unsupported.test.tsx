import { PassThrough } from "node:stream";
import { nextTick, defineComponent, shallowRef, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, createApp, Text, useFocus, useInput, useStdin } from "@vue-tui/runtime";
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
    app.mount({ stdout, stdin, maxFps: 0 });
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

test("useStdin exposes only the exact custom stream mounted into the application", () => {
  const stdout = makeFakeWritable();
  const stdin = makeNonTtyStdin();
  let observed: ReturnType<typeof useStdin> | undefined;
  const App = defineComponent(() => {
    observed = useStdin();
    return () => <Text>stdin identity</Text>;
  });

  const app = createApp(App);
  app.mount({ stdout, stdin, maxFps: 0 });
  try {
    expect(observed?.stdin).toBe(stdin);
    expect(Reflect.ownKeys(observed!)).toEqual(["stdin"]);
    expect(observed).not.toHaveProperty("setRawMode");
    expect(observed).not.toHaveProperty("isRawModeSupported");
    expect(observed).not.toHaveProperty("acquireRawMode");
    expect(observed).not.toHaveProperty("internal_routes");
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
  }
});

test("useInput on a non-TTY stdin explains the managed-input boundary", async () => {
  const App = defineComponent(() => {
    useInput(() => "continue");
    return () => <Text>listening</Text>;
  });

  const { error, unmount } = await mountNonTtyAndCaptureError(App);
  unmount();

  expect(error).toBeInstanceOf(Error);
  expect(error?.message).toBe(
    "Managed input is unavailable because the mounted stdin is not a controllable TTY.\n" +
      "Read raw bytes through useStdin().stdin, or mount a controllable TTY to use vue-tui input handlers.",
  );
});

test("active semantic input on a non-TTY publishes no route, listener, ref, or terminal mode", async () => {
  const setRawModeCalls: boolean[] = [];
  const refCalls: string[] = [];
  const stdin = makeNonTtyStdin(setRawModeCalls);
  stdin.ref = () => {
    refCalls.push("ref");
    return stdin;
  };
  stdin.unref = () => {
    refCalls.push("unref");
    return stdin;
  };
  const stdout = makeFakeWritable();
  const writes: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => writes.push(chunk.toString()));
  const App = defineComponent(() => {
    useInput(() => "continue");
    return () => <Text>paste</Text>;
  });
  const app = createApp(App);

  app.mount({ stdout, stdin, maxFps: 0 });
  await expect(app.waitUntilExit()).rejects.toThrow(
    "Managed input is unavailable because the mounted stdin is not a controllable TTY",
  );

  expect(setRawModeCalls).toEqual([]);
  expect(refCalls).toEqual([]);
  expect(stdin.listenerCount("data")).toBe(0);
  expect(writes.join("")).not.toContain("\x1b[?2004h");
  app.unmount();
  stdin.destroy();
  stdout.destroy();
});

test("a rendered sequential focus target fails fast on a non-TTY stdin", async () => {
  const App = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    useFocus(host);
    return () => (
      <Box ref={host}>
        <Text>focusable</Text>
      </Box>
    );
  });

  const { error, unmount } = await mountNonTtyAndCaptureError(App);
  unmount();

  expect(error).toBeInstanceOf(Error);
  expect(error?.message).toContain(
    "Managed input is unavailable because the mounted stdin is not a controllable TTY",
  );
});
