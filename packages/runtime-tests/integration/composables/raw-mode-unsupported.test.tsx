import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, createApp, Text, useInput, useStdin } from "@vue-tui/runtime";
import { makeFakeWritable } from "../lifecycle/test-streams.ts";

// Mirrors a normal pipe: readable bytes may exist, but there is no raw-mode API.
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

function captureData(stream: NodeJS.WriteStream): string[] {
  const data: string[] = [];
  stream.on("data", (chunk: Buffer) => {
    if (chunk.length > 0) data.push(chunk.toString());
  });
  return data;
}

test("useStdin exposes the exact non-TTY stream without claiming raw-mode support", () => {
  const stdout = makeFakeWritable();
  const stdin = makeNonTtyStdin();
  let observed: ReturnType<typeof useStdin> | undefined;
  const App = defineComponent(() => {
    observed = useStdin();
    return () => <Text>stdin identity</Text>;
  });

  const app = createApp(App);
  app.mount({ stdout, stdin });
  try {
    expect(observed?.stdin).toBe(stdin);
    expect(Reflect.ownKeys(observed!)).toEqual(["stdin", "isRawModeSupported", "setRawMode"]);
    expect(observed?.isRawModeSupported).toBe(false);
    expect(() => observed?.setRawMode(true)).toThrow(
      "Raw mode is unavailable because Runtime cannot control the mounted stdin.",
    );
    expect(() => observed?.setRawMode(false)).not.toThrow();
    expect(observed).not.toHaveProperty("acquireRawMode");
    expect(observed).not.toHaveProperty("internal_inputRouting");
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
  }
});

test("useInput uses a provided raw-mode API without requiring an isTTY marker", async () => {
  const stdout = makeFakeWritable();
  const stdin = makeNonTtyStdin();
  const rawModeCalls: boolean[] = [];
  stdin.setRawMode = (mode: boolean) => {
    rawModeCalls.push(mode);
    return stdin;
  };
  const app = createApp(
    defineComponent(() => {
      useInput(() => {});
      return () => <Text>structural raw mode</Text>;
    }),
  );

  app.mount({ stdout, stdin });
  expect(rawModeCalls).toEqual([true]);
  app.unmount();
  await expect(app.waitUntilExit()).resolves.toBeUndefined();
  expect(rawModeCalls).toEqual([true, false]);
  stdin.destroy();
  stdout.destroy();
});

test("useInput reads available non-TTY stdin without requiring raw mode", async () => {
  const stdout = makeFakeWritable();
  const stdin = makeNonTtyStdin();
  const inputs: string[] = [];
  const App = defineComponent(() => {
    useInput((event) => {
      if (event.type === "text") inputs.push(event.text);
    });
    return () => <Text>listening</Text>;
  });
  const app = createApp(App);

  app.mount({ stdout, stdin });
  stdin.write("x");
  await new Promise<void>((resolve) => setImmediate(resolve));

  expect(inputs).toEqual(["x"]);
  app.unmount();
  await expect(app.waitUntilExit()).resolves.toBeUndefined();
  stdin.destroy();
  stdout.destroy();
});

test.each(["inline", "fullscreen"] as const)(
  "active semantic input on a non-TTY reads data without acquiring %s terminal resources",
  async (mode) => {
    const refCalls: string[] = [];
    const stdin = makeNonTtyStdin();
    stdin.ref = () => {
      refCalls.push("ref");
      return stdin;
    };
    stdin.unref = () => {
      refCalls.push("unref");
      return stdin;
    };
    const stdout = makeFakeWritable();
    const stderr = makeFakeWritable();
    const stdoutData = captureData(stdout);
    const stderrData = captureData(stderr);
    const inputs: string[] = [];
    const Input = defineComponent(() => {
      useInput((event) => {
        if (event.type === "text") inputs.push(event.text);
      });
      return () => <Text>late</Text>;
    });
    const App = defineComponent(() => {
      return () => (
        <Box>
          <Text>before</Text>
          <Input />
        </Box>
      );
    });
    const app = createApp(App);
    app.config.warnHandler = () => {};

    app.mount({ mode, stdout, stderr, stdin, patchConsole: false });
    stdin.write("x");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(inputs).toEqual(["x"]);
    expect(refCalls).toEqual([]);
    expect(stdin.listenerCount("data")).toBeGreaterThan(0);
    expect(stdoutData.join("")).not.toContain("\x1b[?2004h");
    expect(stdoutData.join("")).not.toContain("\x1b[?u");
    expect(stderrData).toEqual([]);
    app.unmount();
    await expect(app.waitUntilExit()).resolves.toBeUndefined();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  },
);
