import { PassThrough } from "node:stream";
import ansiEscapes from "ansi-escapes";
import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { INTERNAL_TERMINAL_SIZE_PROBE } from "@vue-tui/runtime/internal";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

const App = defineComponent(() => () => <Text>Hello</Text>);

function chunksFrom(stream: NodeJS.WriteStream): string[] {
  const chunks: string[] = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });
  return chunks;
}

test.each(["fullscreen", "alternateScreen", "interactive"] as const)(
  "removed %s option fails before another mount option is read",
  (removedKey) => {
    const options = Object.defineProperty({ [removedKey]: undefined }, "stdout", {
      enumerable: true,
      get() {
        throw new Error("stdout getter must not run");
      },
    });

    const app = createApp(App);
    expect(() => app.mount(options as never)).toThrow(`Mount option "${removedKey}" was removed`);
  },
);

test.each([null, false, true, "full-screen", 0, {}, [], () => {}, Symbol("mode"), 1n])(
  "invalid mode %# fails before another mount option is read",
  (mode) => {
    const options = Object.defineProperty({ mode }, "stdout", {
      enumerable: true,
      get() {
        throw new Error("stdout getter must not run");
      },
    });

    const app = createApp(App);
    expect(() => app.mount(options as never)).toThrow(
      'Mount option "mode" must be "inline", "fullscreen", or undefined',
    );
  },
);

test.each([null, 0, "true", {}, []])(
  "invalid liveUpdates %# fails before another mount option is read",
  (liveUpdates) => {
    const options = Object.defineProperty({ liveUpdates }, "stdout", {
      enumerable: true,
      get() {
        throw new Error("stdout getter must not run");
      },
    });

    const app = createApp(App);
    expect(() => app.mount(options as never)).toThrow(
      'Mount option "liveUpdates" must be a boolean or undefined',
    );
  },
);

test("screen-reader Fullscreen request stays on the main screen", async () => {
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: stdin } = makeFakeStdin();
  const writes = chunksFrom(stdout);

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr,
    mode: "fullscreen",
    liveUpdates: true,
    isScreenReaderEnabled: true,
    exitOnCtrlC: false,
  } as never);

  await nextTick();
  await app.waitUntilRenderFlush();
  app.unmount();
  await app.waitUntilExit();

  const output = writes.join("");
  expect(output).toContain("Hello");
  expect(output).not.toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).not.toContain(ansiEscapes.exitAlternativeScreen);
});

test("visual TTY without detected dimensions uses final stream output", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = chunksFrom(stdout);
  delete (stdout as { columns?: number }).columns;
  delete (stdout as { rows?: number }).rows;

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr,
    mode: "fullscreen",
    liveUpdates: true,
    exitOnCtrlC: false,
    [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
  } as Parameters<typeof app.mount>[0]);

  await nextTick();
  await app.waitUntilRenderFlush();
  expect(writes.join("")).not.toContain("Hello");
  expect(writes.join("")).not.toContain(ansiEscapes.enterAlternativeScreen);

  app.unmount();
  await app.waitUntilExit();
  expect(writes.join("")).toContain("Hello");
  expect(writes.join("")).not.toContain(ansiEscapes.exitAlternativeScreen);
});

test("a partial custom TTY size never borrows dimensions from the process terminal", async () => {
  const stdout = makeFakeWritable({ columns: 140, rows: 40 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: stdin } = makeFakeStdin();
  const writes = chunksFrom(stdout);
  delete (stdout as { rows?: number }).rows;

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr,
    mode: "fullscreen",
    liveUpdates: true,
    exitOnCtrlC: false,
  });

  await nextTick();
  await app.waitUntilRenderFlush();
  expect(writes.join("")).not.toContain(ansiEscapes.enterAlternativeScreen);
  expect(writes.join("")).not.toContain("Hello");

  app.unmount();
  await app.waitUntilExit();
  expect(writes.join("")).toContain("Hello");
});
