import { defineComponent, nextTick, shallowRef, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text } from "@vue-tui/runtime";
import {
  useMouseDrag,
  useMouseEvent,
  type TuiMouseClickEvent,
  type TuiMouseDragEvent,
  type TuiMouseWheelEvent,
} from "@vue-tui/runtime/fullscreen";
import { render } from "../src/index.ts";

test("parsed down/up facts exercise production click synthesis", async () => {
  const clicks: TuiMouseClickEvent[] = [];
  const wheels: TuiMouseWheelEvent[] = [];
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "click", (event) => {
      clicks.push(event);
      return "consume";
    });
    useMouseEvent(target, "wheel", (event) => {
      wheels.push(event);
      return "consume";
    });
    return () => (
      <Box ref={target} width={8} height={2} flexShrink={0}>
        <Text>target</Text>
      </Box>
    );
  });
  const result = await render(App, {
    columns: 20,
    rows: 6,
    host: { mode: "fullscreen" },
  });

  try {
    expect(result.mouse.reporting.current).toBe("button");
    expect(result.mouse.reporting.history).toEqual(["button"]);

    await result.mouse.down({ x: 1, y: 0 }, { button: "right", alt: true });
    expect(clicks).toEqual([]);
    await result.mouse.up({ x: 1, y: 0 }, { button: "right", alt: true });

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({
      type: "click",
      delivery: "target",
      button: "right",
      surface: { x: 1, y: 0 },
      local: { x: 1, y: 0 },
      modifiers: { shift: false, alt: true, ctrl: false },
    });
    expect(Object.isFrozen(clicks[0])).toBe(true);

    await result.mouse.wheel({ x: 1, y: 0 }, "left", { ctrl: true });
    expect(wheels).toHaveLength(1);
    expect(wheels[0]).toMatchObject({
      type: "wheel",
      delivery: "target",
      surface: { x: 1, y: 0 },
      local: { x: 1, y: 0 },
      delta: { x: -1, y: 0 },
      modifiers: { shift: false, alt: false, ctrl: true },
    });

    await result.mouse.down({ x: 15, y: 4 });
    await result.mouse.up({ x: 15, y: 4 });
    expect(clicks).toHaveLength(1);
  } finally {
    result.dispose();
  }

  expect(result.mouse.reporting.current).toBe("none");
  expect(result.mouse.reporting.history).toEqual(["button", "none"]);
});

test("parsed motion facts exercise production drag capture and click suppression", async () => {
  const clicks: TuiMouseClickEvent[] = [];
  const dragEvents: TuiMouseDragEvent[] = [];
  let dragging = false;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "click", (event) => {
      clicks.push(event);
      return "consume";
    });
    const drag = useMouseDrag(target, (event) => dragEvents.push(event));
    dragging = drag.isDragging.value;
    return () => {
      dragging = drag.isDragging.value;
      return (
        <Box ref={target} width={6} height={2} flexShrink={0}>
          <Text>drag</Text>
        </Box>
      );
    };
  });
  const result = await render(App, {
    columns: 20,
    rows: 6,
    host: { mode: "fullscreen" },
  });

  try {
    expect(result.mouse.reporting.current).toBe("button-motion");
    await expect(result.mouse.move({ x: 2, y: 1 })).rejects.toThrow(
      "requires an unmatched left-button down",
    );

    await result.mouse.down({ x: 1, y: 0 });
    expect(dragEvents).toEqual([]);
    expect(dragging).toBe(false);

    await result.mouse.move({ x: 3, y: 1 }, { shift: true });
    expect(dragEvents).toHaveLength(1);
    expect(dragEvents[0]).toMatchObject({
      type: "drag",
      phase: "start",
      button: "left",
      surface: { x: 3, y: 1 },
      local: { x: 3, y: 1 },
      movement: { x: 2, y: 1 },
      modifiers: { shift: true, alt: false, ctrl: false },
    });
    expect(dragging).toBe(true);

    await result.mouse.move({ x: 15, y: 4 });
    expect(dragEvents.at(-1)).toMatchObject({
      phase: "move",
      surface: { x: 15, y: 4 },
      local: null,
      movement: { x: 12, y: 3 },
    });

    await result.mouse.up({ x: 15, y: 4 });
    expect(dragEvents.at(-1)).toMatchObject({
      phase: "end",
      surface: { x: 15, y: 4 },
      local: null,
      movement: { x: 0, y: 0 },
    });
    expect(dragging).toBe(false);
    expect(clicks).toEqual([]);
  } finally {
    result.dispose();
  }
});

test("reporting observation follows committed minimum mouse demand", async () => {
  const clickActive = shallowRef(true);
  const dragActive = shallowRef(true);
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "click", () => "continue", { isActive: clickActive });
    useMouseDrag(target, () => {}, { isActive: dragActive });
    return () => (
      <Box ref={target} width={5} height={1} flexShrink={0}>
        <Text>modes</Text>
      </Box>
    );
  });
  const result = await render(App, { host: { mode: "fullscreen" } });

  try {
    expect(result.mouse.reporting.current).toBe("button-motion");
    expect(result.mouse.reporting.history).toEqual(["button-motion"]);

    dragActive.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.mouse.reporting.current).toBe("button");
    expect(result.mouse.reporting.history).toEqual(["button-motion", "button"]);

    clickActive.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.mouse.reporting.current).toBe("none");
    expect(result.mouse.reporting.history).toEqual(["button-motion", "button", "none"]);
  } finally {
    result.dispose();
  }
});

test("the driver rejects physical facts the modeled terminal could not emit", async () => {
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseDrag(target, () => {});
    return () => (
      <Box ref={target} width={4} height={1} flexShrink={0}>
        <Text>guard</Text>
      </Box>
    );
  });
  const result = await render(App, {
    columns: 10,
    rows: 3,
    host: { mode: "fullscreen" },
  });

  try {
    await expect(result.mouse.down({ x: -1, y: 0 })).rejects.toThrow(
      "x must be a zero-based safe integer",
    );
    await expect(result.mouse.down({ x: 1.5, y: 0 })).rejects.toThrow(
      "x must be a zero-based safe integer",
    );
    await expect(result.mouse.down({ x: 10, y: 0 })).rejects.toThrow(
      "outside the 10x3 terminal surface",
    );
    await expect(result.mouse.down({ x: 0, y: 3 })).rejects.toThrow(
      "outside the 10x3 terminal surface",
    );
    await expect(result.mouse.down({ x: 0, y: 0 }, { button: "primary" } as never)).rejects.toThrow(
      "mouse button must be",
    );
    await expect(result.mouse.down({ x: 0, y: 0 }, { alt: 1 } as never)).rejects.toThrow(
      "mouse modifier alt must be a boolean",
    );
    await expect(result.mouse.wheel({ x: 0, y: 0 }, "forward" as never)).rejects.toThrow(
      "mouse wheel direction must be",
    );

    await result.mouse.down({ x: 0, y: 0 });
    await result.terminal.suspend();
    await expect(result.mouse.move({ x: 1, y: 0 })).rejects.toThrow(
      "modeled terminal is suspended",
    );
    await result.terminal.resume();
    await expect(result.mouse.move({ x: 1, y: 0 })).rejects.toThrow(
      "requires an unmatched left-button down",
    );

    result.unmount();
    await expect(result.mouse.down({ x: 0, y: 0 })).rejects.toThrow(
      "test application has been unmounted",
    );
  } finally {
    result.dispose();
  }
});

test("a passive Fullscreen surface exposes no mouse capability", async () => {
  const result = await render(() => <Text>passive</Text>, { host: { mode: "fullscreen" } });
  try {
    expect(result.mouse.reporting.current).toBe("none");
    expect(result.mouse.reporting.history).toEqual([]);
    await expect(result.mouse.down({ x: 0, y: 0 })).rejects.toThrow("without button reporting");
    await expect(result.mouse.wheel({ x: 0, y: 0 }, "down")).rejects.toThrow(
      "without button reporting",
    );
  } finally {
    result.dispose();
  }
});
