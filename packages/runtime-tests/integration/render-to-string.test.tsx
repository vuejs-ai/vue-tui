import {
  defineComponent,
  onMounted,
  onScopeDispose,
  shallowRef,
  watchSyncEffect,
  type ComponentPublicInstance,
} from "vue";
import chalk from "chalk";
import { describe, test, expect } from "vite-plus/test";
import {
  renderToString,
  Box,
  Text,
  Newline,
  Spacer,
  Transform,
  useInput,
  useApp,
  useFocus,
  useFocusManager,
  useFocusedInput,
  useFocusScope,
  useFocusScopeInput,
  useExternalInput,
  useStdin,
  useStdout,
  useStderr,
  useCaret,
  useLayoutSize,
  useRenderSession,
  useAnimation,
  useElementGeometry,
  type RenderSession,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import {
  renderToStringWithScreenReader,
  useInternalInputRoutingForTest,
} from "@vue-tui/runtime/internal";

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

  test("public renderToString rejects hidden screen-reader passthrough before rendering", () => {
    let setupRan = false;
    const App = defineComponent(() => () => <Text>x</Text>);
    const guarded = Object.defineProperty({ isScreenReaderEnabled: undefined }, "columns", {
      enumerable: true,
      get() {
        setupRan = true;
        throw new Error("columns getter must not run");
      },
    });

    expect(() => {
      // @ts-expect-error - screen-reader presentation is selected only by the internal helper
      renderToString(App, guarded);
    }).toThrow('renderToString option "isScreenReaderEnabled" is unavailable');
    expect(setupRan).toBe(false);
  });

  test("public renderToString rejects terminal-surface passthrough", () => {
    const App = defineComponent(() => () => <Text>x</Text>);
    expect(() => {
      // @ts-expect-error - a synchronous document has no requested terminal mode
      renderToString(App, { mode: "fullscreen" });
    }).toThrow('renderToString option "mode" is unavailable');
    expect(() => {
      // @ts-expect-error - a synchronous document has unbounded rows
      renderToString(App, { rows: 24 });
    }).toThrow('renderToString option "rows" is unavailable');
  });

  test("public and internal helpers select fixed visual and screen-reader documents", () => {
    const App = defineComponent(() => () => (
      <Box ariaLabel="accessible label">
        <Text>visual child</Text>
      </Box>
    ));

    expect(renderToString(App)).toContain("visual child");
    expect(renderToString(App)).not.toContain("accessible label");
    expect(renderToStringWithScreenReader(App)).toContain("accessible label");
    expect(renderToStringWithScreenReader(App)).not.toContain("visual child");
  });

  test.each([
    ["visual", renderToString],
    ["screen-reader", renderToStringWithScreenReader],
  ] as const)("provides one truthful %s string session", (presentation, renderDocument) => {
    let captured: RenderSession | undefined;
    const App = defineComponent(() => {
      captured = useRenderSession();
      return () => <Text>session</Text>;
    });

    expect(renderDocument(App, { columns: 37 })).toContain("session");
    expect(captured).toEqual({
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
      useInput(() => "continue");
      return () => <Text>with input</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with input");
  });

  test.each([
    ["success", false],
    ["component error", true],
  ] as const)("clears a selected string-host topology after %s", (_label, fail) => {
    let routing: ReturnType<typeof useInternalInputRoutingForTest> | undefined;
    const App = defineComponent(() => {
      routing = useInternalInputRoutingForTest();
      const boundary = routing.registerSemantic({
        id: "string-boundary",
        handle: () => ({
          performed: false,
          continue: true,
          preventDefault: false,
          blockExternal: false,
        }),
      });
      routing.select({ activeBoundary: boundary.lease });
      if (fail) throw new Error("string route failure");
      return () => <Text>string route</Text>;
    });

    if (fail) expect(() => renderToString(App)).toThrow("string route failure");
    else expect(renderToString(App)).toBe("string route");

    expect(routing).toBeDefined();
    expect(routing!.resolve(routing!.capture()).kind).toBe("unselected");
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

  test("useApp exit is explicitly unavailable in a string render", () => {
    const App = defineComponent(() => {
      useApp().exit();
      return () => <Text>unreachable</Text>;
    });

    expect(() => renderToString(App)).toThrow(
      "useApp().exit() is unavailable during renderToString()",
    );
  });

  test("useApp render flush is explicitly unavailable in a string render", async () => {
    let waitUntilRenderFlush: (() => Promise<void>) | undefined;
    const App = defineComponent(() => {
      waitUntilRenderFlush = useApp().waitUntilRenderFlush;
      return () => <Text>document</Text>;
    });

    expect(renderToString(App)).toBe("document");
    await expect(waitUntilRenderFlush?.()).rejects.toThrow(
      "useApp().waitUntilRenderFlush() is unavailable during renderToString()",
    );
  });

  test("focus targets, scopes, handlers, and manager stay inert in renderToString", () => {
    let target!: ReturnType<typeof useFocus>;
    let scope!: ReturnType<typeof useFocusScope>;
    let manager!: ReturnType<typeof useFocusManager>;
    const calls: string[] = [];
    const App = defineComponent(() => {
      const host = shallowRef<ComponentPublicInstance | null>(null);
      scope = useFocusScope({ trapped: true });
      target = useFocus(host, { scope, autoFocus: true });
      manager = useFocusManager();
      useFocusedInput(target, () => (calls.push("target"), "continue"));
      useFocusScopeInput(scope, () => (calls.push("scope"), "continue"));
      useExternalInput(target, () => calls.push("external"));
      return () => (
        <Box ref={host}>
          <Text>
            focused:{String(target.isFocused.value)} scope:{String(scope.containsFocus.value)}
          </Text>
        </Box>
      );
    });
    const output = renderToString(App);
    expect(output).toContain("focused:false scope:false");
    expect(manager.focusedTarget.value).toBeNull();
    expect(manager.focusNext()).toBe(false);
    expect(manager.focusPrevious()).toBe(false);
    expect(manager.blur()).toBe(false);
    expect(target.focus()).toBe(false);
    expect(target.blur()).toBe(false);
    expect(calls).toEqual([]);
  });

  test("useStdin does not throw in renderToString", () => {
    let captured: ReturnType<typeof useStdin> | undefined;
    const App = defineComponent(() => {
      captured = useStdin();
      return () => <Text>with stdin</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with stdin");
    expect(Reflect.ownKeys(captured!)).toEqual(["stdin"]);
    expect(captured?.stdin.isTTY).toBe(false);
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

  test("string terminal streams are isolated and direct writes remain inert", () => {
    let capturedStdin: NodeJS.ReadStream | undefined;
    let capturedStdout: NodeJS.WriteStream | undefined;
    let capturedStderr: NodeJS.WriteStream | undefined;
    const App = defineComponent(() => {
      capturedStdin = useStdin().stdin;
      capturedStdout = useStdout().stdout;
      capturedStderr = useStderr().stderr;
      capturedStdout.write("discard stdout");
      capturedStderr.write("discard stderr");
      return () => <Text>isolated</Text>;
    });

    expect(renderToString(App, { columns: 29 })).toBe("isolated");
    expect(capturedStdin).not.toBe(process.stdin);
    expect(capturedStdout).not.toBe(process.stdout);
    expect(capturedStderr).not.toBe(process.stderr);
    expect(capturedStdin?.isTTY).toBe(false);
    expect(capturedStdout?.isTTY).toBe(false);
    expect(capturedStdout?.columns).toBe(29);
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

  // Bug A: a component that throws literal `undefined` must still propagate as a
  // throw. The old `uncaughtError ??= err` + `uncaughtError !== undefined` sentinel
  // could not distinguish "no error" from "threw undefined" — it SWALLOWED the
  // error and returned the normal frame, violating the documented "errors
  // propagate to the caller" contract. We track occurrence with a boolean flag
  // instead, mirroring render.ts's `errored` pattern.
  test("rethrows when a component throws literal undefined (not swallowed)", () => {
    const App = defineComponent(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately throwing undefined to exercise the sentinel bug
      throw undefined;
    });
    expect(() => renderToString(App)).toThrow();
  });

  // Bug B: a non-Error throw with a meaningful `.message` (e.g. a plain object)
  // must surface that message, not `String(value)` → "[object Object]". We wrap
  // via messageForNonError (the same source of truth render.ts uses), which reads
  // a string `.message` when present.
  test("rethrows a non-Error object preserving its .message (not [object Object])", () => {
    const App = defineComponent(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately throwing a non-Error object to exercise message extraction
      throw { message: "meaningful detail" };
    });
    expect(() => renderToString(App)).toThrow("meaningful detail");
    // And explicitly assert it is NOT the lossy "[object Object]".
    try {
      renderToString(App);
      expect.unreachable("renderToString should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("meaningful detail");
      expect((err as Error).message).not.toBe("[object Object]");
    }
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
  // useCaret, semantic input, useAnimation, and useElementGeometry — so that
  // rendering a component which CALLS them degrades to inert values instead of
  // throwing (they must still return a string).
  describe("terminal composables degrade to no-ops (do not throw)", () => {
    test("useCaret reports unavailable in renderToString", () => {
      let caretStatus = "unset";
      const App = defineComponent(() => {
        const target = shallowRef<ComponentPublicInstance | null>(null);
        const focus = useFocus(target, { autoFocus: true });
        const { state } = useCaret(target, { focus, position: { x: 2, y: 0 } });
        caretStatus = state.value.status;
        return () => <Text ref={target}>with caret</Text>;
      });
      const output = renderToString(App);
      expect(output).toBe("with caret");
      expect(caretStatus).toBe("unavailable");
    });

    test("paste handling through useInput stays inert in renderToString", () => {
      let pasted = "";
      const App = defineComponent(() => {
        useInput((event) => {
          if (event.kind === "paste") pasted = event.text;
          return "continue";
        });
        return () => <Text>with paste</Text>;
      });
      const output = renderToString(App);
      expect(output).toBe("with paste");
      // The no-op stdin never emits a paste, so the handler stayed inert.
      expect(pasted).toBe("");
    });

    test("useLayoutSize reads the unbounded document layout from the shared session", () => {
      const App = defineComponent(() => {
        const { columns, rows } = useLayoutSize();
        return () => (
          <Text>
            {columns.value}x{rows.value ?? "unbounded"}
          </Text>
        );
      });
      expect(renderToString(App, { columns: 13 })).toBe("13xunbounded");
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

    test("useElementGeometry reports unavailable in renderToString", () => {
      const App = defineComponent(() => {
        const boxRef = shallowRef<ComponentPublicInstance | null>(null);
        const { geometry } = useElementGeometry(boxRef);
        return () => (
          <Box ref={boxRef}>
            <Text>{geometry.value.status}</Text>
          </Box>
        );
      });
      const output = renderToString(App, { columns: 40 });
      expect(output).toContain("unavailable");
    });

    test("caret, input, animation, and geometry render together without throwing", () => {
      let caretStatus = "unset";
      const App = defineComponent(() => {
        useInput(() => "continue");
        const { frame } = useAnimation({ interval: 30 });
        const boxRef = shallowRef<ComponentPublicInstance | null>(null);
        const focus = useFocus(boxRef, { autoFocus: true });
        const { state } = useCaret(boxRef, { focus, position: { x: 1, y: 0 } });
        caretStatus = state.value.status;
        useElementGeometry(boxRef);
        return () => (
          <Box ref={boxRef}>
            <Text>{`all:${frame.value}`}</Text>
          </Box>
        );
      });
      const output = renderToString(App, { columns: 40 });
      expect(output).toContain("all:0");
      expect(caretStatus).toBe("unavailable");
    });
  });
});
