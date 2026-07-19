import { defineComponent, h, nextTick, ref, shallowRef, type ComponentPublicInstance } from "vue";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import { useTextSelection, type TextSelectionCommands } from "@vue-tui/runtime/fullscreen";

describe("Fullscreen text selection public boundary", () => {
  test("rejects use outside a render tree", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(() => useTextSelection(() => null)).toThrow(
        "useTextSelection() must be called inside a vue-tui render tree",
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("keeps inactive Inline selection inert and rejects later activation", async () => {
    const active = shallowRef(false);
    let targetReads = 0;
    let selection!: TextSelectionCommands;
    const App = defineComponent(() => {
      selection = useTextSelection(
        () => {
          targetReads++;
          return null;
        },
        { isActive: active },
      );
      return () => h(Text, null, () => "inactive");
    });
    const result = await render(App, { host: { mode: "inline" } });
    try {
      expect(selection.state.value).toEqual({
        status: "inactive",
        range: null,
        selectedText: "",
      });
      expect(targetReads).toBe(0);
      active.value = true;
      await expect(result.waitUntilExit()).rejects.toThrow(
        "useTextSelection() requires an effective visual Fullscreen render surface",
      );
      expect(targetReads).toBe(0);
    } finally {
      result.dispose();
    }
  });

  test("keeps final and non-terminal output honest and becomes inactive at teardown", async () => {
    for (const host of [
      { mode: "fullscreen" as const, stdout: "stream" as const, updates: "live" as const },
      {
        mode: "fullscreen" as const,
        stdout: "stream" as const,
        updates: "at-teardown" as const,
      },
    ]) {
      let selection!: TextSelectionCommands;
      const target = shallowRef<ComponentPublicInstance | null>(null);
      const App = defineComponent(() => {
        selection = useTextSelection(target, { pointer: false });
        return () => h(Text, { ref: target }, () => "stream");
      });
      const result = await render(App, { host });
      expect(selection.state.value).toEqual({
        status: "unavailable",
        reason: "host-unavailable",
        range: null,
        selectedText: "",
      });
      result.unmount();
      expect(selection.state.value).toEqual({
        status: "inactive",
        range: null,
        selectedText: "",
      });
      result.dispose();
    }
  });

  test("clears a removed target and does not revive its previous range", async () => {
    const visible = ref(true);
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const App = defineComponent(() => {
      selection = useTextSelection(target, { pointer: false });
      return () => (visible.value ? h(Text, { ref: target }, () => "replaceable") : null);
    });
    const result = await render(App, { host: { mode: "fullscreen" } });
    try {
      selection.selectAll();
      await result.waitUntilRenderFlush();
      expect(selection.state.value).toMatchObject({ selectedText: "replaceable" });
      visible.value = false;
      await nextTick();
      await result.waitUntilRenderFlush();
      expect(selection.state.value).toEqual({ status: "pending", range: null, selectedText: "" });
      visible.value = true;
      await nextTick();
      await result.waitUntilRenderFlush();
      expect(selection.state.value).toMatchObject({ status: "ready", selectedText: "" });
    } finally {
      result.dispose();
    }
  });

  test("reports truncated source mapping as unavailable", async () => {
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const App = defineComponent(() => {
      selection = useTextSelection(target, { pointer: false });
      return () =>
        h(Box, { width: 4 }, () => h(Text, { ref: target, wrap: "truncate" }, () => "truncated"));
    });
    const result = await render(App, { host: { mode: "fullscreen" } });
    try {
      expect(selection.state.value).toEqual({
        status: "unavailable",
        reason: "mapping-unavailable",
        range: null,
        selectedText: "",
      });
    } finally {
      result.dispose();
    }
  });
});
