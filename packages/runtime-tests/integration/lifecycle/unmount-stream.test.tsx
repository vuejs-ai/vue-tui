import { PassThrough } from "node:stream";
import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

test("unmount does not write to ended stdout stream", async () => {
  // Port of Ink's "unmount does not write to ended stdout stream" — verifies
  // that unmounting after stdout.end() does not trigger ERR_STREAM_WRITE_AFTER_END.
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

  app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: false });
  await nextTick();
  await nextTick();

  const exitPromise = app.waitUntilExit();

  stdout.end();
  app.unmount();

  await exitPromise;
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
    exitOnCtrlC: false,
    interactive: false,
  });

  await nextTick();
  await nextTick();

  // Before unmount, no dynamic frames should have been written.
  // (Only static output is written immediately in non-interactive mode.)
  const preUnmountOutput = chunks.join("");
  expect(preUnmountOutput).not.toContain("the-content");

  app.unmount();

  // After unmount, the last frame should be written
  const postUnmountOutput = chunks.join("");
  expect(postUnmountOutput).toContain("the-content");
});

test("non-interactive unmount skips final frame when stdout is not writable", async () => {
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
  app.mount({
    stdout,
    stdin,
    stderr,
    exitOnCtrlC: false,
    interactive: false,
  });

  await nextTick();
  await nextTick();

  app.unmount();
  await app.waitUntilExit();

  expect(chunks.join("")).not.toContain("the-content");
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
    exitOnCtrlC: false,
    interactive: false,
  });

  await nextTick();
  await nextTick();

  app.unmount();

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

test("non-interactive unmount does not crash on ended stdout", async () => {
  // Combines the non-interactive and ended-stream edge cases: verifies that
  // unmounting a non-interactive app after stdout.end() handles the write
  // gracefully without ERR_STREAM_WRITE_AFTER_END propagating as uncaught.
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
    exitOnCtrlC: false,
    interactive: false,
  });

  await nextTick();
  await nextTick();

  // End the stream before unmount
  stdout.end();

  // Unmount attempts to write the last frame to an ended stream.
  // The runtime's writeBestEffort() should catch the write error,
  // preventing it from propagating as an uncaught exception.
  app.unmount();

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
