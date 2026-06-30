import { PassThrough } from "node:stream";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { ScrollBox } from "../index.ts";

const WHEEL_UP = "\x1b[<64;1;1M";

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

function makeNonTtyStdin(setRawModeCalls?: boolean[]): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: false,
    setRawMode(this: NodeJS.ReadStream, mode: boolean) {
      setRawModeCalls?.push(mode);
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

async function flushAppErrors(): Promise<void> {
  await nextTick();
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
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

  const result = await render(App, { columns: 40, rows: 8 });
  try {
    expect(result.lastFrame()).toContain("message 7");

    items.value = [...items.value, "streaming latest"];
    await nextTick();
    await result.waitUntilRenderFlush();

    expect(result.lastFrame()).toContain("streaming latest");
  } finally {
    result.unmount();
  }
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

  const result = await render(App, { columns: 40, rows: 8 });
  try {
    expect(result.lastFrame()).toContain("message 11");

    await result.stdin.write(WHEEL_UP);
    await result.waitUntilRenderFlush();
    const scrolledFrame = result.lastFrame()!;
    const anchor = scrolledFrame.match(/message \d+/)?.[0];
    expect(anchor).toBeDefined();
    expect(scrolledFrame).not.toContain("message 11");

    items.value = [...items.value, "streaming latest"];
    await nextTick();
    await result.waitUntilRenderFlush();

    const updatedFrame = result.lastFrame()!;
    expect(updatedFrame).toContain(anchor);
    expect(updatedFrame).not.toContain("streaming latest");
  } finally {
    result.unmount();
  }
});

test("ScrollBox does not acquire raw mode when stdin does not support it", async () => {
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
  const setRawModeCalls: boolean[] = [];
  const stdin = makeNonTtyStdin(setRawModeCalls);
  let error: Error | undefined;

  app.waitUntilExit().catch((caught) => {
    error = caught as Error;
  });

  try {
    app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: false, rawMode: "auto" });
    await flushAppErrors();

    expect(error).toBeUndefined();
    expect(setRawModeCalls).toEqual([]);
  } finally {
    app.unmount();
  }
});
