import { defineComponent, nextTick, shallowRef, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, useFocus, type UseFocusReturn } from "@vue-tui/runtime";
import {
  useMouseDrag,
  useMouseEvent,
  type MouseEventHandler,
  type UseMouseDragReturn,
} from "@vue-tui/runtime/fullscreen";
import { render, type RenderResult } from "@vue-tui/testing";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";

type Target = ComponentPublicInstance | null;

function renderFullscreen(component: Parameters<typeof render>[0]) {
  return render(component, {
    columns: 20,
    rows: 8,
    host: { mode: "fullscreen" },
  });
}

function expectBalancedMouseTeardown(
  result: RenderResult,
  level: "button" | "button-motion",
): void {
  expect(result.mouse.reporting.current).toBe("none");
  expect(result.mouse.reporting.history).toEqual([level, "none"]);
  expect(result.terminal.rawMode.current).toBe(false);
}

function captureExit(result: RenderResult) {
  return result.waitUntilExit().then(
    (value) => ({ status: "resolved", value }) as const,
    (error: unknown) => ({ status: "rejected", error }) as const,
  );
}

test("a click handler composes with an opaque focus handle", async () => {
  let firstFocus!: UseFocusReturn;
  let secondFocus!: UseFocusReturn;
  const App = defineComponent(() => {
    const first = shallowRef<Target>(null);
    const second = shallowRef<Target>(null);
    firstFocus = useFocus(first, { autoFocus: true });
    secondFocus = useFocus(second);
    useMouseEvent(second, "click", () => (secondFocus.focus() ? "consume" : "continue"));

    return () => (
      <Box width={12} height={2} flexDirection="column">
        <Box ref={first} width={12} height={1} flexShrink={0}>
          <Text>first</Text>
        </Box>
        <Box ref={second} width={12} height={1} flexShrink={0}>
          <Text>second</Text>
        </Box>
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    expect(firstFocus.isFocused.value).toBe(true);
    expect(secondFocus.isFocused.value).toBe(false);

    await result.mouse.down({ x: 0, y: 1 });
    await result.mouse.up({ x: 0, y: 1 });

    expect(firstFocus.isFocused.value).toBe(false);
    expect(secondFocus.isFocused.value).toBe(true);
  } finally {
    result.dispose();
  }
});

test("a wheel handler drives a passive ScrollBox through its imperative handle", async () => {
  const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
  const App = defineComponent(() => {
    const viewport = shallowRef<Target>(null);
    useMouseEvent(viewport, "wheel", (event) => {
      scrollBox.value?.scrollByLines(event.delta.y);
      return "consume";
    });

    return () => (
      <Box ref={viewport} width={20} height={4} flexShrink={0}>
        <ScrollBox ref={scrollBox}>
          {Array.from({ length: 12 }, (_, index) => (
            <Text key={index}>message {index}</Text>
          ))}
        </ScrollBox>
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    expect(result.lastFrame()).toContain("message 11");

    await result.mouse.wheel({ x: 0, y: 0 }, "up");

    expect(result.lastFrame()).not.toContain("message 11");
    expect(result.lastFrame()).toContain("message 7");
  } finally {
    result.dispose();
  }
});

const eventFailures = [
  {
    label: "throws",
    expected: "mouse handler boom",
    handler: () => {
      throw new Error("mouse handler boom");
    },
  },
  {
    label: "returns an invalid value",
    expected:
      'A mouse event handler must return "continue" or "consume" synchronously; received undefined.',
    handler: () => undefined,
  },
  {
    label: "returns a Promise",
    expected:
      'A mouse event handler must return "continue" or "consume" synchronously; received a Promise.',
    handler: () => Promise.resolve("consume"),
  },
] as const;

test.each(eventFailures)(
  "a mouse handler that $label fails its app and balances terminal ownership",
  async ({ expected, handler }) => {
    let laterHandlerCalls = 0;
    const App = defineComponent(() => {
      const target = shallowRef<Target>(null);
      useMouseEvent(target, "wheel", handler as unknown as MouseEventHandler<"wheel">);
      useMouseEvent(target, "wheel", () => {
        laterHandlerCalls++;
        return "continue";
      });
      return () => <Box ref={target} width={4} height={1} flexShrink={0} />;
    });
    const result = await renderFullscreen(App);
    const exited = captureExit(result);

    try {
      expect(result.mouse.reporting.history).toEqual(["button"]);
      expect(result.terminal.rawMode.current).toBe(true);

      await result.mouse.wheel({ x: 0, y: 0 }, "down");

      const outcome = await exited;
      expect(outcome).toMatchObject({ status: "rejected" });
      if (outcome.status === "rejected") {
        expect(outcome.error).toMatchObject({ message: expected });
      }
      expect(laterHandlerCalls).toBe(0);
      expectBalancedMouseTeardown(result, "button");
    } finally {
      result.dispose();
      await exited;
    }
  },
);

test("a throwing drag handler abandons capture and balances terminal ownership", async () => {
  let laterHandlerCalls = 0;
  let drag!: UseMouseDragReturn;
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    drag = useMouseDrag(target, () => {
      throw new Error("drag handler boom");
    });
    useMouseDrag(target, () => {
      laterHandlerCalls++;
    });
    return () => <Box ref={target} width={4} height={1} flexShrink={0} />;
  });
  const result = await renderFullscreen(App);
  const exited = captureExit(result);

  try {
    expect(result.mouse.reporting.history).toEqual(["button-motion"]);
    expect(result.terminal.rawMode.current).toBe(true);

    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });

    const outcome = await exited;
    expect(outcome).toMatchObject({
      status: "rejected",
      error: { message: "drag handler boom" },
    });
    expect(drag.isDragging.value).toBe(false);
    expect(laterHandlerCalls).toBe(0);
    expectBalancedMouseTeardown(result, "button-motion");
  } finally {
    result.dispose();
    await exited;
  }
});

// Keep this last: Vue leaves later post-flush callbacks queued when one throws.
// The production error is still caught exactly once here, but no unrelated
// assertion should be made to flush that deliberately failed queue afterward.
test("a non-TTY Fullscreen app fails when a visible target first demands mouse reporting", async () => {
  const visible = shallowRef(false);
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    useMouseEvent(target, "click", () => "consume");
    return () => (
      <Box
        ref={target}
        display={visible.value ? "flex" : "none"}
        width={4}
        height={1}
        flexShrink={0}
      />
    );
  });
  const result = await render(App, {
    columns: 20,
    rows: 8,
    host: { mode: "fullscreen", stdin: "non-tty" },
  });

  try {
    expect(result.mouse.reporting.history).toEqual([]);
    expect(result.terminal.rawMode.current).toBe(false);

    visible.value = true;
    const updateErrors: unknown[] = [];
    await nextTick().catch((error: unknown) => updateErrors.push(error));

    expect(updateErrors).toHaveLength(1);
    expect(updateErrors[0]).toMatchObject({
      message: expect.stringContaining(
        "Managed input is unavailable because the mounted stdin is not a controllable TTY",
      ),
    });
    expect(result.mouse.reporting.history).toEqual([]);
    expect(result.terminal.rawMode.current).toBe(false);
  } finally {
    result.dispose();
  }
});
