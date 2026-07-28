import { PassThrough } from "node:stream";
import ansiEscapes from "ansi-escapes";
import headless from "@xterm/headless";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, createApp, Text } from "@vue-tui/runtime";
import {
  INTERNAL_KITTY_KEYBOARD,
  INTERNAL_SUSPENSION_HOST,
  INTERNAL_TERMINAL_SIZE_PROBE,
  createInternalMountOptions,
  createManualSuspensionHost,
} from "../../../../packages/runtime/dist/internal.mjs";

const { Terminal } = headless;

function makeInput(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
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

function makeOutput(columns: number, rows: number): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { columns, rows, isTTY: true });
  return stream;
}

async function visibleText(output: string, columns: number, rows: number): Promise<string> {
  const terminal = new Terminal({
    cols: columns,
    rows,
    allowProposedApi: true,
    convertEol: true,
  });
  try {
    await new Promise<void>((resolve) => terminal.write(output, resolve));
    const buffer = terminal.buffer.active;
    return Array.from(
      { length: terminal.rows },
      (_, row) => buffer.getLine(buffer.viewportY + row)?.translateToString(false) ?? "",
    ).join("\n");
  } finally {
    terminal.dispose();
  }
}

test("Fullscreen rewrites changed rows absolutely and resets after resize", async () => {
  const middle = shallowRef("middle");
  const bottom = shallowRef("bottom");
  const App = defineComponent(() => () => (
    <Box width={10} height={3} flexDirection="column">
      <Text>top</Text>
      <Text>{middle.value}</Text>
      <Text>{bottom.value}</Text>
    </Box>
  ));
  const stdin = makeInput();
  const stdout = makeOutput(10, 3);
  const stderr = makeOutput(10, 3);
  const writes: string[] = [];
  stdout.on("data", (chunk: Buffer) => writes.push(chunk.toString()));
  const suspensionHost = createManualSuspensionHost();
  const app = createApp(App);
  app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      mode: "fullscreen",
      patchConsole: false,
      maxFps: 0,
      [INTERNAL_KITTY_KEYBOARD]: { mode: "disabled" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
      [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
    }),
  );

  const flush = async (): Promise<void> => {
    await nextTick();
    await nextTick();
    await app.waitUntilRenderFlush();
    await new Promise<void>((resolve) => setImmediate(resolve));
  };

  try {
    await flush();
    expect(writes.join("")).toContain(ansiEscapes.clearViewport);

    let offset = writes.length;
    middle.value = "mid";
    await flush();
    const rowUpdate = writes.slice(offset).join("");
    expect(rowUpdate).not.toContain(ansiEscapes.clearViewport);
    expect(rowUpdate).toContain(ansiEscapes.cursorTo(0, 1));
    expect(rowUpdate).not.toContain(ansiEscapes.cursorTo(0, 0));
    expect(rowUpdate).toContain("\x1b[0mmid\x1b[0m" + ansiEscapes.eraseEndLine);
    expect(rowUpdate).toContain(ansiEscapes.cursorTo(0, 2));

    offset = writes.length;
    bottom.value = "1234567890";
    await flush();
    const exactWidthUpdate = writes.slice(offset).join("");
    expect(exactWidthUpdate).not.toContain(ansiEscapes.clearViewport);
    expect(exactWidthUpdate).toContain(ansiEscapes.cursorTo(0, 2));
    expect(await visibleText(writes.join(""), 10, 3)).toContain(
      "top       \nmid       \n1234567890",
    );

    offset = writes.length;
    Object.assign(stdout, { columns: 12, rows: 4 });
    Object.assign(stderr, { columns: 12, rows: 4 });
    stdout.emit("resize");
    await flush();
    expect(writes.slice(offset).join("")).toContain(ansiEscapes.clearViewport);
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdout.destroy();
    stderr.destroy();
    stdin.destroy();
  }
});
