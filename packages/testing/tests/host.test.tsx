import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import {
  Box,
  Text,
  useInput,
  useLayoutWidth,
  useStdin,
  useStdout,
  useViewportHeight,
} from "@vue-tui/runtime";
import { useInternalInputRoutingForTest } from "@vue-tui/runtime/internal";
import { render, type RenderOptions } from "../src/index.ts";

test("the default host renders a visual Inline surface", async () => {
  const result = await render(() => <Text>default</Text>);

  expect(Object.hasOwn(result, "session")).toBe(false);
  expect(result.lastFrame()).toBe("default");
  const screen = await result.screen();
  expect(screen.activeBuffer).toBe("normal");
  expect(screen.dimensions).toEqual({ columns: 100, rows: 100 });
  expect([...screen.scrollback, ...screen.lines].join("\n")).toContain("default");
});

test("stream omission selects production final-output cadence", async () => {
  const result = await render(() => <Text>stream</Text>, {
    columns: 72,
    rows: 16,
    host: { stdout: "stream", mode: "fullscreen" },
  });

  expect(result.lastFrame()).toBe("stream");
  const beforeUnmount = await result.screen();
  expect(beforeUnmount.activeBuffer).toBe("normal");
  expect([...beforeUnmount.scrollback, ...beforeUnmount.lines].join("\n")).not.toContain("stream");
  expect(result.terminal.rows).toBe(16);

  result.unmount();
  const afterUnmount = await result.screen();
  expect([...afterUnmount.scrollback, ...afterUnmount.lines].join("\n")).toContain("stream");
});

test("a selected route owns deterministic TTY input independently from final output", async () => {
  const calls: string[] = [];
  let routing: ReturnType<typeof useInternalInputRoutingForTest> | undefined;
  const App = defineComponent(() => {
    routing = useInternalInputRoutingForTest();
    const boundary = routing.registerSemantic({
      id: "deterministic-boundary",
      handle: (fact) => {
        calls.push(fact.sequence);
        return {
          performed: true,
          continue: true,
          preventDefault: false,
          blockExternal: false,
        };
      },
    });
    routing.select({ activeBoundary: boundary.lease });
    return () => <Text>selected input</Text>;
  });
  const result = await render(App, {
    host: { stdin: "tty", stdout: "stream", updates: "at-teardown" },
  });

  expect(result.terminal.rawMode.current).toBe(true);
  await result.stdin.write("x");
  expect(calls).toEqual(["x"]);

  result.dispose();
  expect(result.terminal.rawMode.current).toBe(false);
  expect(routing!.resolve(routing!.capture()).kind).toBe("unselected");
});

test("a modeled non-TTY excludes managed routing but keeps direct stdin bytes available", async () => {
  const semanticCalls: string[] = [];
  const directCalls: string[] = [];
  let physicalStdin: NodeJS.ReadStream | undefined;
  let routing: ReturnType<typeof useInternalInputRoutingForTest> | undefined;
  let selectRoute!: () => () => void;
  const App = defineComponent(() => {
    physicalStdin = useStdin().stdin;
    routing = useInternalInputRoutingForTest();
    const boundary = routing.registerSemantic({
      id: "deterministic-boundary",
      handle: (fact) => {
        semanticCalls.push(fact.sequence);
        return {
          performed: true,
          continue: true,
          preventDefault: false,
          blockExternal: false,
        };
      },
    });
    selectRoute = () => routing!.select({ activeBoundary: boundary.lease });
    return () => <Text>non-tty</Text>;
  });
  const result = await render(App, { host: { stdin: "non-tty" } });
  const directListener = (chunk: Buffer | string) => directCalls.push(String(chunk));
  physicalStdin!.on("data", directListener);
  try {
    expect(selectRoute).toThrow(
      "Managed input is unavailable because the mounted stdin is not a controllable TTY",
    );
    expect(routing!.resolve(routing!.capture()).kind).toBe("unselected");
    expect(result.terminal.rawMode.history).toEqual([]);

    await result.stdin.write("x");
    expect(directCalls).toEqual(["x"]);
    expect(semanticCalls).toEqual([]);
  } finally {
    physicalStdin!.off("data", directListener);
    result.dispose();
  }
});

test("explicit live stream cannot manufacture a terminal mode", async () => {
  const result = await render(() => <Text>stream</Text>, {
    host: { stdout: "stream", updates: "live", mode: "fullscreen" },
  });

  expect(result.lastFrame()).toBe("stream");
  const screen = await result.screen();
  expect(screen.activeBuffer).toBe("normal");
  expect([...screen.scrollback, ...screen.lines].join("\n")).toContain("stream");
});

test("forced live stream refreshes its public layout and frame before input resumes", async () => {
  const rawModeSeenByFrame: boolean[] = [];
  const App = defineComponent(() => {
    const width = useLayoutWidth();
    const viewportHeight = useViewportHeight();
    const { stdin } = useStdin();
    useInput(() => {});
    const frame = () => {
      rawModeSeenByFrame.push(Boolean((stdin as NodeJS.ReadStream & { isRaw?: boolean }).isRaw));
      return `stream:${width.value}x${viewportHeight?.value ?? "unbounded"}`;
    };
    return () => <Text>{frame()}</Text>;
  });
  const result = await render(App, {
    columns: 30,
    rows: 8,
    host: { stdout: "stream", updates: "live" },
  });

  expect(result.lastFrame()).toBe("stream:30xunbounded");
  await result.terminal.suspend();
  await result.terminal.resize(24, 6);
  expect(result.lastFrame()).toBe("stream:30xunbounded");

  const resume = result.terminal.resume();
  expect(result.terminal.rawMode.current).toBe(false);
  await resume;

  expect(result.lastFrame()).toBe("stream:24xunbounded");
  expect(rawModeSeenByFrame.at(-1)).toBe(false);
  expect(result.terminal.rawMode.current).toBe(true);
  result.dispose();
});

test("a live resize never commits a frame derived from the previous layout", async () => {
  const App = defineComponent(() => {
    const width = useLayoutWidth();
    const viewportHeight = useViewportHeight();
    const frame = () => `stream:${width.value}x${viewportHeight?.value ?? "unbounded"}`;
    return () => <Text>{frame()}</Text>;
  });
  const result = await render(App, {
    columns: 30,
    rows: 8,
    host: { stdout: "stream", updates: "live" },
  });
  const resizeFrameOffset = result.frames.length;

  await result.terminal.resize(24, 6);

  const resizeFrames = result.frames.slice(resizeFrameOffset).map((frame) => frame.dynamic);
  expect(resizeFrames.length).toBeGreaterThan(0);
  expect(resizeFrames).not.toContain("stream:30xunbounded");
  expect(resizeFrames.at(-1)).toBe("stream:24xunbounded");
  result.dispose();
});

test("final stream keeps its mounted layout while suspended", async () => {
  const App = defineComponent(() => {
    const width = useLayoutWidth();
    const viewportHeight = useViewportHeight();
    return () => <Text>{`final:${width.value}x${viewportHeight?.value ?? "unbounded"}`}</Text>;
  });
  const result = await render(App, {
    columns: 30,
    rows: 8,
    host: { stdout: "stream" },
  });

  await result.terminal.suspend();
  await result.terminal.resize(24, 6);
  await result.terminal.resume();

  expect(result.lastFrame()).toBe("final:30xunbounded");
  result.dispose();
});

test("Fullscreen TTY exposes a fixed modeled viewport", async () => {
  const App = defineComponent(() => {
    const width = useLayoutWidth();
    const viewportHeight = useViewportHeight();
    return () => <Text>{`full:${width.value}x${viewportHeight?.value ?? "unbounded"}`}</Text>;
  });
  const result = await render(App, {
    columns: 30,
    rows: 8,
    host: { mode: "fullscreen" },
  });

  expect(result.lastFrame()).toBe("full:30x8");
  const screen = await result.screen();
  expect(screen.activeBuffer).toBe("alternate");
  expect(screen.dimensions).toEqual({ columns: 30, rows: 8 });
});

test("modeled Inline suspension releases input and repaints at the continued size", async () => {
  const App = defineComponent(() => {
    const width = useLayoutWidth();
    const viewportHeight = useViewportHeight();
    useInput(() => {});
    return () => <Text>{`inline:${width.value}x${viewportHeight?.value ?? "unbounded"}`}</Text>;
  });
  const result = await render(App, { columns: 30, rows: 8 });

  expect(result.terminal.rawMode.current).toBe(true);
  await result.terminal.suspend();
  expect(result.terminal.rawMode.current).toBe(false);
  const suspendedHistory = [
    ...(await result.screen()).scrollback,
    ...(await result.screen()).lines,
  ].join("\n");
  expect(suspendedHistory).toContain("inline:30x8");

  await result.terminal.resize(24, 6);
  await result.terminal.resume();

  expect(result.terminal.rawMode.current).toBe(true);
  expect(result.lastFrame()).toContain("inline:24x6");
  const resumedScreen = await result.screen();
  expect(resumedScreen.activeBuffer).toBe("normal");
  expect([...resumedScreen.scrollback, ...resumedScreen.lines].join("\n")).toContain("inline:30x8");
  result.dispose();
});

test("modeled Fullscreen suspension restores and reacquires the alternate screen", async () => {
  const App = defineComponent(() => {
    const width = useLayoutWidth();
    const viewportHeight = useViewportHeight();
    return () => <Text>{`fullscreen:${width.value}x${viewportHeight?.value ?? "unbounded"}`}</Text>;
  });
  const result = await render(App, {
    columns: 30,
    rows: 8,
    host: { mode: "fullscreen" },
  });

  expect((await result.screen()).activeBuffer).toBe("alternate");
  await result.terminal.suspend();
  expect((await result.screen()).activeBuffer).toBe("normal");

  await result.terminal.resize(24, 6);
  await result.terminal.resume();

  const screen = await result.screen();
  expect(screen.activeBuffer).toBe("alternate");
  expect(result.lastFrame()).toContain("fullscreen:24x6");
  result.dispose();
});

test("Fullscreen screen-reader request resolves to an Inline transcript", async () => {
  const result = await render(
    () => (
      <Box ariaLabel="screen-reader transcript">
        <Text>visual child</Text>
      </Box>
    ),
    {
      host: { mode: "fullscreen", presentation: "screen-reader" },
    },
  );

  expect(result.lastFrame()).toContain("screen-reader transcript");
  expect(result.lastFrame()).not.toContain("visual child");
  expect((await result.screen()).activeBuffer).toBe("normal");
});

test("modeled screen-reader transcript suspends and resumes without acquiring Fullscreen", async () => {
  const App = defineComponent(() => {
    const width = useLayoutWidth();
    const viewportHeight = useViewportHeight();
    useInput(() => {});
    return () => <Text>{`transcript:${width.value}x${viewportHeight?.value ?? "unbounded"}`}</Text>;
  });
  const result = await render(App, {
    columns: 30,
    rows: 8,
    host: { mode: "fullscreen", presentation: "screen-reader" },
  });

  expect(result.lastFrame()).toContain("transcript:30xunbounded");
  await result.terminal.suspend();
  expect(result.terminal.rawMode.current).toBe(false);
  expect((await result.screen()).activeBuffer).toBe("normal");
  await result.terminal.resize(24, 6);
  await result.terminal.resume();

  expect(result.terminal.rawMode.current).toBe(true);
  expect(result.lastFrame()).toContain("transcript:24xunbounded");
  expect((await result.screen()).activeBuffer).toBe("normal");
  result.dispose();
});

test.each(["at-teardown", "live"] as const)(
  "modeled %s stream restores input modes without manufacturing a terminal surface",
  async (updates) => {
    const App = defineComponent(() => {
      useInput(() => {});
      return () => <Text>{`stream:${updates}`}</Text>;
    });
    const result = await render(App, {
      host: { stdout: "stream", updates, mode: "fullscreen" },
    });

    expect(result.terminal.rawMode.current).toBe(true);
    await result.terminal.suspend();
    expect(result.terminal.rawMode.current).toBe(false);
    await result.terminal.resume();
    expect(result.terminal.rawMode.current).toBe(true);
    expect((await result.screen()).activeBuffer).toBe("normal");
    result.dispose();
  },
);

test("Inline clamps tall dynamic output without padding short output", async () => {
  const short = await render(() => <Text>short</Text>, { columns: 20, rows: 3 });
  try {
    expect(short.lastFrame({ raw: true })).toBe("short");
  } finally {
    short.dispose();
  }

  const tall = await render(
    () => (
      <Box height={5} flexShrink={0} flexDirection="column">
        {Array.from({ length: 5 }, (_, index) => (
          <Text key={index}>line {index + 1}</Text>
        ))}
      </Box>
    ),
    { columns: 20, rows: 3 },
  );
  try {
    expect(tall.lastFrame()).toBe("line 1\nline 2\nline 3");
  } finally {
    tall.dispose();
  }
});

test("Inline hard-clips a non-shrinking wide child before terminal wrapping", async () => {
  const result = await render(
    () => (
      <Box width={10} flexShrink={0}>
        <Text>abcdefghij</Text>
      </Box>
    ),
    { columns: 5, rows: 2 },
  );

  try {
    expect(result.lastFrame({ raw: true })).toBe("abcde");
    expect((await result.screen()).lines.map((line) => line.trimEnd())).toEqual(["abcde", ""]);
  } finally {
    result.dispose();
  }
});

test("resize updates public layout facts before the resulting frame is observed", async () => {
  let observedWidth = 0;
  let observedHeight = 0;
  const App = defineComponent(() => {
    const width = useLayoutWidth();
    const viewportHeight = useViewportHeight();
    return () => {
      observedWidth = width.value;
      observedHeight = viewportHeight?.value ?? 0;
      return <Text>{`${observedWidth}x${observedHeight}`}</Text>;
    };
  });
  const result = await render(App);

  await result.terminal.resize(64, 12);

  expect(observedWidth).toBe(64);
  expect(observedHeight).toBe(12);
  expect(result.lastFrame()).toBe("64x12");
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
  }
});

test("render and resize reject dimensions outside the modeled terminal envelope", async () => {
  await expect(render(() => <Text>too wide</Text>, { columns: 65_536, rows: 1 })).rejects.toThrow(
    "render columns must be no greater than 65535",
  );
  await expect(render(() => <Text>too tall</Text>, { columns: 1, rows: 65_536 })).rejects.toThrow(
    "render rows must be no greater than 65535",
  );
  await expect(
    render(() => <Text>too many cells</Text>, { columns: 2_048, rows: 1_024 }),
  ).rejects.toThrow("modeled terminal 2048x1024 exceeds the 1048576-cell test-host limit");

  const result = await render(() => <Text>resize</Text>, { columns: 40, rows: 10 });
  try {
    await expect(result.terminal.resize(65_536, 1)).rejects.toThrow(
      "terminal columns must be no greater than 65535",
    );
    await expect(result.terminal.resize(1, 65_536)).rejects.toThrow(
      "terminal rows must be no greater than 65535",
    );
    await expect(result.terminal.resize(2_048, 1_024)).rejects.toThrow(
      "modeled terminal 2048x1024 exceeds the 1048576-cell test-host limit",
    );
    expect(result.terminal.columns).toBe(40);
    expect(result.terminal.rows).toBe(10);
  } finally {
    result.dispose();
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
      clipboard: getter("clipboard", "copied", "invalid"),
    },
  );
  const options = Object.defineProperties(
    {},
    {
      host: getter("host", host, null),
      columns: getter("columns", 40, 0),
      rows: getter("rows", 10, 0),
      props: getter("props", { label: "first" }, null),
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
    mode: 1,
    presentation: 1,
    updates: 1,
    stdin: 1,
    stdout: 1,
    clipboard: 1,
  });
});

test("a removed option fails before its accessor or component setup runs", async () => {
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
    'Unknown render option "exitOnCtrlC"',
  );
  expect(reads).toBe(0);
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
  [{ host: { clipboard: "system" } }, "render host clipboard"],
  [{ host: { clipboard: null } }, "render host clipboard"],
  [{ columns: 0 }, "render columns"],
  [{ rows: Number.NaN }, "render rows"],
  [{ liveUpdates: false }, 'render option "liveUpdates" was removed'],
  [{ debug: true }, 'render option "debug" was removed'],
  [{ exitOnCtrlC: false }, 'Unknown render option "exitOnCtrlC"'],
] as const)("invalid modeled host %# fails before component setup", async (options, message) => {
  let setupRan = false;
  const App = defineComponent(() => {
    setupRan = true;
    return () => <Text>invalid</Text>;
  });

  await expect(render(App, options as never)).rejects.toThrow(message);
  expect(setupRan).toBe(false);
});
