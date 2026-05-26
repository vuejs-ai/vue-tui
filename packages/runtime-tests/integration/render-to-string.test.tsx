import { defineComponent } from "vue";
import { describe, test, expect } from "vite-plus/test";
import {
  renderToString,
  Box,
  Text,
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
});
