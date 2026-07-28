import { PassThrough, Writable } from "node:stream";
import { defineComponent, h } from "vue";
import { createApp, Text } from "@vue-tui/runtime";

const App = defineComponent(
  () => () => h(Text, { bold: true, color: "#ff0080" }, { default: () => "styled" }),
);

function makeWritable(isTTY) {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  Object.assign(stream, { isTTY, columns: 80, rows: 24 });
  if (isTTY) stream.getColorDepth = () => 24;
  return { chunks, stream };
}

async function render(isTTY, color) {
  const stdout = makeWritable(isTTY);
  const stderr = makeWritable(false);
  const stdin = new PassThrough();
  Object.assign(stdin, { isTTY: false });
  const app = createApp(App);

  app.mount({
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    patchConsole: false,
    color,
  });
  await app.waitUntilRenderFlush();
  app.unmount();
  await app.waitUntilExit();

  stdin.destroy();
  stdout.stream.destroy();
  stderr.stream.destroy();
  return stdout.chunks.join("");
}

const tty = await render(true);
const stream = await render(false);
const forcedTruecolorStream = await render(false, "truecolor");
const plainTty = await render(true, false);
process.stdout.write(`${JSON.stringify({ forcedTruecolorStream, plainTty, stream, tty })}\n`);
