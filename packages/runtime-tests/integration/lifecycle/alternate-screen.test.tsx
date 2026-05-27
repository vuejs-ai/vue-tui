import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import ansiEscapes from "ansi-escapes";
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
  app.mount({ stdout, stdin, stderr: makeTtyStream(), interactive: true, exitOnCtrlC: false });
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
    alternateScreen: true,
    interactive: false,
    exitOnCtrlC: false,
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
    alternateScreen: true,
    exitOnCtrlC: false,
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
    alternateScreen: true,
    interactive: true,
    exitOnCtrlC: false,
  });
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const output = stdout.chunks.join("");
  expect(output).not.toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).not.toContain(ansiEscapes.exitAlternativeScreen);
});
