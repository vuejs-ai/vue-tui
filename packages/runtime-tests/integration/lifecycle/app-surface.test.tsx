import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { createTestHostBridge } from "@vue-tui/runtime/internal/testing";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

function createExposedRoot() {
  return defineComponent({
    props: {
      answer: {
        type: Number,
        required: true,
      },
    },
    setup(props, { expose }) {
      const ping = () => `pong:${props.answer}`;
      expose({ ping });
      return () => <Text>root</Text>;
    },
  });
}

test("mount returns the actual user root component instance", async () => {
  const Root = createExposedRoot();
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  Object.assign(stdout, { isTTY: false });
  Object.assign(stderr, { isTTY: false });
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root, { answer: 42 });

  const instance = app.mount({ stdin, stdout, stderr, patchConsole: false }) as unknown as {
    ping(): string;
  };

  expect(instance.ping()).toBe("pong:42");
  app.unmount();
  await app.waitUntilExit();
});

test("the test host bridge forwards the actual user root instance", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(createExposedRoot(), { answer: 7 });
  const bridge = createTestHostBridge();

  const instance = bridge.mount(app, {
    stdin,
    stdout,
    stderr,
    patchConsole: false,
  }) as unknown as { ping(): string };

  expect(instance.ping()).toBe("pong:7");
  app.unmount();
  await app.waitUntilExit();
});
