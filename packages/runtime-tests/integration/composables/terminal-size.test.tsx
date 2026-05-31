import { PassThrough } from "node:stream";
import { defineComponent, onScopeDispose } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text, useTerminalSize } from "@vue-tui/runtime";

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

test("useTerminalSize reacts to resize event", async () => {
  const App = defineComponent(() => {
    const { columns, rows } = useTerminalSize();
    return () => (
      <Text>
        {columns.value}x{rows.value}
      </Text>
    );
  });

  const { lastFrame, terminal } = await render(App, { columns: 80, rows: 24 });
  expect(lastFrame()).toContain("80x24");

  await terminal.resize(120, 40);
  expect(lastFrame()).toContain("120x40");
});

test("useTerminalSize returns initial terminal dimensions", async () => {
  const App = defineComponent(() => {
    const { columns, rows } = useTerminalSize();
    return () => (
      <Text>
        {columns.value}x{rows.value}
      </Text>
    );
  });

  const { lastFrame } = await render(App, { columns: 100, rows: 40 });
  expect(lastFrame()).toContain("100x40");
});

test("useTerminalSize removes resize listener on unmount", async () => {
  // After unmount, further resize events should not cause errors
  const App = defineComponent(() => {
    const { columns, rows } = useTerminalSize();
    return () => (
      <Text>
        {columns.value}x{rows.value}
      </Text>
    );
  });

  const { lastFrame, unmount, terminal } = await render(App, { columns: 80, rows: 24 });
  expect(lastFrame()).toContain("80x24");

  unmount();

  // Resize after unmount should not throw
  await expect(terminal.resize(60, 20)).resolves.toBeUndefined();
});

test("useTerminalSize does not crash when resize fires after unmount", async () => {
  const App = defineComponent(() => {
    const { columns, rows } = useTerminalSize();
    return () => (
      <Text>
        {columns.value}x{rows.value}
      </Text>
    );
  });

  const { unmount, terminal } = await render(App, { columns: 80, rows: 24 });
  unmount();

  // Emitting resize after unmount should not crash
  await terminal.resize(60, 20);
  // If we reach here without throwing, the test passes
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
    const { columns, rows } = useTerminalSize();
    return () => (
      <Text>
        {columns.value}x{rows.value}
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
    const { columns } = useTerminalSize();
    return () => <Text>{columns.value}</Text>;
  });

  const { lastFrame, terminal } = await render(App, { columns: 100, rows: 24 });
  expect(lastFrame()).toContain("100");

  await terminal.resize(50, 24);
  expect(lastFrame()).toContain("50");
});

test("terminal width increase triggers rerender", async () => {
  const App = defineComponent(() => {
    const { columns } = useTerminalSize();
    return () => <Text>{columns.value}</Text>;
  });

  const { lastFrame, terminal } = await render(App, { columns: 50, rows: 24 });
  expect(lastFrame()).toContain("50");

  await terminal.resize(100, 24);
  expect(lastFrame()).toContain("100");
});

test("resize listener is cleaned up via onScopeDispose", async () => {
  let disposeCalled = false;

  const App = defineComponent(() => {
    // useTerminalSize registers an onScopeDispose listener internally;
    // we also register one to verify the scope is properly disposed on unmount.
    useTerminalSize();
    onScopeDispose(() => {
      disposeCalled = true;
    });
    return () => <Text>watching</Text>;
  });

  const { unmount } = await render(App, { columns: 80, rows: 24 });
  expect(disposeCalled).toBe(false);

  unmount();
  expect(disposeCalled).toBe(true);
});

// Mirrors Ink terminal-resize.tsx:91-108 ("falls back to a positive column
// count when stdout.columns is 0"). When the mount stdout reports columns 0,
// resolveSize() falls through to the terminal-size package / 80 default, so the
// captured value must be a positive number (never 0).
test("useTerminalSize falls back to a positive column count when stdout.columns is 0", async () => {
  const stdout = makeTtyStream(0, 24);
  const stderr = makeTtyStream(0, 24);
  const stdin = makeFakeStdin();

  let capturedColumns = -1;
  const App = defineComponent(() => {
    const { columns } = useTerminalSize();
    capturedColumns = columns.value;
    return () => <Text>{String(columns.value)}</Text>;
  });

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: false });
  await new Promise<void>((r) => setTimeout(r, 60));

  try {
    expect(capturedColumns).toBeGreaterThan(0);
  } finally {
    app.unmount();
  }
});

// Mirrors Ink terminal-resize.tsx:43-64 ("removes resize listener on unmount").
// The resize listener count must grow by mounting a useTerminalSize component
// and return exactly to baseline after unmount (no leaked listener).
test("useTerminalSize resize listener returns to baseline on unmount", async () => {
  const stdout = makeTtyStream(80, 24);
  const stderr = makeTtyStream(80, 24);
  const stdin = makeFakeStdin();

  const baseline = stdout.listenerCount("resize");

  const App = defineComponent(() => {
    const { columns, rows } = useTerminalSize();
    return () => (
      <Text>
        {columns.value}x{rows.value}
      </Text>
    );
  });

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: false });
  await new Promise<void>((r) => setTimeout(r, 60));

  expect(stdout.listenerCount("resize")).toBeGreaterThan(baseline);

  app.unmount();
  expect(stdout.listenerCount("resize")).toBe(baseline);
});
