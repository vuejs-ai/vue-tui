import { defineComponent, onScopeDispose } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useTerminalSize } from "@vue-tui/runtime";

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
