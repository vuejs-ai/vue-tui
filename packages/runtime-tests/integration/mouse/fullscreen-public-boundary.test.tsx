import { defineComponent, isReadonly, shallowRef, type ShallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, renderToString } from "@vue-tui/runtime";
import { useMouseDrag, useMouseEvent } from "@vue-tui/runtime/fullscreen";

test("Fullscreen mouse hooks validate runtime context before reading author inputs", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let targetReads = 0;
  let activeReads = 0;
  const target = () => {
    targetReads++;
    return null;
  };
  const isActive = () => {
    activeReads++;
    return false;
  };

  try {
    expect(() => useMouseEvent(target, "click", () => "continue", { isActive })).toThrow(
      "useMouseEvent() must be called inside a vue-tui render tree",
    );
    expect(() => useMouseDrag(target, () => {}, { isActive })).toThrow(
      "useMouseDrag() must be called inside a vue-tui render tree",
    );
    expect(targetReads).toBe(0);
    expect(activeReads).toBe(0);
  } finally {
    warn.mockRestore();
  }
});

test("an active Inline hook fails before reading its target", async () => {
  let targetReads = 0;
  const App = defineComponent(() => {
    useMouseEvent(
      () => {
        targetReads++;
        return null;
      },
      "click",
      () => "continue",
    );
    return () => <Text>unreachable</Text>;
  });

  await expect(render(App, { host: { mode: "inline" } })).rejects.toThrow(
    "useMouseEvent() requires an effective visual Fullscreen render surface",
  );
  expect(targetReads).toBe(0);
});

test("an inactive Inline hook remains inert without reading its target", async () => {
  let targetReads = 0;
  const App = defineComponent(() => {
    useMouseEvent(
      () => {
        targetReads++;
        return null;
      },
      "wheel",
      () => "continue",
      { isActive: false },
    );
    const drag = useMouseDrag(
      () => {
        targetReads++;
        return null;
      },
      () => {},
      { isActive: false },
    );
    expect(drag.isDragging.value).toBe(false);
    expect(isReadonly(drag.isDragging)).toBe(true);
    return () => <Text>inert</Text>;
  });

  const result = await render(App, { host: { mode: "inline" } });
  try {
    expect(targetReads).toBe(0);
    expect(result.terminal.rawMode.history).toEqual([]);
  } finally {
    result.dispose();
  }
});

test("activating an inert Inline hook later fails without reading its target", async () => {
  const active = shallowRef(false);
  let targetReads = 0;
  const App = defineComponent(() => {
    useMouseEvent(
      () => {
        targetReads++;
        return null;
      },
      "click",
      () => "continue",
      { isActive: active },
    );
    return () => <Text>inactive</Text>;
  });

  const result = await render(App, { host: { mode: "inline" } });
  try {
    active.value = true;
    await expect(result.waitUntilExit()).rejects.toThrow(
      "useMouseEvent() requires an effective visual Fullscreen render surface",
    );
    expect(targetReads).toBe(0);
  } finally {
    result.dispose();
  }
});

test("string rendering keeps Fullscreen mouse hooks inert and quiet", () => {
  let targetReads = 0;
  let dragState: Readonly<ShallowRef<boolean>> = shallowRef(true);
  const App = defineComponent(() => {
    const target = () => {
      targetReads++;
      return null;
    };
    useMouseEvent(target, "click", () => "continue");
    dragState = useMouseDrag(target, () => {}).isDragging;
    return () => <Text>document</Text>;
  });

  expect(renderToString(App)).toContain("document");
  expect(targetReads).toBe(0);
  expect(dragState.value).toBe(false);
  expect(isReadonly(dragState)).toBe(true);
});

test.each([
  ["screen-reader transcript", { mode: "fullscreen", presentation: "screen-reader" }],
  ["final stream", { mode: "fullscreen", updates: "at-teardown" }],
] as const)("%s keeps Fullscreen mouse hooks inert", async (_name, host) => {
  let targetReads = 0;
  const App = defineComponent(() => {
    const target = () => {
      targetReads++;
      return null;
    };
    useMouseEvent(target, "wheel", () => "continue");
    useMouseDrag(target, () => {});
    return () => <Text>fallback</Text>;
  });

  const result = await render(App, { host });
  try {
    expect(targetReads).toBe(0);
    expect(result.terminal.rawMode.history).toEqual([]);
  } finally {
    result.dispose();
  }
});
