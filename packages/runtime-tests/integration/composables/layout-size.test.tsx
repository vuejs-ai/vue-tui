import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text, useLayoutSize } from "@vue-tui/runtime";
import {
  INTERNAL_RENDER_OBSERVER,
  type InternalRenderObserver,
} from "../../../runtime/dist/internal.mjs";
import { INTERNAL_TERMINAL_SIZE_PROBE } from "../../../runtime/dist/internal.mjs";
import { createInternalMountOptions } from "../../../runtime/dist/internal.mjs";

// A TTY-like writable that we control directly (columns/rows + resize listeners)
// — the @vue-tui/testing render() helper hides the underlying stdout, but the
// fallback-and-listener locks below need to read listenerCount('resize') and
// mount with columns:0 / no rows, mirroring Ink's createStdout-based fixtures.
function makeTtyStream(columns: number, rows?: number): NodeJS.WriteStream {
  const s = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(s, { columns, isTTY: true });
  if (rows !== undefined) (s as unknown as { rows: number }).rows = rows;
  return s;
}

function makeFakeStdin(): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode() {
      return s;
    },
    setEncoding() {
      return s;
    },
  });
  (s as unknown as { ref: () => void }).ref = () => {};
  (s as unknown as { unref: () => void }).unref = () => {};
  return s;
}

test.each(["inline", "fullscreen"] as const)(
  "layout size reacts to a bounded %s resize from one coherent snapshot",
  async (mode) => {
    const App = defineComponent(() => {
      const { width, height } = useLayoutSize();
      return () => (
        <Text>
          {width.value}x{height.value}
        </Text>
      );
    });

    const { lastFrame, terminal } = await render(App, {
      columns: 80,
      rows: 24,
      host: { mode },
    });
    expect(lastFrame()).toContain("80x24");

    await terminal.resize(120, 40);
    expect(lastFrame()).toContain("120x40");
  },
);

test("layout size returns the initial bounded dimensions", async () => {
  const App = defineComponent(() => {
    const { width, height } = useLayoutSize();
    return () => (
      <Text>
        {width.value}x{height.value}
      </Text>
    );
  });

  const { lastFrame } = await render(App, { columns: 100, rows: 40 });
  expect(lastFrame()).toContain("100x40");
});

test("layout size refs retain their final values after unmount", async () => {
  let layout: ReturnType<typeof useLayoutSize> | undefined;
  const App = defineComponent(() => {
    layout = useLayoutSize();
    return () => (
      <Text>
        {layout!.width.value}x{layout!.height.value}
      </Text>
    );
  });

  const { lastFrame, unmount, terminal } = await render(App, { columns: 80, rows: 24 });
  expect(lastFrame()).toContain("80x24");

  unmount();
  await expect(terminal.resize(60, 20)).resolves.toBeUndefined();
  expect(layout!.width.value).toBe(80);
  expect(layout!.height.value).toBe(24);
});

test("mounted non-TTY document host exposes fixed modeled 80x24 layout", async () => {
  const App = defineComponent(() => {
    const { width, height } = useLayoutSize();
    return () => <Text>{`${width.value}x${height.value}`}</Text>;
  });

  const result = await render(App, {
    columns: 40,
    rows: 10,
    host: { stdout: "stream" },
  });
  try {
    expect(result.lastFrame()).toContain("80x24");
  } finally {
    result.dispose();
  }
});

test("layout responds to terminal width change", async () => {
  const App = defineComponent(() => {
    return () => (
      <Box borderStyle="round">
        <Text>Hello World</Text>
      </Box>
    );
  });

  const { lastFrame, terminal } = await render(App, { columns: 100, rows: 24 });
  const initialFrame = lastFrame()!;
  expect(initialFrame).toContain("Hello World");

  await terminal.resize(50, 24);
  const resizedFrame = lastFrame()!;
  expect(resizedFrame).toContain("Hello World");
  // Output should differ because column count changed
  expect(initialFrame).not.toBe(resizedFrame);
});

test("multiple consecutive resizes all take effect", async () => {
  const App = defineComponent(() => {
    const { width, height } = useLayoutSize();
    return () => (
      <Text>
        {width.value}x{height.value}
      </Text>
    );
  });

  const { lastFrame, terminal } = await render(App, { columns: 80, rows: 24 });
  expect(lastFrame()).toContain("80x24");

  await terminal.resize(100, 30);
  expect(lastFrame()).toContain("100x30");

  await terminal.resize(60, 20);
  expect(lastFrame()).toContain("60x20");

  await terminal.resize(120, 40);
  expect(lastFrame()).toContain("120x40");
});

test("terminal width decrease triggers rerender", async () => {
  const App = defineComponent(() => {
    const { width } = useLayoutSize();
    return () => <Text>{width.value}</Text>;
  });

  const { lastFrame, terminal } = await render(App, { columns: 100, rows: 24 });
  expect(lastFrame()).toContain("100");

  await terminal.resize(50, 24);
  expect(lastFrame()).toContain("50");
});

test("terminal width increase triggers rerender", async () => {
  const App = defineComponent(() => {
    const { width } = useLayoutSize();
    return () => <Text>{width.value}</Text>;
  });

  const { lastFrame, terminal } = await render(App, { columns: 50, rows: 24 });
  expect(lastFrame()).toContain("50");

  await terminal.resize(100, 24);
  expect(lastFrame()).toContain("100");
});

// Mirrors Ink terminal-resize.tsx:91-108 ("falls back to a positive column
// count when stdout.columns is 0"). When the mount stdout reports columns 0,
// the session must still choose a positive layout fallback (never 0).
test("useLayoutSize falls back to a positive width when stdout.columns is 0", async () => {
  const stdout = makeTtyStream(0, 24);
  const stderr = makeTtyStream(0, 24);
  const stdin = makeFakeStdin();

  let capturedColumns = -1;
  const App = defineComponent(() => {
    const { width } = useLayoutSize();
    capturedColumns = width.value;
    return () => <Text>{String(width.value)}</Text>;
  });

  const app = createApp(App);
  app.mount(createInternalMountOptions({ stdout, stdin, stderr, maxFps: 0 }));
  await new Promise<void>((r) => setTimeout(r, 60));

  try {
    expect(capturedColumns).toBeGreaterThan(0);
  } finally {
    app.unmount();
  }
});

// Mirrors Ink terminal-resize.tsx:43-64 ("removes resize listener on unmount").
// One render session owns one resize listener. Calling the layout primitives
// repeatedly must not register another environment resolver per consumer.
test("multiple layout size consumers share one app resize listener", async () => {
  const stdout = makeTtyStream(80, 24);
  const stderr = makeTtyStream(80, 24);
  const stdin = makeFakeStdin();

  const baseline = stdout.listenerCount("resize");

  const App = defineComponent(() => {
    const first = useLayoutSize();
    const second = useLayoutSize();
    return () => (
      <Text>
        {first.width.value}x{first.height.value}:{second.width.value}x{second.height.value}
      </Text>
    );
  });

  const app = createApp(App);
  app.mount(createInternalMountOptions({ stdout, stdin, stderr, maxFps: 0 }));
  await new Promise<void>((r) => setTimeout(r, 60));

  expect(stdout.listenerCount("resize")).toBe(baseline + 1);

  app.unmount();
  expect(stdout.listenerCount("resize")).toBe(baseline);
});

test("useLayoutSize derives a bounded height from an explicitly modeled terminal pair", async () => {
  const stdout = makeTtyStream(0);
  const stderr = makeTtyStream(0);
  const stdin = makeFakeStdin();

  let capturedRows: number | null = null;
  const App = defineComponent(() => {
    const { height } = useLayoutSize();
    capturedRows = height.value;
    return () => <Text>{String(height.value)}</Text>;
  });

  const app = createApp(App);
  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stdin,
        stderr,
        maxFps: 0,
        [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({
          kind: "detected",
          source: "environment",
          size: { columns: 123, rows: 45 },
        }),
      }),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 60));

    expect(capturedRows).toBe(45);
  } finally {
    app.unmount();
  }
});

test("rapid resize events commit only the newest layout and participate in the render barrier", async () => {
  const stdout = makeTtyStream(30, 8);
  const stderr = makeTtyStream(30, 8);
  const stdin = makeFakeStdin();
  const frames: string[] = [];
  const observer: InternalRenderObserver = {
    onCommit(commit) {
      if (commit.phase !== "teardown") frames.push(commit.dynamic);
    },
  };
  const App = defineComponent(() => {
    const { width, height } = useLayoutSize();
    return () => <Text>{`${width.value}x${height.value}`}</Text>;
  });
  const app = createApp(App);

  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stdin,
        stderr,
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
        [INTERNAL_RENDER_OBSERVER]: observer,
      }),
    );
    await app.waitUntilRenderFlush();
    frames.length = 0;

    stdout.columns = 24;
    stdout.rows = 6;
    stdout.emit("resize");
    stdout.columns = 18;
    stdout.rows = 5;
    stdout.emit("resize");
    await app.waitUntilRenderFlush();

    expect(frames.length).toBeGreaterThan(0);
    expect(frames).not.toContain("30x8");
    expect(frames).not.toContain("24x6");
    expect(frames.at(-1)).toBe("18x5");
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
