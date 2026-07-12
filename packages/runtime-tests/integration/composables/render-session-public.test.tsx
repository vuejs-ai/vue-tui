import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { render, type RenderOptions } from "@vue-tui/testing";
import {
  createApp,
  Text,
  renderToString,
  useLayoutSize,
  useRenderSession,
  type RenderSession,
} from "@vue-tui/runtime";
import {
  INTERNAL_TERMINAL_SIZE_PROBE,
  renderToStringWithScreenReader,
} from "@vue-tui/runtime/internal";

function makePublicTty(columns?: number, rows?: number): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true });
  if (columns !== undefined) stream.columns = columns;
  if (rows !== undefined) stream.rows = rows;
  return stream;
}

function makePublicStdin(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream;
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

test("public session and layout projections share one reactive source", async () => {
  let first: RenderSession | undefined;
  let second: RenderSession | undefined;
  const App = defineComponent(() => {
    first = useRenderSession();
    second = useRenderSession();
    const { columns, rows } = useLayoutSize();
    return () => <Text>{`${columns.value}x${rows.value ?? "unbounded"}`}</Text>;
  });

  const result = await render(App, { columns: 80, rows: 24 });
  expect(first).toBe(second);
  expect(result.session).toBe(first);
  expect(result.lastFrame()).toBe("80x24");

  await result.terminal.resize(64, 12);
  expect(result.session.dimensions.layout).toEqual({ columns: 64, rows: 12 });
  expect(result.lastFrame()).toBe("64x12");
  result.dispose();
});

const liveHostCases: readonly {
  readonly name: string;
  readonly options: RenderOptions;
  readonly expected: Extract<RenderSession, { readonly host: "live" }>;
}[] = [
  {
    name: "visual Inline TTY",
    options: { columns: 80, rows: 24 },
    expected: {
      host: "live",
      mode: { requested: "inline", effective: "inline", fallback: null },
      output: { destination: "terminal", dynamicUpdates: "live", presentation: "visual" },
      dimensions: {
        terminal: { columns: 80, rows: 24 },
        layout: { columns: 80, rows: 24 },
      },
      capabilities: { stableOrigin: false, elementHitTesting: false, suspension: true },
    },
  },
  {
    name: "visual Fullscreen TTY",
    options: { columns: 80, rows: 24, host: { mode: "fullscreen" } },
    expected: {
      host: "live",
      mode: { requested: "fullscreen", effective: "fullscreen", fallback: null },
      output: { destination: "terminal", dynamicUpdates: "live", presentation: "visual" },
      dimensions: {
        terminal: { columns: 80, rows: 24 },
        layout: { columns: 80, rows: 24 },
      },
      capabilities: { stableOrigin: true, elementHitTesting: true, suspension: true },
    },
  },
  {
    name: "screen-reader Inline TTY",
    options: {
      columns: 80,
      rows: 24,
      host: { mode: "inline", presentation: "screen-reader" },
    },
    expected: {
      host: "live",
      mode: { requested: "inline", effective: "inline", fallback: null },
      output: {
        destination: "terminal",
        dynamicUpdates: "live",
        presentation: "screen-reader",
      },
      dimensions: {
        terminal: { columns: 80, rows: 24 },
        layout: { columns: 80, rows: null },
      },
      capabilities: { stableOrigin: false, elementHitTesting: false, suspension: true },
    },
  },
  {
    name: "Fullscreen screen-reader transcript",
    options: {
      columns: 80,
      rows: 24,
      host: { mode: "fullscreen", presentation: "screen-reader" },
    },
    expected: {
      host: "live",
      mode: {
        requested: "fullscreen",
        effective: "inline",
        fallback: "screen-reader-transcript",
      },
      output: {
        destination: "terminal",
        dynamicUpdates: "live",
        presentation: "screen-reader",
      },
      dimensions: {
        terminal: { columns: 80, rows: 24 },
        layout: { columns: 80, rows: null },
      },
      capabilities: { stableOrigin: false, elementHitTesting: false, suspension: true },
    },
  },
  {
    name: "final stream",
    options: {
      columns: 80,
      rows: 24,
      host: { mode: "fullscreen", stdout: "stream", updates: "at-teardown" },
    },
    expected: {
      host: "live",
      mode: {
        requested: "fullscreen",
        effective: null,
        fallback: "live-updates-disabled",
      },
      output: { destination: "stream", dynamicUpdates: "at-teardown", presentation: "visual" },
      dimensions: { terminal: null, layout: { columns: 80, rows: null } },
      capabilities: { stableOrigin: false, elementHitTesting: false, suspension: true },
    },
  },
  {
    name: "screen-reader final stream",
    options: {
      columns: 80,
      rows: 24,
      host: {
        mode: "inline",
        presentation: "screen-reader",
        stdout: "stream",
        updates: "at-teardown",
      },
    },
    expected: {
      host: "live",
      mode: { requested: "inline", effective: null, fallback: "live-updates-disabled" },
      output: {
        destination: "stream",
        dynamicUpdates: "at-teardown",
        presentation: "screen-reader",
      },
      dimensions: { terminal: null, layout: { columns: 80, rows: null } },
      capabilities: { stableOrigin: false, elementHitTesting: false, suspension: true },
    },
  },
  {
    name: "live stream",
    options: {
      columns: 80,
      rows: 24,
      host: { mode: "fullscreen", stdout: "stream", updates: "live" },
    },
    expected: {
      host: "live",
      mode: { requested: "fullscreen", effective: null, fallback: "stdout-not-tty" },
      output: { destination: "stream", dynamicUpdates: "live", presentation: "visual" },
      dimensions: { terminal: null, layout: { columns: 80, rows: null } },
      capabilities: { stableOrigin: false, elementHitTesting: false, suspension: true },
    },
  },
  {
    name: "screen-reader live stream",
    options: {
      columns: 80,
      rows: 24,
      host: {
        mode: "fullscreen",
        presentation: "screen-reader",
        stdout: "stream",
        updates: "live",
      },
    },
    expected: {
      host: "live",
      mode: { requested: "fullscreen", effective: null, fallback: "stdout-not-tty" },
      output: {
        destination: "stream",
        dynamicUpdates: "live",
        presentation: "screen-reader",
      },
      dimensions: { terminal: null, layout: { columns: 80, rows: null } },
      capabilities: { stableOrigin: false, elementHitTesting: false, suspension: true },
    },
  },
];

test.each(liveHostCases)(
  "public session exposes the modeled $name facts",
  async ({ options, expected }) => {
    let observed: RenderSession | undefined;
    const App = defineComponent(() => {
      observed = useRenderSession();
      return () => <Text>session</Text>;
    });

    const result = await render(App, options);
    expect(observed).toBe(result.session);
    expect(observed).toEqual(expected);
    result.dispose();
  },
);

test("public hooks expose terminal-size fallback facts for a visual TTY without a coherent size", async () => {
  const stdout = makePublicTty();
  const stderr = makePublicTty();
  const stdin = makePublicStdin();
  let observed: RenderSession | undefined;
  const App = defineComponent(() => {
    observed = useRenderSession();
    return () => <Text>unavailable</Text>;
  });
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
      [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
    } as never);

    expect(observed).toEqual({
      host: "live",
      mode: {
        requested: "fullscreen",
        effective: null,
        fallback: "terminal-size-unavailable",
      },
      output: { destination: "stream", dynamicUpdates: "at-teardown", presentation: "visual" },
      dimensions: { terminal: null, layout: { columns: 80, rows: null } },
      capabilities: { stableOrigin: false, elementHitTesting: false, suspension: true },
    });
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("public hooks retain detected terminal dimensions when live updates are disabled", async () => {
  const stdout = makePublicTty(80, 24);
  const stderr = makePublicTty(80, 24);
  const stdin = makePublicStdin();
  let observed: RenderSession | undefined;
  const App = defineComponent(() => {
    observed = useRenderSession();
    return () => <Text>final</Text>;
  });
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: false,
      maxFps: 0,
      patchConsole: false,
    });

    expect(observed).toEqual({
      host: "live",
      mode: {
        requested: "fullscreen",
        effective: null,
        fallback: "live-updates-disabled",
      },
      output: { destination: "stream", dynamicUpdates: "at-teardown", presentation: "visual" },
      dimensions: {
        terminal: { columns: 80, rows: 24 },
        layout: { columns: 80, rows: null },
      },
      capabilities: { stableOrigin: false, elementHitTesting: false, suspension: true },
    });
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("public session and layout refs reject runtime mutation", async () => {
  let observed: RenderSession | undefined;
  let layout: ReturnType<typeof useLayoutSize> | undefined;
  const App = defineComponent(() => {
    observed = useRenderSession();
    layout = useLayoutSize();
    return () => <Text>{layout?.columns.value}</Text>;
  });
  const result = await render(App, { columns: 80, rows: 24 });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const attemptMutation = (mutation: () => void) => {
    try {
      mutation();
    } catch {
      // Nested snapshots are frozen; Vue readonly refs warn and ignore the write.
    }
  };

  try {
    attemptMutation(() => {
      (observed!.dimensions.layout as { columns: number }).columns = 1;
    });
    attemptMutation(() => {
      (layout!.rows as { value: number | null }).value = 1;
    });
    attemptMutation(() => {
      (observed!.capabilities as { stableOrigin: boolean }).stableOrigin = true;
    });

    expect(observed!.dimensions.layout).toEqual({ columns: 80, rows: 24 });
    expect(observed!.capabilities.stableOrigin).toBe(false);
    expect(layout!.columns.value).toBe(80);
    expect(layout!.rows.value).toBe(24);
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
    result.dispose();
  }
});

test("public session hooks fail clearly outside a vue-tui render tree", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    expect(() => useRenderSession()).toThrow(
      "render session is unavailable outside a vue-tui render tree",
    );
    expect(() => useLayoutSize()).toThrow(
      "render session is unavailable outside a vue-tui render tree",
    );
  } finally {
    warn.mockRestore();
  }
});

test("a public session remains a stable final snapshot after teardown", async () => {
  let observed: RenderSession | undefined;
  let layout: ReturnType<typeof useLayoutSize> | undefined;
  const App = defineComponent(() => {
    observed = useRenderSession();
    layout = useLayoutSize();
    return () => <Text>snapshot</Text>;
  });
  const result = await render(App, { columns: 80, rows: 24 });

  result.unmount();
  await result.terminal.resize(40, 10);

  expect(observed).toBe(result.session);
  expect(observed!.dimensions).toEqual({
    terminal: { columns: 80, rows: 24 },
    layout: { columns: 80, rows: 24 },
  });
  expect(layout!.columns.value).toBe(80);
  expect(layout!.rows.value).toBe(24);
  result.dispose();
});

test.each([
  ["visual", renderToString],
  ["screen-reader", renderToStringWithScreenReader],
] as const)(
  "the %s string host exposes a public unbounded document session",
  (presentation, renderDocument) => {
    let observed: RenderSession | undefined;
    let repeated: RenderSession | undefined;
    let layout: ReturnType<typeof useLayoutSize> | undefined;
    const App = defineComponent(() => {
      observed = useRenderSession();
      repeated = useRenderSession();
      const currentLayout = useLayoutSize();
      layout = currentLayout;
      return () => (
        <Text>{`${currentLayout.columns.value}x${currentLayout.rows.value ?? "unbounded"}`}</Text>
      );
    });

    expect(renderDocument(App, { columns: 37 })).toBe("37xunbounded");
    expect(observed).toBe(repeated);
    expect(observed).toEqual({
      host: "string",
      mode: null,
      output: { destination: "document", dynamicUpdates: "none", presentation },
      dimensions: { terminal: null, layout: { columns: 37, rows: null } },
      capabilities: {
        stableOrigin: false,
        elementHitTesting: false,
        suspension: false,
      },
    });
    expect(layout!.columns.value).toBe(37);
    expect(layout!.rows.value).toBeNull();
  },
);
