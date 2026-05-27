import { defineComponent, onMounted, onScopeDispose, shallowRef, watchSyncEffect } from "vue";
import chalk from "chalk";
import { describe, test, expect } from "vite-plus/test";
import {
  renderToString,
  Box,
  Text,
  Newline,
  Spacer,
  Static,
  Transform,
  useInput,
  useExit,
  useFocus,
  useFocusManager,
  useStdin,
  useStdout,
  useStderr,
} from "@vue-tui/runtime";

describe("renderToString", () => {
  test("renders component to string", () => {
    const App = defineComponent(() => () => (
      <Box>
        <Text>Hello</Text>
      </Box>
    ));
    const output = renderToString(App, { columns: 40 });
    expect(output).toContain("Hello");
  });

  test("defaults to 80 columns", () => {
    const App = defineComponent(() => {
      return () => <Text>test</Text>;
    });
    const output = renderToString(App);
    expect(output).toBe("test");
  });

  test("rethrows component errors after cleanup", () => {
    const App = defineComponent(() => {
      throw new Error("boom");
    });
    expect(() => renderToString(App)).toThrow("boom");
  });

  test("renders nested layout", () => {
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>Line 1</Text>
        <Text>Line 2</Text>
      </Box>
    ));
    const output = renderToString(App, { columns: 20 });
    expect(output).toContain("Line 1");
    expect(output).toContain("Line 2");
  });

  test("useInput does not throw in renderToString", () => {
    const App = defineComponent(() => {
      useInput(() => {});
      return () => <Text>with input</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with input");
  });

  test("useExit does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const exit = useExit();
      // exit is a function but calling it is a no-op
      void exit;
      return () => <Text>with exit</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with exit");
  });

  test("useFocus does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const { isFocused } = useFocus();
      return () => <Text>focused: {String(isFocused.value)}</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("focused:");
  });

  test("useFocusManager does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const fm = useFocusManager();
      void fm;
      return () => <Text>with focus manager</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with focus manager");
  });

  test("useStdin does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const stdin = useStdin();
      void stdin;
      return () => <Text>with stdin</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with stdin");
  });

  test("useStdout does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const stdout = useStdout();
      void stdout;
      return () => <Text>with stdout</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with stdout");
  });

  test("useStderr does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const stderr = useStderr();
      void stderr;
      return () => <Text>with stderr</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with stderr");
  });

  test("respects custom columns width", () => {
    const App = defineComponent(() => () => (
      <Box width="100%">
        <Text>full width</Text>
      </Box>
    ));
    const narrow = renderToString(App, { columns: 20 });
    const wide = renderToString(App, { columns: 60 });
    // Both should contain the text
    expect(narrow).toContain("full width");
    expect(wide).toContain("full width");
  });

  test("renders padding correctly", () => {
    const App = defineComponent(() => () => (
      <Box paddingLeft={2}>
        <Text>padded</Text>
      </Box>
    ));
    const output = renderToString(App, { columns: 20 });
    expect(output).toContain("  padded");
  });

  test("rethrows non-Error values as wrapped Error", () => {
    const App = defineComponent(() => {
      throw "string error";
    });
    expect(() => renderToString(App)).toThrow("string error");
  });

  // ── Text variants ──────────────────────────────────────

  test("renders text with interpolated variable", () => {
    const App = defineComponent(() => () => <Text>Count: {42}</Text>);
    const output = renderToString(App);
    expect(output).toBe("Count: 42");
  });

  test("renders nested text components", () => {
    const World = defineComponent(() => () => <Text>World</Text>);
    const App = defineComponent(() => () => (
      <Text>
        Hello <World />
      </Text>
    ));
    const output = renderToString(App);
    expect(output).toBe("Hello World");
  });

  test("renders empty fragment", () => {
    const App = defineComponent(() => () => <></>);
    const output = renderToString(App);
    expect(output).toBe("");
  });

  test("renders null children", () => {
    const App = defineComponent(() => () => <Text>{null}</Text>);
    const output = renderToString(App);
    expect(output).toBe("");
  });

  // ── Layout ─────────────────────────────────────────────

  test("renders margin", () => {
    const App = defineComponent(() => () => (
      <Box marginLeft={2}>
        <Text>Margined</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("  Margined");
  });

  test("renders box with fixed width and height", () => {
    const App = defineComponent(() => () => (
      <Box width={10} height={3}>
        <Text>Hi</Text>
      </Box>
    ));
    const output = renderToString(App);
    const lines = output.split("\n");
    expect(lines.length).toBe(3);
  });

  test("renders box with border", () => {
    const App = defineComponent(() => () => (
      <Box borderStyle="single" width={20}>
        <Text>Bordered</Text>
      </Box>
    ));
    const output = renderToString(App, { columns: 20 });
    // Border characters should be present (single border uses box-drawing chars)
    expect(output).toContain("Bordered");
    expect(output).toContain("│");
    expect(output).toContain("─");
  });

  test("renders box with flex direction row", () => {
    const App = defineComponent(() => () => (
      <Box>
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("ABC");
  });

  test("renders gap between items", () => {
    const App = defineComponent(() => () => (
      <Box gap={1}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("A B");
  });

  test("renders spacer pushing content apart", () => {
    const App = defineComponent(() => () => (
      <Box width={20}>
        <Text>Left</Text>
        <Spacer />
        <Text>Right</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("Left           Right");
  });

  test("renders newline inserting blank line", () => {
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>Above</Text>
        <Newline />
        <Text>Below</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("Above\n\n\nBelow");
  });

  // ── Styling ────────────────────────────────────────────

  test("renders colored text", () => {
    const App = defineComponent(() => () => <Text color="green">Green</Text>);
    const output = renderToString(App);
    expect(output).toBe(chalk.green("Green"));
  });

  test("renders bold text", () => {
    const App = defineComponent(() => () => <Text bold>Bold</Text>);
    const output = renderToString(App);
    expect(output).toBe(chalk.bold("Bold"));
  });

  // ── Text wrapping and columns ─────────────────────────

  test("renders text with wrap", () => {
    const App = defineComponent(() => () => (
      <Box width={7}>
        <Text wrap="wrap">Hello World</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("Hello\nWorld");
  });

  test("renders text with truncate", () => {
    const App = defineComponent(() => () => (
      <Box width={7}>
        <Text wrap="truncate">Hello World</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("Hello …");
  });

  test("default columns wraps text at 80", () => {
    const longText = "A".repeat(100);
    const App = defineComponent(() => () => <Text>{longText}</Text>);
    const output = renderToString(App);
    const lines = output.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("A".repeat(80));
    expect(lines[1]).toBe("A".repeat(20));
  });

  test("custom columns option", () => {
    const longText = "A".repeat(50);
    const App = defineComponent(() => () => <Text>{longText}</Text>);
    const output = renderToString(App, { columns: 30 });
    const lines = output.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("A".repeat(30));
    expect(lines[1]).toBe("A".repeat(20));
  });

  // ── Components ─────────────────────────────────────────

  test("renders Transform component", () => {
    const App = defineComponent(() => () => (
      <Transform transform={(output: string) => output.toUpperCase()}>
        <Text>hello</Text>
      </Transform>
    ));
    const output = renderToString(App);
    expect(output).toBe("HELLO");
  });

  test("renders Static component with items", () => {
    const items = ["A", "B", "C"];
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Static items={items}>
          {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
        </Static>
        <Text>Dynamic</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("A\nB\nC\nDynamic");
  });

  test("render static-only output has no trailing newline", () => {
    const items = ["A", "B"];
    const App = defineComponent(() => () => (
      <Static items={items}>
        {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
      </Static>
    ));
    const output = renderToString(App);
    expect(output).toBe("A\nB");
  });

  test("render static + dynamic output has exactly one newline between parts", () => {
    const items = ["A", "B"];
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Static items={items}>
          {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
        </Static>
        <Text>Dynamic</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("A\nB\nDynamic");
  });

  // ── Effect behavior ────────────────────────────────────

  test("captures initial render before onMounted state updates", () => {
    const App = defineComponent(() => {
      const text = shallowRef("Initial");
      onMounted(() => {
        text.value = "Mounted";
      });
      return () => <Text>{text.value}</Text>;
    });
    const output = renderToString(App);
    expect(output).toBe("Initial");
  });

  test("watchSyncEffect state updates are reflected in output", () => {
    const App = defineComponent(() => {
      const text = shallowRef("Initial");
      // watchSyncEffect runs synchronously during setup, analogous to
      // React's useLayoutEffect — state updates are flushed before paint.
      watchSyncEffect(() => {
        text.value = "Sync Updated";
      });
      return () => <Text>{text.value}</Text>;
    });
    const output = renderToString(App);
    expect(output).toBe("Sync Updated");
  });

  test("runs onScopeDispose cleanup on teardown", () => {
    let cleanupRan = false;
    const App = defineComponent(() => {
      onScopeDispose(() => {
        cleanupRan = true;
      });
      return () => <Text>Cleanup test</Text>;
    });
    const output = renderToString(App);
    expect(output).toBe("Cleanup test");
    expect(cleanupRan).toBe(true);
  });

  // ── Error handling ─────────────────────────────────────

  test("text outside Text component throws", () => {
    const App = defineComponent(() => () => <Box>{"raw text"}</Box>);
    expect(() => renderToString(App)).toThrow(/must be rendered inside <Text>/);
  });

  test("subsequent calls work after a component error", () => {
    const Broken = defineComponent(() => {
      throw new Error("Boom");
    });
    expect(() => renderToString(Broken)).toThrow();
    const Ok = defineComponent(() => () => <Text>Still works</Text>);
    const output = renderToString(Ok);
    expect(output).toBe("Still works");
  });

  // ── Independence ───────────────────────────────────────

  test("can be called multiple times independently", () => {
    const First = defineComponent(() => () => <Text>First</Text>);
    const Second = defineComponent(() => () => <Text>Second</Text>);
    const output1 = renderToString(First);
    const output2 = renderToString(Second);
    expect(output1).toBe("First");
    expect(output2).toBe("Second");
  });

  // ── Deeply nested tree ────────────────────────────────

  test("renders deeply nested component tree", () => {
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Box paddingLeft={1}>
          <Box>
            <Text bold>
              {"Nested "}
              <Text color="green">deep</Text>
            </Text>
          </Box>
        </Box>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toContain("Nested");
    expect(output).toContain("deep");
  });
});
