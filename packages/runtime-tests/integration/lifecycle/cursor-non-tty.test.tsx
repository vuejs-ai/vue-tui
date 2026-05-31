// Forced-interactive + NON-TTY stdout must emit NO cursor hide/show escapes,
// matching Ink. Ink routes every cursor hide/show through `cli-cursor`, which
// short-circuits `if (!stream.isTTY) return` (cli-cursor/index.js:8-24), and
// its mount-hide is alt-screen-only (also isTTY-gated). So when a caller forces
// `interactive: true` onto a piped, non-TTY stdout (isTTY false), Ink writes
// neither `\x1b[?25l` nor `\x1b[?25h`. vue must do the same: the cursor-control
// writes are a TTY concern, and forcing interactive must not leak them to a pipe.
import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { PassThrough } from "node:stream";

const hideCursorEscape = "\x1b[?25l";
const showCursorEscape = "\x1b[?25h";

function makeNonTtyStdout() {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  // isTTY explicitly false: a piped/redirected stdout the caller forced into
  // interactive mode. columns/rows still provided so layout has a width.
  Object.assign(stream, { isTTY: false, columns: 80, rows: 24 });
  stream.chunks = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) =>
    stream.chunks.push(chunk.toString()),
  );
  return stream;
}

function makeTtyStream() {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  Object.assign(stream, { isTTY: true, columns: 80, rows: 24 });
  stream.chunks = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) =>
    stream.chunks.push(chunk.toString()),
  );
  return stream;
}

function makeFakeStdin(): NodeJS.ReadStream {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    setRawMode() {
      return stdin;
    },
    setEncoding() {
      return stdin;
    },
    ref() {},
    unref() {},
  });
  return stdin;
}

test("forced interactive + non-TTY stdout emits NO cursor hide/show escapes", async () => {
  const stdout = makeNonTtyStdout();
  const stdin = makeFakeStdin();

  const App = defineComponent(() => () => <Text>hello</Text>);

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr: makeTtyStream(),
    interactive: true,
    exitOnCtrlC: false,
  });
  await nextTick();

  const afterMount = stdout.chunks.join("");
  // Ink emits no hide on mount for a non-TTY stdout (cli-cursor short-circuit).
  expect(afterMount).not.toContain(hideCursorEscape);

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  const afterUnmount = stdout.chunks.join("");
  // ...and no show on teardown either.
  expect(afterUnmount).not.toContain(hideCursorEscape);
  expect(afterUnmount).not.toContain(showCursorEscape);
});
