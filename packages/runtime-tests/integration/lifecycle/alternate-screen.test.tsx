import { defineComponent, nextTick, onMounted, onScopeDispose } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import { PassThrough } from "node:stream";

function makeTtyStream(options?: { isTTY?: boolean }) {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  Object.assign(stream, { isTTY: options?.isTTY ?? true, columns: 80, rows: 24 });
  stream.chunks = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) =>
    stream.chunks.push(chunk.toString()),
  );
  return stream;
}

function makeFakeStdin() {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    setRawMode() {
      return stdin;
    },
    ref() {},
    unref() {},
    setEncoding() {
      return stdin;
    },
  });
  return stdin;
}

const App = defineComponent(() => () => <Text>Hello</Text>);

test("alternate screen - disabled by default", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr: makeTtyStream(), liveUpdates: true });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const output = stdout.chunks.join("");
  expect(output).not.toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).not.toContain(ansiEscapes.exitAlternativeScreen);
});

test("alternate screen - ignored when non-interactive", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: false,
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const output = stdout.chunks.join("");
  expect(output).not.toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).not.toContain(ansiEscapes.exitAlternativeScreen);
});

test("alternate screen - ignored when isTTY is false", async () => {
  const stdout = makeTtyStream({ isTTY: false });
  const stdin = makeFakeStdin();

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const output = stdout.chunks.join("");
  expect(output).not.toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).not.toContain(ansiEscapes.exitAlternativeScreen);
});

test("alternate screen - ignored when isTTY is false even if interactive is true", async () => {
  const stdout = makeTtyStream({ isTTY: false });
  const stdin = makeFakeStdin();

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: true,
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const output = stdout.chunks.join("");
  expect(output).not.toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).not.toContain(ansiEscapes.exitAlternativeScreen);
});

test("alternate screen - enters on mount and exits on unmount", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: true,
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const chunks = stdout.chunks;
  const enterIndex = chunks.findIndex((w) => w.includes(ansiEscapes.enterAlternativeScreen));
  const exitIndex = chunks.findLastIndex((w) => w.includes(ansiEscapes.exitAlternativeScreen));

  expect(enterIndex).not.toBe(-1);
  expect(exitIndex).not.toBe(-1);
  expect(enterIndex).toBeLessThan(exitIndex);
  expect(enterIndex).toBe(0);
  expect(chunks[0]).toContain(ansiEscapes.enterAlternativeScreen);
});

// Port of Ink ink.tsx:970-976 (setAlternateScreen): when entering the alternate
// screen, Ink writes enterAlternativeScreen IMMEDIATELY followed by the hide-cursor
// escape — a hide that is part of the ENTER sequence, distinct from log-update's
// own writer-side hide on the first frame. Lock that the hide byte (\x1b[?25l)
// appears at/after the enterAlternativeScreen index but BEFORE any rendered content.
test("alternate screen - hides cursor as part of the enter sequence", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();
  const hideCursorEscape = "\x1b[?25l";

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: true,
  });
  await nextTick();

  const output = stdout.chunks.join("");
  const enterIndex = output.indexOf(ansiEscapes.enterAlternativeScreen);
  const hideIndex = output.indexOf(hideCursorEscape, enterIndex);
  const contentIndex = output.indexOf("Hello");

  expect(enterIndex).not.toBe(-1);
  expect(hideIndex).not.toBe(-1);
  // Hide is part of the enter sequence: at/after enter, before rendered content.
  expect(hideIndex).toBeGreaterThanOrEqual(enterIndex);
  expect(contentIndex).not.toBe(-1);
  expect(hideIndex).toBeLessThan(contentIndex);

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;
});

test("alternate screen - content is rendered between enter and exit", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: true,
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const chunks = stdout.chunks;
  const enterIndex = chunks.findIndex((w) => w.includes(ansiEscapes.enterAlternativeScreen));
  const exitIndex = chunks.findLastIndex((w) => w.includes(ansiEscapes.exitAlternativeScreen));

  expect(enterIndex).not.toBe(-1);
  expect(exitIndex).not.toBe(-1);
  expect(enterIndex).toBeLessThan(exitIndex);

  const contentBetween = chunks.slice(enterIndex + 1, exitIndex).some((w) => w.includes("Hello"));
  expect(contentBetween).toBe(true);
});

test("alternate screen - unmount() exits the alternate screen", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: true,
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const chunks = stdout.chunks;
  const exitIndex = chunks.findLastIndex((w) => w.includes(ansiEscapes.exitAlternativeScreen));
  expect(exitIndex).not.toBe(-1);
});

test("alternate screen - cursor restored after exit", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();
  const showCursorEscape = "\x1b[?25h";

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: true,
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const output = stdout.chunks.join("");
  const exitIndex = output.lastIndexOf(ansiEscapes.exitAlternativeScreen);
  const showCursorIndex = output.lastIndexOf(showCursorEscape);

  expect(exitIndex).not.toBe(-1);
  expect(showCursorIndex).toBeGreaterThan(exitIndex);
});

test("alternate screen - restores the primary screen before writing a thrown error to stderr", async () => {
  const terminal = makeTtyStream();
  const stdin = makeFakeStdin();

  const ErrorApp = defineComponent(() => {
    throw new Error("Done");
  });

  const app = createApp(ErrorApp);
  app.mount({
    stdout: terminal,
    stdin,
    stderr: terminal,
    mode: "fullscreen",
    liveUpdates: true,
  });
  const exited = app.waitUntilExit();
  await nextTick();
  await nextTick();
  await new Promise<void>((r) => setImmediate(r));
  await nextTick();

  await expect(exited).rejects.toThrow("Done");

  const chunks = terminal.chunks;
  const exitIndex = chunks.findLastIndex((w) => w.includes(ansiEscapes.exitAlternativeScreen));
  expect(exitIndex).not.toBe(-1);

  // The error is intentionally not a replay of the last fullscreen frame. It is
  // a durable stderr report emitted only after the alternate screen is gone.
  const afterExit = stripAnsi(chunks.slice(exitIndex + 1).join(""));
  expect(afterExit).toContain("Error: Done");
});

test("alternate screen - restores before reporting useApp().exit(error)", async () => {
  const terminal = makeTtyStream();
  const stdin = makeFakeStdin();

  const ErrorExitApp = defineComponent(() => {
    const { exit } = useApp();
    onMounted(() => exit(new Error("PROGRAMMATIC_DONE")));
    return () => <Text>fullscreen content</Text>;
  });

  const app = createApp(ErrorExitApp);
  app.mount({
    stdout: terminal,
    stdin,
    stderr: terminal,
    mode: "fullscreen",
    liveUpdates: true,
  });

  await expect(app.waitUntilExit()).rejects.toThrow("PROGRAMMATIC_DONE");

  const chunks = terminal.chunks;
  const exitIndex = chunks.findLastIndex((w) => w.includes(ansiEscapes.exitAlternativeScreen));
  expect(exitIndex).not.toBe(-1);
  expect(stripAnsi(chunks.slice(exitIndex + 1).join(""))).toContain("Error: PROGRAMMATIC_DONE");
});

test("alternate screen - does not replay teardown output on primary screen", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();

  const TeardownApp = defineComponent(() => () => <Text>fullscreen content</Text>);

  const app = createApp(TeardownApp);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: true,
  });
  await nextTick();

  const preUnmount = stdout.chunks.join("");
  expect(preUnmount).toContain("fullscreen content");

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const chunks = stdout.chunks;
  const exitIndex = chunks.findLastIndex((w) => w.includes(ansiEscapes.exitAlternativeScreen));
  expect(exitIndex).not.toBe(-1);

  const afterExit = stripAnsi(chunks.slice(exitIndex + 1).join(""));
  expect(afterExit).not.toContain("fullscreen content");
});

test("alternate screen - cleanup console output does not leak into managed stream", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();

  let disposed = false;
  const CleanupApp = defineComponent(() => {
    onScopeDispose(() => {
      disposed = true;
      console.log("cleanup log");
    });
    return () => <Text>Hello</Text>;
  });

  const app = createApp(CleanupApp);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: true,
    patchConsole: true,
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  expect(disposed).toBe(true);

  const output = stdout.chunks.join("");
  expect(output).not.toContain("cleanup log");
});

test("alternate screen - still activates with unthrottled commits", async () => {
  const stdout = makeTtyStream();
  const stdin = makeFakeStdin();

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    mode: "fullscreen",
    liveUpdates: true,
    maxFps: 0,
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const chunks = stdout.chunks;
  const enterIndex = chunks.findIndex((w) => w.includes(ansiEscapes.enterAlternativeScreen));
  const exitIndex = chunks.findLastIndex((w) => w.includes(ansiEscapes.exitAlternativeScreen));

  expect(enterIndex).not.toBe(-1);
  expect(exitIndex).not.toBe(-1);
});
