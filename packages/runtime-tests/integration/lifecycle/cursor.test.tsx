import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { PassThrough } from "node:stream";

function makeTtyStream() {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  Object.assign(stream, { isTTY: true, columns: 80, rows: 24 });
  stream.chunks = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) =>
    stream.chunks.push(chunk.toString()),
  );
  return stream;
}

test("mount hides cursor, unmount shows cursor", async () => {
  const stdout = makeTtyStream();
  const stderr = makeTtyStream();
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    setRawMode() {
      return stdin;
    },
  });

  const App = defineComponent(() => () => <Text>hello</Text>);

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr, debug: false, exitOnCtrlC: false });
  await nextTick();

  // Cursor should be hidden after mount
  const afterMount = stdout.chunks.join("");
  expect(afterMount).toContain("\x1b[?25l");

  app.unmount();
  await nextTick();

  // Cursor should be shown after unmount
  const afterUnmount = stdout.chunks.join("");
  expect(afterUnmount).toContain("\x1b[?25h");
});
