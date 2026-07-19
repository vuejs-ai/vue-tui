import { defineComponent, onMounted, onScopeDispose, shallowRef, watchSyncEffect } from "vue";
import chalk from "chalk";
import { describe, test, expect } from "vite-plus/test";
import {
  renderToString,
  Box,
  Text,
  useInput,
  useApp,
  useStdin,
  useBoxSize,
  useLayoutWidth,
  useViewportHeight,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { useStderr } from "../../runtime/dist/internal.mjs";
import { useStdout } from "../../runtime/dist/internal.mjs";
import { renderToStringWithScreenReader } from "../../runtime/dist/internal.mjs";
import { useInternalInputRoutingForTest } from "../../runtime/dist/internal.mjs";

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
  ] as const)("provides truthful %s string layout facts", (_presentation, renderDocument) => {
    let width: ReturnType<typeof useLayoutWidth> | undefined;
    let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
    const App = defineComponent(() => {
      width = useLayoutWidth();
      viewportHeight = useViewportHeight();
      return () => <Text>{`${width!.value}x${viewportHeight?.value ?? "unbounded"}`}</Text>;
    });

    expect(renderDocument(App, { columns: 37 })).toBe("37xunbounded");
    expect(width!.value).toBe(37);
    expect(viewportHeight).toBeNull();
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
      useInput(() => undefined);
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

  test("renders left padding", () => {
    const App = defineComponent(() => () => (
      <Box paddingLeft={2}>
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

  test("renders an empty growing Box pushing content apart", () => {
    const App = defineComponent(() => () => (
      <Box width={20}>
        <Text>Left</Text>
        <Box flexGrow={1} flexShrink={1} />
        <Text>Right</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("Left           Right");
  });

  test("renders explicit newline text as a standalone layout item", () => {
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>Above</Text>
        <Text>{"\n"}</Text>
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

  test("renders keyed Static instances", () => {
    const items = ["A", "B", "C"];
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        {items.map((item) => (
          <Static key={item}>
            <Text>{item}</Text>
          </Static>
        ))}
        <Text>Dynamic</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("A\nB\nC\nDynamic");
  });

  test("render static-only output has no trailing newline", () => {
    const items = ["A", "B"];
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        {items.map((item) => (
          <Static key={item}>
            <Text>{item}</Text>
          </Static>
        ))}
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("A\nB");
  });

  test("render static + dynamic output has exactly one newline between parts", () => {
    const items = ["A", "B"];
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        {items.map((item) => (
          <Static key={item}>
            <Text>{item}</Text>
          </Static>
        ))}
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
  // wraps the WHOLE concatenation. So a parent's retained styles (bold and dim)
  // stay OPEN across a nested child — the child only
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

  test("ancestor bold survives leading/trailing parent text around a nested child", () => {
    const App = defineComponent(() => () => (
      <Text bold>
        A<Text color="green">B</Text>C
      </Text>
    ));
    expect(renderToString(App)).toBe(chalk.bold("A" + chalk.green("B") + "C"));
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

  // ── B29: renderToString serves the TERMINAL composables with inert no-op
  // contexts ──────────────────────────────────────────────────────────────
  //
  // renderToString runs with NO terminal session: it provides no-op AppContext +
  // StdinContext. The
  // existing suite covers useInput/useApp/useStdin/useStdout/useStderr. These
  // pin the remaining common terminal composables — semantic input and
  // useBoxSize — so that
  // rendering a component which CALLS them degrades to inert values instead of
  // throwing (they must still return a string).
  describe("terminal composables degrade to no-ops (do not throw)", () => {
    test("paste handling through useInput stays inert in renderToString", () => {
      let pasted = "";
      const App = defineComponent(() => {
        useInput((event) => {
          if (event.kind === "paste") pasted = event.text;
        });
        return () => <Text>with paste</Text>;
      });
      const output = renderToString(App);
      expect(output).toBe("with paste");
      // The no-op stdin never emits a paste, so the handler stayed inert.
      expect(pasted).toBe("");
    });

    test("useBoxSize reports null in renderToString", () => {
      const App = defineComponent(() => {
        const boxRef = shallowRef<InstanceType<typeof Box> | null>(null);
        const size = useBoxSize(boxRef);
        return () => (
          <Box ref={boxRef}>
            <Text>{size.value === null ? "unavailable" : "measured"}</Text>
          </Box>
        );
      });
      const output = renderToString(App, { columns: 40 });
      expect(output).toContain("unavailable");
    });

    test("input and box size render together without throwing", () => {
      const App = defineComponent(() => {
        useInput(() => undefined);
        const boxRef = shallowRef<InstanceType<typeof Box> | null>(null);
        useBoxSize(boxRef);
        return () => (
          <Box ref={boxRef}>
            <Text>all</Text>
          </Box>
        );
      });
      const output = renderToString(App, { columns: 40 });
      expect(output).toContain("all");
    });
  });
});
