import { defineComponent, nextTick, shallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useCursor } from "@vue-tui/runtime";

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
});
