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
  useApp,
  useFocus,
  useFocusManager,
  useStdin,
  useStdout,
  useStderr,
  useCursor,
  usePaste,
  useWindowSize,
  useAnimation,
  useBoxMetrics,
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

  // Contract guard: `isScreenReaderEnabled` is INTERNAL-only — the public `renderToString` must
  // reject it at the type level (SR rendering goes through `renderToStringWithScreenReader` in
  // `@vue-tui/runtime/internal`). If the option is ever re-added to the public `RenderToStringOptions`,
  // the `@ts-expect-error` below goes unused and `tsc --noEmit` fails. (At runtime the unknown option
  // is harmlessly ignored — only `columns` is read — so the frame still renders.)
  test("public renderToString rejects the internal isScreenReaderEnabled option (type-level)", () => {
    const App = defineComponent(() => () => <Text>x</Text>);
    // @ts-expect-error - isScreenReaderEnabled is internal-only (use renderToStringWithScreenReader from /internal)
    const output = renderToString(App, { isScreenReaderEnabled: true });
    expect(output).toBe("x");
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
    // Lock the EXACT bytes (Ink render-to-string.tsx: t.is(output, 'Line 1\nLine 2')).
    expect(output).toBe("Line 1\nLine 2");
  });

  test("useInput does not throw in renderToString", () => {
    const App = defineComponent(() => {
      useInput(() => {});
      return () => <Text>with input</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with input");
  });

  test("useApp does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const { exit } = useApp();
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
        <Text>Padded</Text>
      </Box>
    ));
    const output = renderToString(App, { columns: 20 });
    // Lock the EXACT bytes (Ink render-to-string.tsx: t.is(output, '  Padded')).
    expect(output).toBe("  Padded");
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
    // Lock the EXACT boxen frame: a 20-wide single border (top corner + 18 ─ + corner,
    // content row "Bordered" + 10 fill spaces, bottom border). Byte-identical to Ink's
    // boxen('Bordered', { width: 20, borderStyle: 'single' }) (render-to-string.tsx).
    expect(output).toBe(
      "┌──────────────────┐\n" + "│Bordered          │\n" + "└──────────────────┘",
    );
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

  // Byte-exact gap variants (Ink gap.tsx). The live render() gap tests use
  // trimLines:true, which masks trailing-space regressions; the renderToString path
  // is byte-exact, so these lock the WRAP and COLUMN gaps without that mask.
  test("renders gap with flexWrap (wraps to a new row separated by a row gap)", () => {
    const App = defineComponent(() => () => (
      <Box gap={1} width={3} flexWrap="wrap">
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </Box>
    ));
    // Ink: t.is(output, 'A B\n\nC') — "A B" fills width 3, "C" wraps below, the
    // blank line is the row gap between the two wrapped rows.
    expect(renderToString(App)).toBe("A B\n\nC");
  });

  test("renders column gap (blank line between stacked items)", () => {
    const App = defineComponent(() => () => (
      <Box flexDirection="column" gap={1}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    ));
    // Ink: t.is(output, 'A\n\nB')
    expect(renderToString(App)).toBe("A\n\nB");
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

  // ── Nested <Text> inherits ancestor styles (Ink wrapping model) ─────────
  //
  // Ink composes nested <Text> by WRAPPING: squash-text-nodes.ts concatenates a
  // node's already-styled children, then the PARENT Text's internal_transform
  // wraps the WHOLE concatenation. So a parent's boolean styles (bold/italic/
  // underline/strikethrough/dim) stay OPEN across a nested child — the child only
  // ADDS its own style on top. The Ink composition is literally
  // `chalk.<style>("A" + chalk.<childStyle>("B"))`, which is what we assert here.
  // (The earlier merge-down + per-leaf model closed the parent SGR at the nested
  // boundary, so bold/underline did NOT survive across the child — that was the
  // bug this section pins.)

  test("nested <Text> inherits ancestor bold across a colored child", () => {
    const App = defineComponent(() => () => (
      <Text bold>
        A<Text color="green">B</Text>
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.bold("A" + chalk.green("B")));
  });

  test("nested <Text> inherits ancestor underline across a colored child", () => {
    const App = defineComponent(() => () => (
      <Text underline>
        A<Text color="green">B</Text>
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.underline("A" + chalk.green("B")));
  });

  test("ancestor bold stays open across a PLAIN nested child", () => {
    const App = defineComponent(() => () => (
      <Text bold>
        A<Text>B</Text>
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.bold("A" + "B"));
  });

  test("nested <Text> inherits ancestor dim across a colored child", () => {
    const App = defineComponent(() => () => (
      <Text dimColor>
        A<Text color="green">B</Text>
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.dim("A" + chalk.green("B")));
  });

  test("nested <Text> inherits ancestor italic across a colored child", () => {
    const App = defineComponent(() => () => (
      <Text italic>
        A<Text color="green">B</Text>
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.italic("A" + chalk.green("B")));
  });

  test("nested <Text> inherits ancestor strikethrough across a colored child", () => {
    const App = defineComponent(() => () => (
      <Text strikethrough>
        A<Text color="green">B</Text>
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.strikethrough("A" + chalk.green("B")));
  });

  test("ancestor bold survives leading/trailing parent text around a nested child", () => {
    const App = defineComponent(() => () => (
      <Text bold>
        A<Text color="green">B</Text>C
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.bold("A" + chalk.green("B") + "C"));
  });

  test("deep nesting wraps each level's style around its already-styled children", () => {
    const App = defineComponent(() => () => (
      <Text bold>
        A
        <Text underline>
          B<Text color="green">C</Text>
        </Text>
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.bold("A" + chalk.underline("B" + chalk.green("C"))));
  });

  test("nested child's own color composes on top of inherited bold (child stays bold too)", () => {
    // The child has BOTH its own color AND should still be bold (from the ancestor).
    // chalk.bold(chalk.green(...)) ⇒ the green run is emitted INSIDE the bold open/
    // close pair, so SGR-22 (bold off) comes only after the whole concatenation.
    const App = defineComponent(() => () => (
      <Text bold>
        <Text color="green">B</Text>
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.bold(chalk.green("B")));
  });

  // BONUS: a nested inline <Text backgroundColor=""> inside a green Box. The inner
  // "" is INVISIBLE here. The inner Text's effective bg is `"" ?? inheritedGreen`,
  // which is `""` (not the green) — so "b" is composed with NO bg of its own and
  // contributes RAW. But the OUTER plain Text inherits the green Box bg and wraps
  // the WHOLE "a"+"b"+"c" concatenation in one green span, so its inherited green
  // covers "b" uniformly along with "a" and "c". Because nothing applies a bg
  // INSIDE that outer span, there is no inner bg-reset: the bytes are a single
  // `chalk.bgGreen("abc")` (one bg-open, one trailing bg-reset, no inner \x1b[49m).
  // The inner "" would only become visible if the outer Text had no inherited bg.
  test("BONUS: nested inline backgroundColor='' inside a green Box", () => {
    const App = defineComponent(() => () => (
      <Box backgroundColor="green" alignSelf="flex-start">
        <Text>
          a<Text backgroundColor="">b</Text>c
        </Text>
      </Box>
    ));
    // The outer Text's inherited green wraps the whole concatenation; the inner ""
    // is invisible (no inner \x1b[49m before the final reset — see chalk bytes below).
    expect(renderToString(App, { columns: 100 })).toBe(chalk.bgGreen("a" + "b" + "c"));
  });

  // LOCK (high blast radius): a bare text-leaf inside a <Transform> under a
  // <Box backgroundColor> renders WITHOUT the Box bg on its glyphs. This is
  // Ink-faithful: in Ink only <Box> provides backgroundContext and <Transform>
  // does NOT consume it — the bare "#text" carries no internal_transform, so its
  // glyphs are RAW. The Box bg surfaces ONLY as the trailing fill padding the Box
  // paints to reach its width. Branch behavior: bare text-leaves return RAW text
  // (no inherited bg applied at the leaf), so the `[hi]` glyphs are uncolored and
  // only the 6-space fill is green. Byte-matched against Ink v7.0.4 (40b3a75):
  //   renderToString(<Box bg=green width=10><Transform>hi</Transform></Box>)
  //     === "[hi]\x1b[42m      \x1b[49m"  (i.e. "[hi]" + chalk.bgGreen("      "))
  // NOTE: this is a NEW lock (not a red→green fix) — it documents and pins the
  // already-correct branch behavior so a future change can't silently regress it.
  test("LOCK: bare text in <Transform> under a Box bg has no bg on its glyphs", () => {
    const App = defineComponent(() => () => (
      <Box backgroundColor="green" width={10}>
        <Transform transform={(s: string) => "[" + s + "]"}>hi</Transform>
      </Box>
    ));
    // "[hi]" glyphs are RAW (no bg SGR); only the trailing Box-fill padding is green.
    expect(renderToString(App, { columns: 100 })).toBe("[hi]" + chalk.bgGreen("      "));
  });

  // ── B29: renderToString serves the TERMINAL composables with inert no-op
  // contexts ──────────────────────────────────────────────────────────────
  //
  // renderToString runs with NO terminal session: it provides no-op AppContext +
  // StdinContext + a no-op AnimationScheduler (render-to-string.ts:93-96). The
  // existing suite covers useInput/useApp/useFocus/useFocusManager/useStdin/
  // useStdout/useStderr. These pin the remaining terminal composables —
  // useCursor, usePaste, useWindowSize, useAnimation, useBoxMetrics — so that
  // rendering a component which CALLS them degrades to inert values instead of
  // throwing (they must still return a string).
  describe("terminal composables degrade to no-ops (do not throw)", () => {
    test("useCursor does not throw in renderToString", () => {
      const App = defineComponent(() => {
        // setCursorPosition forwards to the no-op AppContext.setCursorPosition.
        const { setCursorPosition } = useCursor();
        setCursorPosition({ x: 2, y: 0 });
        return () => <Text>with cursor</Text>;
      });
      const output = renderToString(App);
      expect(output).toBe("with cursor");
    });

    test("usePaste does not throw in renderToString", () => {
      let pasted = "";
      const App = defineComponent(() => {
        // usePaste injects StdinContext (no-op here) and attaches to its
        // internal_eventEmitter — no terminal session, so the handler never fires.
        usePaste((text) => {
          pasted = text;
        });
        return () => <Text>with paste</Text>;
      });
      const output = renderToString(App);
      expect(output).toBe("with paste");
      // The no-op stdin never emits a paste, so the handler stayed inert.
      expect(pasted).toBe("");
    });

    test("useWindowSize does not throw in renderToString", () => {
      const App = defineComponent(() => {
        // Resolves dimensions from ctx.stdout (process.stdout in the no-op
        // context) with the terminal-size fallback; never throws.
        const { columns, rows } = useWindowSize();
        return () => <Text>size {columns.value > 0 && rows.value > 0 ? "ok" : "fallback"}</Text>;
      });
      const output = renderToString(App);
      expect(output).toContain("size");
    });

    test("useAnimation does not throw in renderToString (frame frozen at 0)", () => {
      const App = defineComponent(() => {
        // The no-op AnimationScheduler never ticks, so frame stays 0 and no timer
        // leaks (subscribe returns an inert unsubscribe).
        const { frame } = useAnimation({ interval: 50 });
        return () => <Text>{`frame:${frame.value}`}</Text>;
      });
      const output = renderToString(App);
      expect(output).toBe("frame:0");
    });

    test("useBoxMetrics does not throw in renderToString", () => {
      const App = defineComponent(() => {
        // useBoxMetrics tracks a Box ref via the root layout listener. In the
        // synchronous renderToString teardown the post-flush measurement may not
        // have run, so hasMeasured can still be false — the point is it must NOT
        // throw and the frame must still render.
        const boxRef = shallowRef(null);
        const { hasMeasured } = useBoxMetrics(boxRef);
        return () => (
          <Box ref={boxRef}>
            <Text>{hasMeasured.value ? "measured" : "metrics"}</Text>
          </Box>
        );
      });
      const output = renderToString(App, { columns: 40 });
      expect(output).toContain("metrics");
    });

    test("all five terminal composables together render to a string without throwing", () => {
      const App = defineComponent(() => {
        const { setCursorPosition } = useCursor();
        setCursorPosition({ x: 1, y: 0 });
        usePaste(() => {});
        useWindowSize();
        const { frame } = useAnimation({ interval: 30 });
        const boxRef = shallowRef(null);
        useBoxMetrics(boxRef);
        return () => (
          <Box ref={boxRef}>
            <Text>{`all:${frame.value}`}</Text>
          </Box>
        );
      });
      const output = renderToString(App, { columns: 40 });
      expect(output).toContain("all:0");
    });
  });
});
