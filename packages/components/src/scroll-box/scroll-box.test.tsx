import { PassThrough } from "node:stream";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text } from "@vue-tui/runtime";
import { ScrollBox } from "../index.ts";

const WHEEL_UP = "\x1b[<64;1;1M";
const ENABLE_SGR_MOUSE = "\x1b[?1000h\x1b[?1006h";
const DISABLE_SGR_MOUSE = "\x1b[?1000l\x1b[?1006l";

function messages(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `message ${index}`);
}

function makeFakeWritable(options: { columns?: number; rows?: number } = {}): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, {
    columns: options.columns ?? 100,
    rows: options.rows ?? 100,
    isTTY: true,
  });
  return stream;
}

function makeFakeStdin(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: true,
    setRawMode(this: NodeJS.ReadStream) {
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

function captureWrites(stdout: NodeJS.WriteStream): string[] {
  const writes: string[] = [];
  stdout.on("data", (chunk: Buffer | string) => {
    writes.push(String(chunk));
  });
  return writes;
}

async function flushRender(): Promise<void> {
  await nextTick();
  await nextTick();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("ScrollBox follows the bottom while sticky", async () => {
  const items = shallowRef(messages(8));
  const App = defineComponent(() => {
    return () => (
      <Box height={4} width={20}>
        <ScrollBox>
          {items.value.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </ScrollBox>
      </Box>
    );
  });

  const { lastFrame, waitUntilRenderFlush } = await render(App, { columns: 40, rows: 8 });
  expect(lastFrame()).toContain("message 7");

  items.value = [...items.value, "streaming latest"];
  await nextTick();
  await waitUntilRenderFlush();

  expect(lastFrame()).toContain("streaming latest");
});

test("ScrollBox keeps the viewport detached after mouse wheel scroll while content grows", async () => {
  const items = shallowRef(messages(12));
  const App = defineComponent(() => {
    return () => (
      <Box height={4} width={20}>
        <ScrollBox>
          {items.value.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </ScrollBox>
      </Box>
    );
  });

  const { lastFrame, stdin, waitUntilRenderFlush } = await render(App, { columns: 40, rows: 8 });
  expect(lastFrame()).toContain("message 11");

  await stdin.write(WHEEL_UP);
  await waitUntilRenderFlush();
  const scrolledFrame = lastFrame()!;
  const anchor = scrolledFrame.match(/message \d+/)?.[0];
  expect(anchor).toBeDefined();
  expect(scrolledFrame).not.toContain("message 11");

  items.value = [...items.value, "streaming latest"];
  await nextTick();
  await waitUntilRenderFlush();

  const updatedFrame = lastFrame()!;
  expect(updatedFrame).toContain(anchor);
  expect(updatedFrame).not.toContain("streaming latest");
});

test("ScrollBox enables SGR mouse mode while mounted", async () => {
  const App = defineComponent(() => {
    return () => (
      <ScrollBox>
        <Text>content</Text>
      </ScrollBox>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const stdin = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stdin, stderr, interactive: true, exitOnCtrlC: false });
  await flushRender();

  expect(writes.join("")).toContain(ENABLE_SGR_MOUSE);

  app.unmount();
  await flushRender();

  expect(writes.join("")).toContain(DISABLE_SGR_MOUSE);
});
