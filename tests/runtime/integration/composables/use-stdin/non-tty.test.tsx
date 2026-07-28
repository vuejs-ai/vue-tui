import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useStdin } from "@vue-tui/runtime";
import { makeFakeWritable } from "../../lifecycle/test-streams.ts";

function makeNonTtyStdin(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: false,
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
  });
  stream.ref = () => stream;
  stream.unref = () => stream;
  return stream;
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
