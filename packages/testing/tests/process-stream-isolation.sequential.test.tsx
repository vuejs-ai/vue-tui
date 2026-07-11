// This test replaces process-global stream getters, so it must not run concurrently in one worker.
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Text } from "@vue-tui/runtime";
import { render, type RenderResult } from "../src/index.ts";

test.sequential("TTY and stream hosts never read real process streams", async () => {
  const stdoutDescriptor = Object.getOwnPropertyDescriptor(process, "stdout")!;
  const stderrDescriptor = Object.getOwnPropertyDescriptor(process, "stderr")!;
  const stdinDescriptor = Object.getOwnPropertyDescriptor(process, "stdin")!;
  const reads = { stdout: 0, stderr: 0, stdin: 0 };
  let tty: RenderResult | undefined;
  let stream: RenderResult | undefined;

  Object.defineProperties(process, {
    stdout: {
      ...stdoutDescriptor,
      get() {
        reads.stdout++;
        return stdoutDescriptor.get!.call(process);
      },
    },
    stderr: {
      ...stderrDescriptor,
      get() {
        reads.stderr++;
        return stderrDescriptor.get!.call(process);
      },
    },
    stdin: {
      ...stdinDescriptor,
      get() {
        reads.stdin++;
        return stdinDescriptor.get!.call(process);
      },
    },
  });

  try {
    const App = defineComponent(() => () => <Text>isolated</Text>);
    tty = await render(App);
    stream = await render(App, { host: { stdout: "stream" } });
    tty.dispose();
    stream.dispose();
  } finally {
    tty?.dispose();
    stream?.dispose();
    Object.defineProperties(process, {
      stdout: stdoutDescriptor,
      stderr: stderrDescriptor,
      stdin: stdinDescriptor,
    });
  }

  expect(reads).toEqual({ stdout: 0, stderr: 0, stdin: 0 });
});
