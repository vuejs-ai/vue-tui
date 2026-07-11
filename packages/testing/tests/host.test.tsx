import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Text, useStdout } from "@vue-tui/runtime";
import {
  useInternalRenderSession,
  type InternalLiveRenderSessionSnapshot,
} from "@vue-tui/runtime/internal";
import { render, type RenderOptions } from "../src/index.ts";

test("default host models a visual Inline TTY", async () => {
  let componentSession: InternalLiveRenderSessionSnapshot | undefined;
  const App = defineComponent(() => {
    componentSession = useInternalRenderSession().session as InternalLiveRenderSessionSnapshot;
    return () => <Text>default</Text>;
  });

  const result = await render(App);
  expect(result.session).toBe(componentSession);
  expect(result.session).toEqual({
    host: "live",
    mode: { requested: "inline", effective: "inline", fallback: null },
    output: { destination: "terminal", dynamicUpdates: "live", presentation: "visual" },
    dimensions: {
      terminal: { columns: 100, rows: 100 },
      layout: { columns: 100, rows: null },
    },
    capabilities: {
      stableOrigin: false,
      elementHitTesting: false,
      suspension: false,
    },
  });
});

test("stream omission selects production final-output cadence", async () => {
  const result = await render(() => <Text>stream</Text>, {
    columns: 72,
    rows: 16,
    host: { stdout: "stream", mode: "fullscreen" },
  });

  expect(result.session.mode).toEqual({
    requested: "fullscreen",
    effective: null,
    fallback: "live-updates-disabled",
  });
  expect(result.session.output).toEqual({
    destination: "stream",
    dynamicUpdates: "at-teardown",
    presentation: "visual",
  });
  expect(result.session.dimensions).toEqual({
    terminal: null,
    layout: { columns: 72, rows: null },
  });
  expect(result.terminal.rows).toBe(16);
});

test("explicit live stream cannot manufacture a terminal mode", async () => {
  const result = await render(() => <Text>stream</Text>, {
    host: { stdout: "stream", updates: "live", mode: "fullscreen" },
  });

  expect(result.session.mode).toEqual({
    requested: "fullscreen",
    effective: null,
    fallback: "stdout-not-tty",
  });
  expect(result.session.output.dynamicUpdates).toBe("live");
  expect(result.session.capabilities.stableOrigin).toBe(false);
});

test("Fullscreen TTY exposes a fixed modeled viewport", async () => {
  const result = await render(() => <Text>full</Text>, {
    columns: 30,
    rows: 8,
    host: { mode: "fullscreen" },
  });

  expect(result.session.mode).toEqual({
    requested: "fullscreen",
    effective: "fullscreen",
    fallback: null,
  });
  expect(result.session.dimensions.layout).toEqual({ columns: 30, rows: 8 });
  expect(result.session.capabilities).toEqual({
    stableOrigin: true,
    elementHitTesting: true,
    suspension: false,
  });
});

test("Fullscreen screen-reader request resolves to an Inline transcript", async () => {
  const result = await render(() => <Text>transcript</Text>, {
    host: { mode: "fullscreen", presentation: "screen-reader" },
  });

  expect(result.session.mode).toEqual({
    requested: "fullscreen",
    effective: "inline",
    fallback: "screen-reader-transcript",
  });
  expect(result.session.output.presentation).toBe("screen-reader");
  expect((await result.screen()).activeBuffer).toBe("normal");
});

test("resize updates the same session before the resulting frame is observed", async () => {
  const result = await render(() => {
    const session = useInternalRenderSession().session;
    return <Text>{session.dimensions.layout.columns}</Text>;
  });
  const session = result.session;

  await result.terminal.resize(64, 12);

  expect(result.session).toBe(session);
  expect(session.dimensions.terminal).toEqual({ columns: 64, rows: 12 });
  expect(session.dimensions.layout).toEqual({ columns: 64, rows: null });
  expect(result.lastFrame()).toBe("64");
});

test("resize rejects invalid dimensions without partially changing the host", async () => {
  const result = await render(() => <Text>resize</Text>, { columns: 40, rows: 10 });
  const invalidDimensions = [
    undefined,
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ];

  for (const invalid of invalidDimensions) {
    await expect(result.terminal.resize(invalid as number, 12)).rejects.toThrow(
      "terminal columns must be a positive safe integer",
    );
    await expect(result.terminal.resize(64, invalid as number)).rejects.toThrow(
      "terminal rows must be a positive safe integer",
    );
    expect(result.terminal.columns).toBe(40);
    expect(result.terminal.rows).toBe(10);
    expect(result.session.dimensions.terminal).toEqual({ columns: 40, rows: 10 });
  }
});

test("resize reaches the emulator after output already accepted by the host", async () => {
  let write: ((data: string) => void) | undefined;
  const App = defineComponent(() => {
    write = useStdout().write;
    return () => null;
  });
  const result = await render(App, {
    columns: 4,
    rows: 2,
    host: { stdout: "stream" },
  });

  write?.("\x1b[?1049h\x1b[2J\x1b[HABCDEFGH");
  await result.terminal.resize(8, 2);

  const screen = await result.screen();
  expect(screen.lines.map((line) => line.trimEnd())).toEqual(["ABCD", "EFGH"]);
});

test("render snapshots every root and host accessor exactly once", async () => {
  const calls = new Map<string, number>();
  const getter = (name: string, first: unknown, later: unknown) => ({
    enumerable: true,
    get() {
      const count = (calls.get(name) ?? 0) + 1;
      calls.set(name, count);
      return count === 1 ? first : later;
    },
  });
  const host = Object.defineProperties(
    {},
    {
      mode: getter("mode", "inline", "sideways"),
      presentation: getter("presentation", "visual", "audio"),
      updates: getter("updates", "live", "sometimes"),
      stdin: getter("stdin", "tty", "maybe"),
      stdout: getter("stdout", "tty", "file"),
    },
  );
  const options = Object.defineProperties(
    {},
    {
      host: getter("host", host, null),
      columns: getter("columns", 40, 0),
      rows: getter("rows", 10, 0),
      props: getter("props", { label: "first" }, null),
      exitOnCtrlC: getter("exitOnCtrlC", false, "yes"),
    },
  );

  const result = await render(() => <Text>accessors</Text>, options as RenderOptions);

  expect(result.terminal.columns).toBe(40);
  expect(result.terminal.rows).toBe(10);
  expect(Object.fromEntries(calls)).toEqual({
    host: 1,
    columns: 1,
    rows: 1,
    props: 1,
    exitOnCtrlC: 1,
    mode: 1,
    presentation: 1,
    updates: 1,
    stdin: 1,
    stdout: 1,
  });
});

test("an invalid accessor value fails before component setup", async () => {
  let setupRan = false;
  let reads = 0;
  const App = defineComponent(() => {
    setupRan = true;
    return () => <Text>invalid accessor</Text>;
  });
  const options = Object.defineProperty({}, "exitOnCtrlC", {
    enumerable: true,
    get() {
      reads++;
      return "yes";
    },
  });

  await expect(render(App, options as RenderOptions)).rejects.toThrow(
    "render option exitOnCtrlC must be a boolean or undefined",
  );
  expect(reads).toBe(1);
  expect(setupRan).toBe(false);
});

test.each([
  [{ host: { mode: "sideways" } }, "render host mode"],
  [{ host: { mode: null } }, "render host mode"],
  [{ host: { presentation: "audio" } }, "render host presentation"],
  [{ host: { presentation: null } }, "render host presentation"],
  [{ host: { updates: "sometimes" } }, "render host updates"],
  [{ host: { updates: null } }, "render host updates"],
  [{ host: { stdin: "maybe" } }, "render host stdin"],
  [{ host: { stdin: null } }, "render host stdin"],
  [{ host: { stdout: "file" } }, "render host stdout"],
  [{ host: { stdout: null } }, "render host stdout"],
  [{ columns: 0 }, "render columns"],
  [{ rows: Number.NaN }, "render rows"],
  [{ liveUpdates: false }, 'render option "liveUpdates" was removed'],
  [{ debug: true }, 'render option "debug" was removed'],
] as const)("invalid modeled host %# fails before component setup", async (options, message) => {
  let setupRan = false;
  const App = defineComponent(() => {
    setupRan = true;
    return () => <Text>invalid</Text>;
  });

  await expect(render(App, options as never)).rejects.toThrow(message);
  expect(setupRan).toBe(false);
});
