import { PassThrough } from "node:stream";
import { defineComponent, nextTick, ref } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Static, createApp } from "@vue-tui/runtime";

test("Static appends new items above the dynamic frame", async () => {
  const items = ref<string[]>([]);

  const App = defineComponent(() => {
    return () => (
      <Box>
        <Static items={items.value}>
          {{
            default: ({ item, index }: { item: string; index: number }) => (
              <Text key={index}>{item}</Text>
            ),
          }}
        </Static>
        <Text>[dynamic]</Text>
      </Box>
    );
  });

  const { lastFrame, frames } = await render(App);
  expect(lastFrame()).toContain("[dynamic]");

  items.value = ["log-1"];
  await nextTick();

  const allOutput = frames.join("");
  expect(allOutput).toContain("log-1");
  expect(lastFrame()).toContain("[dynamic]");
});

test("Static preserves prior items when new ones are added", async () => {
  const logs = ref<string[]>([]);
  const status = ref("idle");

  const App = defineComponent(() => {
    return () => (
      <Box>
        <Static items={logs.value}>
          {{
            default: ({ item, index }: { item: string; index: number }) => (
              <Text key={index}>{item}</Text>
            ),
          }}
        </Static>
        <Text>status: {status.value}</Text>
      </Box>
    );
  });

  const { lastFrame, frames } = await render(App);
  expect(lastFrame()).toContain("status: idle");

  logs.value = [...logs.value, "log A"];
  await nextTick();
  logs.value = [...logs.value, "log B"];
  await nextTick();
  status.value = "running";
  await nextTick();

  const allOutput = frames.join("");
  expect(allOutput).toContain("log A");
  expect(allOutput).toContain("log B");
  expect(lastFrame()).toContain("status: running");
});

function makeTtyStream(cols = 80): NodeJS.WriteStream & { chunks: string[] } {
  const s = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  Object.assign(s, { columns: cols, rows: 24, isTTY: true, chunks: [] as string[] });
  s.on("data", (chunk: Buffer) => s.chunks.push(chunk.toString()));
  return s;
}

test("Static flush clears the dynamic frame first (non-debug mode)", async () => {
  const stdout = makeTtyStream();
  const stderr = makeTtyStream();
  const stdinStream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdinStream, {
    isTTY: true,
    setRawMode() {
      return stdinStream;
    },
    setEncoding() {
      return stdinStream;
    },
  });

  const items = ref<string[]>([]);
  const App = defineComponent(() => () => (
    <Box>
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
      </Static>
      <Text>LIVE_FRAME</Text>
    </Box>
  ));

  const app = createApp(App);
  app.mount({ stdout, stdin: stdinStream, stderr, debug: false, exitOnCtrlC: false });
  await nextTick();

  // After initial render, dynamic frame should contain LIVE_FRAME
  const initialOutput = stdout.chunks.join("");
  expect(initialOutput).toContain("LIVE_FRAME");

  // Clear captured chunks, then trigger a static flush
  stdout.chunks.length = 0;
  items.value = ["STATIC_ITEM"];
  await nextTick();

  // Collect everything written during this render cycle
  const renderOutput = stdout.chunks.join("");

  // The render output must contain the static content
  expect(renderOutput).toContain("STATIC_ITEM");

  // Key assertion: log-update's clear sequence (ESC[2K = erase line) must appear
  // BEFORE the static content. This proves writer.clear() was called before
  // flushStatic(). Without the fix, flushStatic writes first and then log-update
  // overwrites the static content when it re-renders the dynamic frame.
  const clearLineSeq = "[2K";
  const clearIndex = renderOutput.indexOf(clearLineSeq);
  const staticIndex = renderOutput.indexOf("STATIC_ITEM");
  expect(clearIndex).toBeGreaterThanOrEqual(0);
  expect(clearIndex).toBeLessThan(staticIndex);

  app.unmount();
});
