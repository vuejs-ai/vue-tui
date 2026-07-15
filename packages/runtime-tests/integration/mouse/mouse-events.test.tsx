import {
  defineComponent,
  effectScope,
  nextTick,
  shallowRef,
  type ComponentPublicInstance,
  type Ref,
} from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import {
  useMouseDrag,
  useMouseEvent,
  type TuiMouseClickEvent,
  type TuiMouseDragEvent,
  type TuiMouseWheelEvent,
} from "@vue-tui/runtime/fullscreen";
import { render, type RenderResult } from "@vue-tui/testing";

type Target = ComponentPublicInstance | null;

function renderFullscreen(component: Parameters<typeof render>[0]) {
  return render(component, {
    columns: 20,
    rows: 8,
    host: { mode: "fullscreen" },
  });
}

async function flushUpdate(result: RenderResult): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}

test("click targets the deepest matching registration and rebases bubbling coordinates", async () => {
  const events: TuiMouseClickEvent[] = [];
  const App = defineComponent(() => {
    const parent = shallowRef<Target>(null);
    const child = shallowRef<Target>(null);

    useMouseEvent(child, "click", (event) => {
      events.push(event);
      return "continue";
    });
    useMouseEvent(parent, "click", (event) => {
      events.push(event);
      return "consume";
    });

    return () => (
      <Box width={10} height={2}>
        <Box ref={parent} marginLeft={2} width={5} height={1}>
          <Box ref={child} marginLeft={1} width={2} height={1} />
        </Box>
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    expect(result.mouse.reporting.current).toBe("button");
    await result.mouse.down({ x: 3, y: 0 });
    await result.mouse.up({ x: 3, y: 0 });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "click",
      delivery: "target",
      surface: { x: 3, y: 0 },
      local: { x: 0, y: 0 },
    });
    expect(events[1]).toMatchObject({
      type: "click",
      delivery: "bubble",
      surface: { x: 3, y: 0 },
      local: { x: 1, y: 0 },
    });
    expect(events[0]).not.toBe(events[1]);
    expect(Object.isFrozen(events[0])).toBe(true);
    expect(Object.isFrozen(events[1])).toBe(true);
  } finally {
    result.dispose();
  }
});

test("consume runs the remaining handlers on one receiver but stops before its ancestor", async () => {
  const calls: string[] = [];
  const App = defineComponent(() => {
    const parent = shallowRef<Target>(null);
    const child = shallowRef<Target>(null);

    useMouseEvent(child, "click", () => {
      calls.push("child-first");
      return "consume";
    });
    useMouseEvent(child, "click", () => {
      calls.push("child-second");
      return "continue";
    });
    useMouseEvent(parent, "click", () => {
      calls.push("parent");
      return "consume";
    });

    return () => (
      <Box ref={parent} width={5} height={1}>
        <Box ref={child} width={2} height={1} />
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.up({ x: 0, y: 0 });
    expect(calls).toEqual(["child-first", "child-second"]);
  } finally {
    result.dispose();
  }
});

test("click uses release coordinates on the same host and cancels across hosts", async () => {
  const leftClicks: TuiMouseClickEvent[] = [];
  const rightClicks: TuiMouseClickEvent[] = [];
  const App = defineComponent(() => {
    const left = shallowRef<Target>(null);
    const right = shallowRef<Target>(null);

    useMouseEvent(left, "click", (event) => {
      leftClicks.push(event);
      return "consume";
    });
    useMouseEvent(right, "click", (event) => {
      rightClicks.push(event);
      return "consume";
    });

    return () => (
      <Box width={4} height={1}>
        <Box ref={left} width={2} height={1} />
        <Box ref={right} width={2} height={1} />
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 0, y: 0 }, { button: "right", alt: true });
    await result.mouse.up({ x: 1, y: 0 }, { button: "right", ctrl: true });
    expect(leftClicks).toHaveLength(1);
    expect(leftClicks[0]).toMatchObject({
      button: "right",
      surface: { x: 1, y: 0 },
      local: { x: 1, y: 0 },
      modifiers: { shift: false, alt: false, ctrl: true },
    });

    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.up({ x: 3, y: 0 });
    expect(leftClicks).toHaveLength(1);
    expect(rightClicks).toEqual([]);
  } finally {
    result.dispose();
  }
});

test("click and wheel independently select matching registrations", async () => {
  const calls: Array<{
    readonly name: string;
    readonly event: TuiMouseClickEvent | TuiMouseWheelEvent;
  }> = [];
  const App = defineComponent(() => {
    const parent = shallowRef<Target>(null);
    const child = shallowRef<Target>(null);

    useMouseEvent(parent, "click", (event) => {
      calls.push({ name: "parent-click", event });
      return "consume";
    });
    useMouseEvent(child, "wheel", (event) => {
      calls.push({ name: "child-wheel", event });
      return "continue";
    });
    useMouseEvent(parent, "wheel", (event) => {
      calls.push({ name: "parent-wheel", event });
      return "consume";
    });

    return () => (
      <Box ref={parent} width={5} height={1}>
        <Box ref={child} width={2} height={1} />
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 1, y: 0 });
    await result.mouse.up({ x: 1, y: 0 });
    await result.mouse.wheel({ x: 1, y: 0 }, "down", { shift: true });

    expect(calls.map(({ name }) => name)).toEqual(["parent-click", "child-wheel", "parent-wheel"]);
    expect(calls[0]!.event).toMatchObject({ delivery: "target", local: { x: 1, y: 0 } });
    expect(calls[1]!.event).toMatchObject({
      delivery: "target",
      delta: { x: 0, y: 1 },
      local: { x: 1, y: 0 },
      modifiers: { shift: true, alt: false, ctrl: false },
    });
    expect(calls[2]!.event).toMatchObject({
      delivery: "bubble",
      delta: { x: 0, y: 1 },
      local: { x: 1, y: 0 },
    });
  } finally {
    result.dispose();
  }
});

test("a nested Text registration uses its exact painted fragment", async () => {
  const events: TuiMouseClickEvent[] = [];
  const App = defineComponent(() => {
    const inner = shallowRef<Target>(null);
    useMouseEvent(inner, "click", (event) => {
      events.push(event);
      return "consume";
    });
    return () => (
      <Text>
        outer <Text ref={inner}>inner</Text>
      </Text>
    );
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 7, y: 0 });
    await result.mouse.up({ x: 7, y: 0 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      surface: { x: 7, y: 0 },
      local: { x: 1, y: 0 },
    });
  } finally {
    result.dispose();
  }
});

test("hit testing excludes clipped cells", async () => {
  const events: TuiMouseClickEvent[] = [];
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    useMouseEvent(target, "click", (event) => {
      events.push(event);
      return "consume";
    });
    return () => (
      <Box width={4} height={1} overflow="hidden">
        <Box ref={target} marginLeft={3} width={3} height={1} />
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 3, y: 0 });
    await result.mouse.up({ x: 3, y: 0 });
    await result.mouse.down({ x: 4, y: 0 });
    await result.mouse.up({ x: 4, y: 0 });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: { x: 3, y: 0 }, local: { x: 0, y: 0 } });
  } finally {
    result.dispose();
  }
});

test("hit testing honors absolute position and last-painted overlap", async () => {
  const calls: Array<[string, TuiMouseClickEvent]> = [];
  const App = defineComponent(() => {
    const first = shallowRef<Target>(null);
    const second = shallowRef<Target>(null);
    useMouseEvent(first, "click", (event) => {
      calls.push(["first", event]);
      return "consume";
    });
    useMouseEvent(second, "click", (event) => {
      calls.push(["second", event]);
      return "consume";
    });
    return () => (
      <Box width={6} height={3}>
        <Box ref={first} position="absolute" left={2} top={1} width={2} height={1} />
        <Box ref={second} position="absolute" left={2} top={1} width={1} height={1} />
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 2, y: 1 });
    await result.mouse.up({ x: 2, y: 1 });
    await result.mouse.down({ x: 3, y: 1 });
    await result.mouse.up({ x: 3, y: 1 });

    expect(calls.map(([name]) => name)).toEqual(["second", "first"]);
    expect(calls[0]![1].local).toEqual({ x: 0, y: 0 });
    expect(calls[1]![1].local).toEqual({ x: 1, y: 0 });
  } finally {
    result.dispose();
  }
});

test("Static rejection precedes Fullscreen mouse targeting and leaves a clean host", async () => {
  const rejectedClicks: TuiMouseClickEvent[] = [];
  const RejectedApp = defineComponent(() => {
    const target = shallowRef<Target>(null);
    useMouseEvent(target, "click", (event) => {
      rejectedClicks.push(event);
      return "consume";
    });
    return () => (
      <Box>
        <Box ref={target} width={6} height={1}>
          <Text>dynamic</Text>
        </Box>
        <Static items={[]}>{{ default: () => <Text>unreachable</Text> }}</Static>
      </Box>
    );
  });

  await expect(renderFullscreen(RejectedApp)).rejects.toThrow(
    "<Static> cannot render on an effective visual Fullscreen surface",
  );
  expect(rejectedClicks).toEqual([]);

  const validClicks: TuiMouseClickEvent[] = [];
  const ValidApp = defineComponent(() => {
    const target = shallowRef<Target>(null);
    useMouseEvent(target, "click", (event) => {
      validClicks.push(event);
      return "consume";
    });
    return () => <Box ref={target} width={6} height={1} />;
  });
  const result = await renderFullscreen(ValidApp);
  try {
    expect(result.mouse.reporting.current).toBe("button");
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.up({ x: 0, y: 0 });
    expect(validClicks).toHaveLength(1);
  } finally {
    result.dispose();
  }
});

test("hidden targets release reporting and restore one registration when shown again", async () => {
  const visible = shallowRef(true);
  const clicks: TuiMouseClickEvent[] = [];
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    useMouseEvent(target, "click", (event) => {
      clicks.push(event);
      return "consume";
    });
    return () => (
      <Box ref={target} display={visible.value ? "flex" : "none"} width={4} height={1} />
    );
  });
  const result = await renderFullscreen(App);

  try {
    expect(result.mouse.reporting.history).toEqual(["button"]);
    visible.value = false;
    await flushUpdate(result);
    expect(result.mouse.reporting.current).toBe("none");
    await expect(result.mouse.down({ x: 0, y: 0 })).rejects.toThrow("without button reporting");

    visible.value = true;
    await flushUpdate(result);
    expect(result.mouse.reporting.history).toEqual(["button", "none", "button"]);
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.up({ x: 0, y: 0 });
    expect(clicks).toHaveLength(1);
  } finally {
    result.dispose();
  }
});

test("a stable component ref follows insertion, loss, and restoration of its rendered host", async () => {
  const phase = shallowRef<"empty" | "visible">("empty");
  const events: TuiMouseDragEvent[] = [];
  let dragging: Readonly<Ref<boolean>> | undefined;
  const StableTarget = defineComponent(
    () => () =>
      phase.value === "visible" ? (
        <Box key="visible" width={4} height={1}>
          <Text>drag</Text>
        </Box>
      ) : null,
  );
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof StableTarget> | null>(null);
    dragging = useMouseDrag(target, (event) => events.push(event)).isDragging;
    return () => <StableTarget ref={target} />;
  });
  const result = await renderFullscreen(App);

  try {
    expect(result.mouse.reporting.current).toBe("none");

    phase.value = "visible";
    await flushUpdate(result);
    expect(result.mouse.reporting.current).toBe("button-motion");
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });
    expect(events.map(({ phase: eventPhase }) => eventPhase)).toEqual(["start"]);
    expect(dragging?.value).toBe(true);

    phase.value = "empty";
    await flushUpdate(result);
    expect(events.map(({ phase: eventPhase }) => eventPhase)).toEqual(["start", "cancel"]);
    expect(events[1]).toMatchObject({ phase: "cancel", reason: "target-lost" });
    expect(dragging?.value).toBe(false);
    expect(result.mouse.reporting.current).toBe("none");

    phase.value = "visible";
    await flushUpdate(result);
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });
    await result.mouse.up({ x: 1, y: 0 });
    expect(events.map(({ phase: eventPhase }) => eventPhase)).toEqual([
      "start",
      "cancel",
      "start",
      "end",
    ]);
  } finally {
    result.dispose();
  }
});

test("a stable component ref retargets to a keyed replacement without inheriting a click", async () => {
  const phase = shallowRef<"a" | "b">("a");
  const clicks: TuiMouseClickEvent[] = [];
  const StableTarget = defineComponent(
    () => () =>
      phase.value === "a" ? (
        <Box key="a" width={4} height={1}>
          <Text>AAAA</Text>
        </Box>
      ) : (
        <Box key="b" marginLeft={5} width={4} height={1}>
          <Text>BBBB</Text>
        </Box>
      ),
  );
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof StableTarget> | null>(null);
    useMouseEvent(target, "click", (event) => {
      clicks.push(event);
      return "consume";
    });
    return () => <StableTarget ref={target} />;
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 0, y: 0 });
    phase.value = "b";
    await flushUpdate(result);
    await result.mouse.up({ x: 5, y: 0 });
    expect(clicks).toEqual([]);

    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.up({ x: 0, y: 0 });
    await result.mouse.down({ x: 5, y: 0 });
    await result.mouse.up({ x: 5, y: 0 });
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({ surface: { x: 5, y: 0 }, local: { x: 0, y: 0 } });
  } finally {
    result.dispose();
  }
});

test("drag captures outside the target, composes registrations, and suppresses click", async () => {
  const clicks: TuiMouseClickEvent[] = [];
  const first: TuiMouseDragEvent[] = [];
  const second: TuiMouseDragEvent[] = [];
  let firstDragging: Readonly<Ref<boolean>> | undefined;
  let secondDragging: Readonly<Ref<boolean>> | undefined;
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    useMouseEvent(target, "click", (event) => {
      clicks.push(event);
      return "consume";
    });
    firstDragging = useMouseDrag(target, (event) => first.push(event)).isDragging;
    secondDragging = useMouseDrag(target, (event) => second.push(event)).isDragging;
    return () => (
      <Box ref={target} width={4} height={2}>
        <Text>drag</Text>
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    expect(result.mouse.reporting.current).toBe("button-motion");
    await result.mouse.down({ x: 1, y: 0 });
    expect(first).toEqual([]);
    expect(firstDragging?.value).toBe(false);

    await result.mouse.move({ x: 6, y: 3 }, { shift: true });
    expect(first[0]).toMatchObject({
      phase: "start",
      surface: { x: 6, y: 3 },
      local: null,
      movement: { x: 5, y: 3 },
      modifiers: { shift: true, alt: false, ctrl: false },
    });
    expect(second[0]).toMatchObject(first[0]!);
    expect(firstDragging?.value).toBe(true);
    expect(secondDragging?.value).toBe(true);

    await result.mouse.move({ x: 7, y: 4 });
    await result.mouse.up({ x: 8, y: 4 });
    expect(first.map(({ phase }) => phase)).toEqual(["start", "move", "end"]);
    expect(second.map(({ phase }) => phase)).toEqual(["start", "move", "end"]);
    expect(first[1]).toMatchObject({ movement: { x: 1, y: 1 }, local: null });
    expect(first[2]).toMatchObject({ movement: { x: 1, y: 0 }, local: null });
    expect(firstDragging?.value).toBe(false);
    expect(secondDragging?.value).toBe(false);
    expect(clicks).toEqual([]);
  } finally {
    result.dispose();
  }
});

test("stopping one drag registration scope cancels it as deactivated", async () => {
  const events: TuiMouseDragEvent[] = [];
  let dragging: Readonly<Ref<boolean>> | undefined;
  let stopScope = () => {};
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    const scope = effectScope();
    stopScope = () => scope.stop();
    scope.run(() => {
      dragging = useMouseDrag(target, (event) => events.push(event)).isDragging;
    });
    return () => (
      <Box ref={target} width={4} height={1}>
        <Text>drag</Text>
      </Box>
    );
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });
    expect(dragging?.value).toBe(true);

    stopScope();
    await flushUpdate(result);
    expect(events.map(({ phase }) => phase)).toEqual(["start", "cancel"]);
    expect(events[1]).toMatchObject({ phase: "cancel", reason: "deactivated" });
    expect(dragging?.value).toBe(false);
    expect(result.mouse.reporting.current).toBe("none");
  } finally {
    result.dispose();
  }
});

test("suspension cancels a drag and resume requires a fresh gesture", async () => {
  const events: TuiMouseDragEvent[] = [];
  let dragging: Readonly<Ref<boolean>> | undefined;
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    dragging = useMouseDrag(target, (event) => events.push(event)).isDragging;
    return () => <Box ref={target} width={4} height={1} />;
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });
    await result.terminal.suspend();

    expect(events.map(({ phase }) => phase)).toEqual(["start", "cancel"]);
    expect(events[1]).toMatchObject({ phase: "cancel", reason: "suspended" });
    expect(dragging?.value).toBe(false);

    await result.terminal.resume();
    expect(result.mouse.reporting.current).toBe("button-motion");
    await expect(result.mouse.move({ x: 2, y: 0 })).rejects.toThrow(
      "requires an unmatched left-button down",
    );
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });
    await result.mouse.up({ x: 1, y: 0 });
    expect(events.map(({ phase }) => phase)).toEqual(["start", "cancel", "start", "end"]);
  } finally {
    result.dispose();
  }
});

test("deactivation during start finishes the frozen phase before one cancel", async () => {
  const first: TuiMouseDragEvent[] = [];
  const second: TuiMouseDragEvent[] = [];
  let secondDragging: Readonly<Ref<boolean>> | undefined;
  let stopSecond = () => {};
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    useMouseDrag(target, (event) => {
      first.push(event);
      if (event.phase === "start") stopSecond();
    });
    const secondScope = effectScope();
    stopSecond = () => secondScope.stop();
    secondScope.run(() => {
      secondDragging = useMouseDrag(target, (event) => second.push(event)).isDragging;
    });
    return () => <Box ref={target} width={4} height={1} />;
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });
    expect(second.map(({ phase }) => phase)).toEqual(["start", "cancel"]);
    expect(second[1]).toMatchObject({ phase: "cancel", reason: "deactivated" });
    expect(secondDragging?.value).toBe(false);

    await result.mouse.up({ x: 1, y: 0 });
    expect(first.map(({ phase }) => phase)).toEqual(["start", "end"]);
    expect(second.map(({ phase }) => phase)).toEqual(["start", "cancel"]);
  } finally {
    result.dispose();
  }
});

test("self-deactivation during move emits one move followed by one cancel", async () => {
  const events: TuiMouseDragEvent[] = [];
  let dragging: Readonly<Ref<boolean>> | undefined;
  let stopScope = () => {};
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    const scope = effectScope();
    stopScope = () => scope.stop();
    scope.run(() => {
      dragging = useMouseDrag(target, (event) => {
        events.push(event);
        if (event.phase === "move") stopScope();
      }).isDragging;
    });
    return () => <Box ref={target} width={4} height={1} />;
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });
    await result.mouse.move({ x: 2, y: 0 });
    expect(events.map(({ phase }) => phase)).toEqual(["start", "move", "cancel"]);
    expect(events[2]).toMatchObject({ phase: "cancel", reason: "deactivated" });
    expect(dragging?.value).toBe(false);
    expect(result.mouse.reporting.current).toBe("none");
  } finally {
    result.dispose();
  }
});

test("cohort deactivation during end cannot append a cancel", async () => {
  const first: TuiMouseDragEvent[] = [];
  const second: TuiMouseDragEvent[] = [];
  let firstDragging: Readonly<Ref<boolean>> | undefined;
  let secondDragging: Readonly<Ref<boolean>> | undefined;
  let stopFirst = () => {};
  let stopSecond = () => {};
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    const firstScope = effectScope();
    stopFirst = () => firstScope.stop();
    firstScope.run(() => {
      firstDragging = useMouseDrag(target, (event) => {
        first.push(event);
        if (event.phase === "end") {
          stopFirst();
          stopSecond();
        }
      }).isDragging;
    });
    const secondScope = effectScope();
    stopSecond = () => secondScope.stop();
    secondScope.run(() => {
      secondDragging = useMouseDrag(target, (event) => second.push(event)).isDragging;
    });
    return () => <Box ref={target} width={4} height={1} />;
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });
    await result.mouse.up({ x: 1, y: 0 });
    expect(first.map(({ phase }) => phase)).toEqual(["start", "end"]);
    expect(second.map(({ phase }) => phase)).toEqual(["start", "end"]);
    expect(firstDragging?.value).toBe(false);
    expect(secondDragging?.value).toBe(false);
    expect(result.mouse.reporting.current).toBe("none");
  } finally {
    result.dispose();
  }
});

test("cohort deactivation during cancel cannot recurse or duplicate cancel", async () => {
  const first: TuiMouseDragEvent[] = [];
  const second: TuiMouseDragEvent[] = [];
  let firstDragging: Readonly<Ref<boolean>> | undefined;
  let secondDragging: Readonly<Ref<boolean>> | undefined;
  let stopFirst = () => {};
  let stopSecond = () => {};
  const App = defineComponent(() => {
    const target = shallowRef<Target>(null);
    const firstScope = effectScope();
    stopFirst = () => firstScope.stop();
    firstScope.run(() => {
      firstDragging = useMouseDrag(target, (event) => {
        first.push(event);
        if (event.phase === "cancel") {
          stopFirst();
          stopSecond();
        }
      }).isDragging;
    });
    const secondScope = effectScope();
    stopSecond = () => secondScope.stop();
    secondScope.run(() => {
      secondDragging = useMouseDrag(target, (event) => second.push(event)).isDragging;
    });
    return () => <Box ref={target} width={4} height={1} />;
  });
  const result = await renderFullscreen(App);

  try {
    await result.mouse.down({ x: 0, y: 0 });
    await result.mouse.move({ x: 1, y: 0 });
    await result.terminal.suspend();
    expect(first.map(({ phase }) => phase)).toEqual(["start", "cancel"]);
    expect(second.map(({ phase }) => phase)).toEqual(["start", "cancel"]);
    expect(first[1]).toMatchObject({ phase: "cancel", reason: "suspended" });
    expect(second[1]).toMatchObject({ phase: "cancel", reason: "suspended" });
    expect(firstDragging?.value).toBe(false);
    expect(secondDragging?.value).toBe(false);
  } finally {
    result.dispose();
  }
});
