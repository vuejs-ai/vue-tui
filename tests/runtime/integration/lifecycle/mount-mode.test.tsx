import { PassThrough } from "node:stream";
import ansiEscapes from "ansi-escapes";
import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { INTERNAL_TERMINAL_SIZE_PROBE } from "../../../../packages/runtime/dist/internal.mjs";
import { createInternalMountOptions } from "../../../../packages/runtime/dist/internal.mjs";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

const App = defineComponent(() => () => <Text>Hello</Text>);

function chunksFrom(stream: NodeJS.WriteStream): string[] {
  const chunks: string[] = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });
  return chunks;
}

test.each([
  "fullscreen",
  "alternateScreen",
  "interactive",
  "debug",
  "rawMode",
  "kittyKeyboard",
] as const)("removed %s option uses the generic closed-option guard", (key) => {
  const options = Object.defineProperty({ [key]: undefined }, "stdout", {
    enumerable: true,
    get() {
      throw new Error("stdout getter must not run");
    },
  });

  const app = createApp(App);
  expect(() => app.mount(options as never)).toThrow(`Unknown mount option "${key}"`);
});

test.each([null, 0, "true", {}, []])(
  "invalid exitOnCtrlC %# fails before another mount option is read",
  (exitOnCtrlC) => {
    const options = Object.defineProperty({ exitOnCtrlC }, "stdout", {
      enumerable: true,
      get() {
        throw new Error("stdout getter must not run");
      },
    });

    const app = createApp(App);
    expect(() => app.mount(options as never)).toThrow(
      'Mount option "exitOnCtrlC" must be a boolean or undefined',
    );
  },
);

test.each([null, 0, "ansi", "auto", "none", "TRUECOLOR", {}, []])(
  "invalid color option %# fails before another mount option is read",
  (color) => {
    const options = Object.defineProperty({ color }, "stdout", {
      enumerable: true,
      get() {
        throw new Error("stdout getter must not run");
      },
    });

    const app = createApp(App);
    expect(() => app.mount(options as never)).toThrow(
      'Mount option "color" must be a boolean, "ansi16", "ansi256", "truecolor", or undefined',
    );
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

// `onRender` and `maxFps` still exist as repository-only controls, but only
// through the module-private association in createInternalMountOptions(); an own
// property of the same name is not that association.
test.each(["onRender", "maxFps"] as const)(
  "repository-only string mount key %s is unavailable to public JavaScript callers",
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

// These names have no remaining implementation at any layer. They are kept only
// so a removed public option cannot quietly return as an accepted key.
test.each(["liveUpdates", "incrementalRendering", "clipboard"] as const)(
  "removed public mount key %s stays rejected",
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

test("Fullscreen without detected dimensions fails before output and remains retryable", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = chunksFrom(stdout);
  delete (stdout as { columns?: number }).columns;
  delete (stdout as { rows?: number }).rows;

  const app = createApp(App);
  expect(() =>
    app.mount(
      createInternalMountOptions({
        stdout,
        stdin,
        stderr,
        mode: "fullscreen",
        [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
      }),
    ),
  ).toThrow("Fullscreen mode requires positive terminal columns and rows");
  expect(writes).toEqual([]);

  Object.assign(stdout, { columns: 80, rows: 24 });
  app.mount({ stdout, stdin, stderr, mode: "fullscreen", patchConsole: false });

  await nextTick();
  await app.waitUntilRenderFlush();
  expect(writes.join("")).toContain(ansiEscapes.enterAlternativeScreen);
  app.unmount();
  await app.waitUntilExit();
  expect(writes.join("")).toContain("Hello");
  expect(writes.join("")).toContain(ansiEscapes.exitAlternativeScreen);
});

test("a partial custom TTY size fails instead of borrowing process dimensions", async () => {
  const stdout = makeFakeWritable({ columns: 140, rows: 40 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: stdin } = makeFakeStdin();
  const writes = chunksFrom(stdout);
  delete (stdout as { rows?: number }).rows;

  const app = createApp(App);
  expect(() => app.mount({ stdout, stdin, stderr, mode: "fullscreen" })).toThrow(
    "Fullscreen mode requires positive terminal columns and rows",
  );
  expect(writes).toEqual([]);

  Object.assign(stdout, { rows: 40 });
  app.mount({ stdout, stdin, stderr, mode: "fullscreen", patchConsole: false });
  await app.waitUntilRenderFlush();
  expect(writes.join("")).toContain(ansiEscapes.enterAlternativeScreen);

  app.unmount();
  await app.waitUntilExit();
  expect(writes.join("")).toContain("Hello");
});

test("a non-TTY mount never probes the controlling terminal for a size it cannot use", async () => {
  // A redirected or piped stdout reports neither `columns` nor `rows`.
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: false });
  const { stream: stdin } = makeFakeStdin();
  const stderr = makeFakeWritable();
  let probeCalls = 0;
  const app = createApp(App);

  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stdin,
        stderr,
        patchConsole: false,
        [INTERNAL_TERMINAL_SIZE_PROBE]: () => {
          probeCalls += 1;
          return { kind: "unavailable" };
        },
      }),
    );
    await app.waitUntilRenderFlush();

    // The probe opens /dev/tty and can spawn `tput`; every non-TTY surface resolves
    // to the fixed modeled document before the result could be read.
    expect(probeCalls).toBe(0);
  } finally {
    app.unmount();
  }
});
