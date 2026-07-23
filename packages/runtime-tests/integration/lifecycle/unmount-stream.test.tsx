import { PassThrough } from "node:stream";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, createApp, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import ansiEscapes from "ansi-escapes";
import type { InternalMountOptions } from "../../../runtime/dist/internal.mjs";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

test("an ended stdout rejects exit without writing after end", async () => {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  stdout.columns = 100;

  const writeErrors: Error[] = [];
  stdout.on("error", (error) => {
    writeErrors.push(error);
  });

  const App = defineComponent(() => () => <Text>Hello</Text>);

  const app = createApp(App);
  const stderr = makeFakeWritable({ columns: 100 });
  const { stream: stdin } = makeFakeStdin();

  app.mount({ stdout, stdin, stderr, maxFps: 0 } as InternalMountOptions);
  await nextTick();
  await nextTick();

  const exitPromise = app.waitUntilExit();

  stdout.end();
  app.unmount();

  await expect(exitPromise).rejects.toThrow(
    "Runtime output stream became unwritable during terminal restoration.",
  );
  // Two ticks: first flushes Vue unmount callbacks, second lets stream
  // error events (fired via process.nextTick internally) propagate.
  await nextTick();
  await nextTick();

  expect(
    writeErrors.some(
      (error) => (error as NodeJS.ErrnoException).code === "ERR_STREAM_WRITE_AFTER_END",
    ),
  ).toBe(false);
});

test("non-interactive mode writes only last frame at unmount", async () => {
  // Port of Ink's CI/non-TTY rendering: in non-interactive mode, the runtime
  // defers dynamic frame output and only writes the final frame at unmount.
  // We use a single state that we set before mount so the first commit
  // captures it, then verify no output appears until unmount.
  const App = defineComponent(() => {
    return () => <Text>the-content</Text>;
  });

  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  // Disable isTTY to get non-interactive behavior
  (stdout as unknown as { isTTY: boolean }).isTTY = false;

  const chunks: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr,
  });

  await nextTick();
  await nextTick();

  // Before unmount, no dynamic frames should have been written.
  // (Only static output is written immediately in non-interactive mode.)
  const preUnmountOutput = chunks.join("");
  expect(preUnmountOutput).not.toContain("the-content");

  app.unmount();
  await app.waitUntilExit();

  // After unmount, the last frame should be written
  const postUnmountOutput = chunks.join("");
  expect(postUnmountOutput).toContain("the-content");
});

test("non-TTY default writes Static immediately and only the latest dynamic frame at teardown", async () => {
  const items = shallowRef(["static-one"]);
  const dynamic = shallowRef("dynamic-one");
  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        {items.value.map((item) => (
          <Static key={item}>
            <Text>{item}</Text>
          </Static>
        ))}
        <Text>{dynamic.value}</Text>
      </Box>
    );
  });

  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  (stdout as unknown as { isTTY: boolean }).isTTY = false;

  const chunks: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr });

  await nextTick();
  await app.waitUntilRenderFlush();
  expect(chunks.join("")).toContain("static-one");
  expect(chunks.join("")).not.toContain("dynamic-one");

  items.value = ["static-one", "static-two"];
  dynamic.value = "dynamic-two";
  await nextTick();
  await app.waitUntilRenderFlush();

  const beforeTeardown = chunks.join("");
  expect(beforeTeardown).toContain("static-two");
  expect(beforeTeardown).not.toContain("dynamic-one");
  expect(beforeTeardown).not.toContain("dynamic-two");

  app.unmount();
  await app.waitUntilExit();

  const finalOutput = chunks.join("");
  expect(finalOutput).toContain("dynamic-two");
  expect(finalOutput).not.toContain("dynamic-one");
});

test("explicit liveUpdates writes live Inline frames to non-TTY without terminal ownership", async () => {
  const value = shallowRef("first-frame");
  const App = defineComponent(() => () => <Text>{value.value}</Text>);

  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: stdin } = makeFakeStdin();
  (stdout as unknown as { isTTY: boolean }).isTTY = false;

  const chunks: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr,
    liveUpdates: true,
    mode: "inline",
  } as InternalMountOptions);

  await nextTick();
  await app.waitUntilRenderFlush();
  expect(chunks.join("")).toContain("first-frame");
  expect(chunks.join("")).not.toContain(ansiEscapes.enterAlternativeScreen);

  chunks.length = 0;
  value.value = "second-frame";
  await nextTick();
  await app.waitUntilRenderFlush();

  const liveUpdate = chunks.join("");
  expect(liveUpdate).toContain("second-frame");
  expect(liveUpdate).toContain(ansiEscapes.eraseLines(1));
  expect(liveUpdate).not.toContain(ansiEscapes.enterAlternativeScreen);

  app.unmount();
  await app.waitUntilExit();

  expect(chunks.join("")).not.toContain(ansiEscapes.exitAlternativeScreen);
});

test("non-interactive empty final frame writes no bytes at unmount", async () => {
  const App = defineComponent(() => () => null);

  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  (stdout as unknown as { isTTY: boolean }).isTTY = false;

  const chunks: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr,
  });

  await nextTick();
  await nextTick();

  expect(chunks.join("")).toBe("");

  app.unmount();
  await app.waitUntilExit();

  expect(chunks.join("")).toBe("");
});

test("mount rejects a non-writable stdout before consuming the app", async () => {
  const App = defineComponent(() => () => <Text>the-content</Text>);

  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  (stdout as unknown as { isTTY: boolean }).isTTY = false;
  (stdout as NodeJS.WriteStream & { writable?: boolean }).writable = false;

  const chunks: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });

  const app = createApp(App);
  expect(() =>
    app.mount({
      stdout,
      stdin,
      stderr,
    }),
  ).toThrow('Mount option "stdout" must be writable when mount() begins.');
  expect(chunks).toEqual([]);

  (stdout as NodeJS.WriteStream & { writable?: boolean }).writable = true;
  app.mount({ stdout, stdin, stderr });
  await nextTick();
  app.unmount();
  await app.waitUntilExit();
  expect(chunks.join("")).toContain("the-content");
});

test("non-interactive mode does not emit erase or cursor sequences", async () => {
  // In non-interactive mode (non-TTY), the runtime should not emit any
  // ANSI erase sequences or cursor manipulation — only plain text output.
  const App = defineComponent(() => () => <Text>hello</Text>);

  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  (stdout as unknown as { isTTY: boolean }).isTTY = false;

  const chunks: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr,
  });

  await nextTick();
  await nextTick();

  app.unmount();
  await app.waitUntilExit();

  const fullOutput = chunks.join("");

  // Content was written
  expect(fullOutput).toContain("hello");

  // No cursor hide/show
  expect(fullOutput).not.toContain("\x1b[?25l");
  expect(fullOutput).not.toContain("\x1b[?25h");

  // No erase lines sequences (ESC [ <n> K or ESC [ <n> J)
  // eslint-disable-next-line no-control-regex
  expect(fullOutput).not.toMatch(/\x1b\[\d*[KJ]/);
});

test("ended non-interactive stdout rejects exit without an uncaught write-after-end error", async () => {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  stdout.columns = 100;
  (stdout as unknown as { isTTY: boolean }).isTTY = false;

  const writeErrors: Error[] = [];
  stdout.on("error", (error) => {
    writeErrors.push(error);
  });

  const App = defineComponent(() => () => <Text>Hello</Text>);

  const app = createApp(App);
  const stderr = makeFakeWritable({ columns: 100 });
  const { stream: stdin } = makeFakeStdin();

  app.mount({
    stdout,
    stdin,
    stderr,
  });

  await nextTick();
  await nextTick();

  const exited = app.waitUntilExit();
  // End the stream before unmount
  stdout.end();

  // Unmount attempts to write the last frame to an ended stream.
  // The runtime's writeBestEffort() should catch the write error,
  // preventing it from propagating as an uncaught exception.
  app.unmount();
  await expect(exited).rejects.toThrow(
    "Runtime output stream became unwritable during terminal restoration.",
  );

  // Two ticks: first flushes Vue unmount callbacks, second lets stream
  // error events (fired via process.nextTick internally) propagate.
  await nextTick();
  await nextTick();

  // Verify no ERR_STREAM_WRITE_AFTER_END leaked as an unhandled error.
  // Errors caught by the stream's error listener are acceptable.
  expect(
    writeErrors.every((e) => (e as NodeJS.ErrnoException).code === "ERR_STREAM_WRITE_AFTER_END"),
  ).toBe(true);
});
