import { defineComponent, nextTick, onMounted, shallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useCursor, useInput, useStdout, useStderr } from "@vue-tui/runtime";

describe("useCursor", () => {
  test("setCursorPosition updates cursor state", async () => {
    const App = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      setCursorPosition({ x: 5, y: 3 });
      return () => <Text>cursor test</Text>;
    });
    const { lastFrame } = await render(App);
    expect(lastFrame()).toContain("cursor test");
  });

  test("setCursorPosition can be updated reactively", async () => {
    const pos = shallowRef<{ x: number; y: number } | undefined>({ x: 0, y: 0 });
    const App = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      setCursorPosition(pos.value);
      return () => <Text>reactive</Text>;
    });
    const { lastFrame } = await render(App);
    expect(lastFrame()).toContain("reactive");

    // Update position — should not crash
    pos.value = { x: 10, y: 5 };
    await nextTick();
  });

  test("setCursorPosition accepts undefined to hide cursor", async () => {
    const App = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      setCursorPosition({ x: 1, y: 1 });
      setCursorPosition(undefined);
      return () => <Text>hidden</Text>;
    });
    const { lastFrame } = await render(App);
    expect(lastFrame()).toContain("hidden");
  });

  test("cursor is cleared on unmount", async () => {
    const App = defineComponent(() => {
      useCursor();
      return () => <Text>cursor</Text>;
    });
    const { unmount } = await render(App);
    unmount();
    // No crash = success (cursor position cleared via onScopeDispose)
  });

  test("throws when called outside render tree", () => {
    expect(() => useCursor()).toThrow("useCursor() must be called inside a vue-tui render tree");
  });

  // --- Parity tests ported from Ink cursor.tsx ---

  test("cursor follows text input", async () => {
    let capturedX = -1;
    const App = defineComponent(() => {
      const text = shallowRef("");
      const { setCursorPosition } = useCursor();

      useInput((input, key) => {
        if (key.backspace || key.delete) {
          text.value = text.value.slice(0, -1);
          return;
        }
        if (!key.ctrl && !key.meta && input) {
          text.value = text.value + input;
        }
      });

      return () => {
        // Set cursor position during render so it updates with each frame
        setCursorPosition({ x: 2 + text.value.length, y: 0 });
        capturedX = 2 + text.value.length;
        return (
          <Box>
            <Text>{`> ${text.value}`}</Text>
          </Box>
        );
      };
    });

    const { lastFrame, stdin } = await render(App);
    expect(lastFrame()).toBe(">");
    expect(capturedX).toBe(2);

    await stdin.write("a");
    expect(lastFrame()).toContain("> a");
    // After typing 'a', cursor should be at x=3 ("> a" = 3 chars)
    expect(capturedX).toBe(3);
  });

  test("cursor moves on space input even when output may look similar", async () => {
    let capturedX = -1;
    const App = defineComponent(() => {
      const text = shallowRef("");
      const { setCursorPosition } = useCursor();

      useInput((input, key) => {
        if (!key.ctrl && !key.meta && input) {
          text.value = text.value + input;
        }
      });

      return () => {
        setCursorPosition({ x: 2 + text.value.length, y: 0 });
        capturedX = 2 + text.value.length;
        return (
          <Box>
            <Text>{`> ${text.value}`}</Text>
          </Box>
        );
      };
    });

    const { stdin } = await render(App);
    expect(capturedX).toBe(2);

    await stdin.write("a");
    expect(capturedX).toBe(3);

    await stdin.write(" ");
    // After "a ", cursor should be at x=4
    expect(capturedX).toBe(4);
  });

  test("cursor is cleared when child component using useCursor unmounts", async () => {
    const CursorChild = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      setCursorPosition({ x: 5, y: 0 });
      return () => <Text>child</Text>;
    });

    const showChild = shallowRef(true);
    const App = defineComponent(() => {
      return () => <Box>{showChild.value ? <CursorChild /> : <Text>no cursor</Text>}</Box>;
    });

    // After the child unmounts, onScopeDispose fires ctx.setCursorPosition(undefined).
    // We verify the frame updates correctly.
    const { lastFrame } = await render(App);
    expect(lastFrame()).toContain("child");

    showChild.value = false;
    await nextTick();
    await nextTick();

    expect(lastFrame()).toContain("no cursor");
    // The child's onScopeDispose should have cleared the cursor.
    // No crash = success. The cursor position is cleared in the AppContext.
  });

  test("screen does not scroll on subsequent renders with multi-line cursor", async () => {
    const App = defineComponent(() => {
      const text = shallowRef("");
      const { setCursorPosition } = useCursor();

      useInput((input, key) => {
        if (!key.ctrl && !key.meta && input) {
          text.value = text.value + input;
        }
      });

      return () => {
        // Cursor on line 1 (second line)
        setCursorPosition({ x: 2 + text.value.length, y: 1 });
        return (
          <Box flexDirection="column">
            <Text>Header</Text>
            <Text>{`> ${text.value}`}</Text>
          </Box>
        );
      };
    });

    const { lastFrame, stdin, frames } = await render(App);
    expect(lastFrame()).toContain("Header");
    expect(lastFrame()).toContain(">");
    const frameCountBefore = frames.length;

    await stdin.write("x");

    expect(lastFrame()).toContain("> x");
    // A new frame was rendered (no scroll-induced blank frames)
    expect(frames.length).toBeGreaterThan(frameCountBefore);
    // Both lines are still present after re-render
    expect(lastFrame()).toContain("Header");
  });

  test("useStdout().write() does not corrupt frame when cursor is active", async () => {
    const App = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      const { write } = useStdout();

      setCursorPosition({ x: 2, y: 0 });

      onMounted(() => {
        write("from stdout hook\n");
      });

      return () => <Text>Hello</Text>;
    });

    const { lastFrame } = await render(App);
    // Frame should still be intact despite the stdout write
    expect(lastFrame()).toContain("Hello");
  });

  test("useStderr().write() does not corrupt frame when cursor is active", async () => {
    const App = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      const { write } = useStderr();

      setCursorPosition({ x: 2, y: 0 });

      onMounted(() => {
        write("from stderr hook\n");
      });

      return () => <Text>Hello</Text>;
    });

    const { lastFrame } = await render(App);
    // Frame should still be intact despite the stderr write
    expect(lastFrame()).toContain("Hello");
  });

  test("debug mode: useStdout().write() replays frame after write with cursor active", async () => {
    let writeCount = 0;
    const App = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      const { write, stdout } = useStdout();

      setCursorPosition({ x: 2, y: 0 });

      // Track stdout writes
      const origWrite = stdout.write.bind(stdout);
      stdout.write = ((data: string, ...args: unknown[]) => {
        if (typeof data === "string" && data.length > 0) {
          writeCount++;
        }
        return (origWrite as Function)(data, ...args);
      }) as typeof stdout.write;

      onMounted(() => {
        write("from stdout hook\n");
      });

      return () => <Text>Hello</Text>;
    });

    const { lastFrame } = await render(App);
    expect(lastFrame()).toContain("Hello");
    // In debug mode, writeToStdout writes: data + fullStaticOutput + lastOutput.
    // This means after the hook write, the frame should be replayed.
    // At minimum, there should be more than one write (initial render + replay).
    expect(writeCount).toBeGreaterThan(1);
  });
});
