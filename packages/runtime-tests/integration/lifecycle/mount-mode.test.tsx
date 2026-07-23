import { PassThrough } from "node:stream";
import ansiEscapes from "ansi-escapes";
import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { INTERNAL_TERMINAL_SIZE_PROBE } from "../../../runtime/dist/internal.mjs";
import type { InternalMountOptions } from "../../../runtime/dist/internal.mjs";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

const App = defineComponent(() => () => <Text>Hello</Text>);

function chunksFrom(stream: NodeJS.WriteStream): string[] {
  const chunks: string[] = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });
  return chunks;
}

test.each(["fullscreen", "alternateScreen", "interactive", "debug", "exitOnCtrlC"] as const)(
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

test.each([undefined, "auto", "always"])(
  "removed rawMode option value %# fails before another mount option is read",
  (rawMode) => {
    const options = Object.defineProperty({ rawMode }, "stdout", {
      enumerable: true,
      get() {
        throw new Error("stdout getter must not run");
      },
    });

    const app = createApp(App);
    expect(() => app.mount(options as never)).toThrow('Mount option "rawMode" was removed');
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

test.each([undefined, "visual", "screen-reader", null, false, 0, {}, []])(
  "unknown presentation value %# fails before another mount option is read",
  (presentation) => {
    const options = Object.defineProperty({ presentation }, "stdout", {
      enumerable: true,
      get() {
        throw new Error("stdout getter must not run");
      },
    });

    const app = createApp(App);
    expect(() => app.mount(options as never)).toThrow('Unknown mount option "presentation"');
  },
);

test.each(["isScreenReaderEnabled", "unrecognizedOption"])(
  "unknown mount key %s fails through the generic closed-option guard",
  (key) => {
    const options = Object.defineProperty({ [key]: undefined }, "stdout", {
      enumerable: true,
      get() {
        throw new Error("stdout getter must not run");
      },
    });

    const app = createApp(App);
    expect(() => app.mount(options as never)).toThrow(`Unknown mount option "${key}"`);
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

test.each([
  null,
  "osc52",
  { kind: "platform" },
  { kind: "custom" },
  { kind: "custom", writeText: 42 },
])("invalid clipboard transport %# fails before another mount option is read", (clipboard) => {
  const options = Object.defineProperty({ clipboard }, "stdout", {
    enumerable: true,
    get() {
      throw new Error("stdout getter must not run");
    },
  });

  const app = createApp(App);
  expect(() => app.mount(options as never)).toThrow('mount option "clipboard"');
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
    [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
  } as InternalMountOptions);

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
  });

  await nextTick();
  await app.waitUntilRenderFlush();
  expect(writes.join("")).not.toContain(ansiEscapes.enterAlternativeScreen);
  expect(writes.join("")).not.toContain("Hello");

  app.unmount();
  await app.waitUntilExit();
  expect(writes.join("")).toContain("Hello");
});
