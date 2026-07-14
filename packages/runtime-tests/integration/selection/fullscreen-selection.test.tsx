import { defineComponent, h, shallowRef, type ComponentPublicInstance } from "vue";
import { describe, expect, test } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import { render } from "@vue-tui/testing";
import { Box, Text, renderToString } from "@vue-tui/runtime";
import { useTextSelection, type TextSelectionCommands } from "@vue-tui/runtime/fullscreen";

describe("Fullscreen selection public journey", () => {
  test("derives visibility from the final paint without manufacturing trailing cells", async () => {
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const App = defineComponent(() => {
      selection = useTextSelection(target, { pointer: false });
      return () =>
        h(Text, { ref: target }, () => [
          "plain ",
          "\n",
          h(Text, { inverse: true }, () => "inverse "),
        ]);
    });
    const result = await render(App, {
      columns: 12,
      rows: 3,
      host: { mode: "fullscreen" },
    });
    try {
      const beforeRaw = result.lastFrame({ raw: true });
      const before = stripAnsi(beforeRaw).replace(/\n+$/, "");
      expect(before).toBe("plain\ninverse ");
      selection.selectAll();
      await result.waitUntilRenderFlush();
      const afterRaw = result.lastFrame({ raw: true });
      expect(stripAnsi(afterRaw).replace(/\n+$/, "")).toBe(before);
      expect(selection.state.value).toMatchObject({ selectedText: "plain \ninverse " });
    } finally {
      result.dispose();
    }
  });

  test("highlights only source graphemes that survive a later overlay", async () => {
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const App = defineComponent(() => {
      selection = useTextSelection(target, { pointer: false });
      return () =>
        h(Box, { width: 6, height: 1 }, () => [
          h(Text, { ref: target }, () => "a你bc"),
          h(Box, { position: "absolute", left: 1, top: 0 }, () => h(Text, null, () => "XX")),
        ]);
    });
    const result = await render(App, {
      columns: 6,
      rows: 2,
      host: { mode: "fullscreen" },
    });
    try {
      selection.selectAll();
      await result.waitUntilRenderFlush();
      const raw = result.lastFrame({ raw: true });
      expect(stripAnsi(raw).replace(/\n+$/, "")).toBe("aXXbc");
      expect(raw).toContain("\x1b[7ma\x1b[27mXX\x1b[7mbc");
      expect(selection.state.value).toMatchObject({ selectedText: "a你bc" });
    } finally {
      result.dispose();
    }
  });

  test("supports combined and wide graphemes but rejects ambiguous standalone zero-width mapping", async () => {
    let supported!: TextSelectionCommands;
    const supportedTarget = shallowRef<ComponentPublicInstance | null>(null);
    const Supported = defineComponent(() => {
      supported = useTextSelection(supportedTarget, { pointer: false });
      return () => h(Text, { ref: supportedTarget }, () => "e\u0301你🙂");
    });
    const supportedResult = await render(Supported, {
      columns: 8,
      rows: 2,
      host: { mode: "fullscreen" },
    });
    try {
      expect(supported.selectAll()).toBe(true);
      await supportedResult.waitUntilRenderFlush();
      expect(supported.state.value).toMatchObject({
        status: "ready",
        selectedText: "e\u0301你🙂",
      });
      expect(stripAnsi(supportedResult.lastFrame({ raw: true }))).toContain("e\u0301你🙂");
    } finally {
      supportedResult.dispose();
    }

    let styled!: TextSelectionCommands;
    const styledTarget = shallowRef<ComponentPublicInstance | null>(null);
    const Styled = defineComponent(() => {
      styled = useTextSelection(styledTarget, { pointer: false });
      return () =>
        h(Text, { ref: styledTarget }, () => ["e", h(Text, { color: "red" }, () => "\u0301"), "X"]);
    });
    const styledResult = await render(Styled, {
      columns: 4,
      rows: 2,
      host: { mode: "fullscreen", clipboard: "copied" },
    });
    try {
      expect(stripAnsi(styledResult.lastFrame({ raw: true })).replace(/\n+$/, "")).toBe("e\u0301X");
      expect(styled.selectAll()).toBe(true);
      await styledResult.waitUntilRenderFlush();
      expect(styled.state.value).toMatchObject({ status: "ready", selectedText: "e\u0301X" });
      const raw = styledResult.lastFrame({ raw: true });
      expect(stripAnsi(raw).replace(/\n+$/, "")).toBe("e\u0301X");
      expect(raw).toContain("\x1b[7me\u0301X\x1b[27m");
      await expect(styled.copy()).resolves.toEqual({ status: "copied", text: "e\u0301X" });
      expect(styledResult.clipboard.requests).toEqual(["e\u0301X"]);
    } finally {
      styledResult.dispose();
    }

    let unavailable!: TextSelectionCommands;
    const unavailableTarget = shallowRef<ComponentPublicInstance | null>(null);
    const Unavailable = defineComponent(() => {
      unavailable = useTextSelection(unavailableTarget, { pointer: false });
      return () => h(Text, { ref: unavailableTarget }, () => "\u200bA");
    });
    const unavailableResult = await render(Unavailable, {
      columns: 4,
      rows: 2,
      host: { mode: "fullscreen" },
    });
    try {
      expect(unavailable.state.value).toEqual({
        status: "unavailable",
        reason: "mapping-unavailable",
        range: null,
        selectedText: "",
      });
      expect(unavailable.selectAll()).toBe(false);
    } finally {
      unavailableResult.dispose();
    }
  });

  test("selects and copies a long clipped semantic document without soft-wrap newlines", async () => {
    const lines = Array.from(
      { length: 500 },
      (_, index) => `job-${index.toString().padStart(3, "0")}`,
    );
    const document = lines.join("\n");
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const App = defineComponent(() => {
      selection = useTextSelection(target, { pointer: false });
      return () =>
        h(Box, { height: 8, overflow: "hidden" }, () => h(Text, { ref: target }, () => document));
    });

    const result = await render(App, {
      columns: 8,
      rows: 8,
      host: { mode: "fullscreen", clipboard: "copied" },
    });
    try {
      expect(selection.state.value.status).toBe("ready");
      expect(selection.selectAll()).toBe(true);
      await result.waitUntilRenderFlush();
      expect(selection.state.value).toMatchObject({
        status: "ready",
        selectedText: document,
      });
      await expect(selection.copy()).resolves.toEqual({ status: "copied", text: document });
      expect(result.clipboard.requests).toEqual([document]);
      expect(result.lastFrame({ raw: true })).toContain("\x1b[7m");
    } finally {
      result.dispose();
    }
  });

  test("pointer drag selects complete wrapped graphemes while collection state remains separate", async () => {
    let activeItem = 4;
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const App = defineComponent(() => {
      selection = useTextSelection(target);
      return () => h(Text, { ref: target }, () => "ab你cdef");
    });
    const result = await render(App, { columns: 4, rows: 4, host: { mode: "fullscreen" } });
    try {
      await result.mouse.down({ x: 1, y: 0 });
      await result.mouse.move({ x: 1, y: 1 });
      await result.mouse.up({ x: 1, y: 1 });
      expect(selection.state.value).toMatchObject({ status: "ready", selectedText: "b你cd" });
      expect(activeItem).toBe(4);
      activeItem = 5;
      expect(selection.state.value).toMatchObject({ selectedText: "b你cd" });
    } finally {
      result.dispose();
    }
  });

  test("preserves the accepted range through suspension and reports clipboard unavailability", async () => {
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const App = defineComponent(() => {
      selection = useTextSelection(target, { pointer: false });
      return () => h(Text, { ref: target }, () => "stable text");
    });
    const result = await render(App, {
      host: { mode: "fullscreen", clipboard: "copied" },
    });
    try {
      selection.selectAll();
      await result.waitUntilRenderFlush();
      await result.terminal.suspend();
      expect(selection.state.value).toMatchObject({
        status: "suspended",
        selectedText: "stable text",
      });
      await expect(selection.copy()).resolves.toEqual({
        status: "unavailable",
        text: "stable text",
        reason: "suspended",
      });
      await result.terminal.resume();
      expect(selection.state.value).toMatchObject({ status: "ready", selectedText: "stable text" });
    } finally {
      result.dispose();
    }
  });

  test("keeps unsupported presentations honest", async () => {
    let screenReaderSelection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const ScreenReader = defineComponent(() => {
      screenReaderSelection = useTextSelection(target, { pointer: false });
      return () => h(Text, { ref: target }, () => "linear");
    });
    const screenReader = await render(ScreenReader, {
      host: { mode: "fullscreen", presentation: "screen-reader" },
    });
    try {
      expect(screenReaderSelection.state.value).toEqual({
        status: "unavailable",
        reason: "screen-reader",
        range: null,
        selectedText: "",
      });
      expect(screenReader.terminal.rawMode.history).toEqual([]);
    } finally {
      screenReader.dispose();
    }

    let stringSelection!: TextSelectionCommands;
    let stringRenderState!: TextSelectionCommands["state"]["value"];
    const StringDocument = defineComponent(() => {
      stringSelection = useTextSelection(() => null, { pointer: false });
      stringRenderState = stringSelection.state.value;
      return () => h(Text, null, () => "document");
    });
    expect(renderToString(StringDocument)).toContain("document");
    expect(stringRenderState).toEqual({
      status: "unavailable",
      reason: "string-host",
      range: null,
      selectedText: "",
    });
    expect(stringSelection.state.value).toEqual({
      status: "inactive",
      range: null,
      selectedText: "",
    });
  });

  test("rejects active visual Inline use instead of manufacturing hit testing", async () => {
    const App = defineComponent(() => {
      useTextSelection(() => null, { pointer: false });
      return () => h(Text, null, () => "unreachable");
    });
    await expect(render(App, { host: { mode: "inline" } })).rejects.toThrow(
      "useTextSelection() requires an effective visual Fullscreen render surface",
    );
  });
});
