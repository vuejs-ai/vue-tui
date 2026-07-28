import { defineComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, renderToString, Text, useLayoutSize } from "@vue-tui/runtime";

describe("renderToString basics", () => {
  test("renders component to string", () => {
    const App = defineComponent(() => () => (
      <Box>
        <Text>Hello</Text>
      </Box>
    ));
    const output = renderToString(App, { width: 40 });
    expect(output).toContain("Hello");
  });

  test("defaults to 80 columns", () => {
    const App = defineComponent(() => {
      return () => <Text>test</Text>;
    });
    const output = renderToString(App);
    expect(output).toBe("test");
  });

  test("ignores terminal-host properties supplied by untyped callers", () => {
    let setupRan = 0;
    const App = defineComponent(() => () => <Text>x</Text>);
    const sharedOptions = {
      width: 20,
      height: 24,
      mode: "fullscreen",
      rows: 24,
      columns: 99,
      isScreenReaderEnabled: true,
    };
    const CountedApp = defineComponent(() => {
      setupRan++;
      return () => <App />;
    });

    expect(renderToString(CountedApp, sharedOptions as never)).toBe("x");
    expect(setupRan).toBe(1);
  });

  test("provides truthful string layout facts", () => {
    let layout: ReturnType<typeof useLayoutSize> | undefined;
    const App = defineComponent(() => {
      layout = useLayoutSize();
      return () => (
        <Text>{`${layout!.width.value}x${layout!.height.value === Infinity ? "unbounded" : layout!.height.value}`}</Text>
      );
    });

    expect(renderToString(App, { width: 37, height: Infinity })).toBe("37xunbounded");
    expect(layout!.width.value).toBe(37);
    expect(layout!.height.value).toBe(Infinity);

    expect(renderToString(App)).toBe("80x24");
    expect(layout!.width.value).toBe(80);
    expect(layout!.height.value).toBe(24);
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
    const output = renderToString(App, { width: 20 });
    // Lock the EXACT bytes (Ink render-to-string.tsx: t.is(output, 'Line 1\nLine 2')).
    expect(output).toBe("Line 1\nLine 2");
  });
});
