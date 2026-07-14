import { defineComponent, shallowRef, type ComponentPublicInstance, type ShallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import {
  Box,
  Text,
  useElementGeometry,
  useFocus,
  useFocusedInput,
  useFocusScope,
  useFocusScopeInput,
  type InputHandlerResult,
  type InputRouteDecision,
  type RenderMode,
  type TuiInputEvent,
  type UseElementGeometryReturn,
} from "@vue-tui/runtime";
import {
  useMouseEvent,
  type MouseHandlerResult,
  type TuiMouseWheelEvent,
} from "@vue-tui/runtime/fullscreen";
import { render, type RenderResult } from "@vue-tui/testing";

type Target = ComponentPublicInstance | null;
type ScrollOperation = "up" | "down" | "pageup" | "pagedown" | "home" | "end";

const modes = ["inline", "fullscreen"] as const satisfies readonly RenderMode[];
const innerLines = Array.from({ length: 8 }, (_, index) => `inner ${index}`);
const outerLines = Array.from({ length: 6 }, (_, index) => `outer ${index}`);

const continueOwnedKey: InputRouteDecision = Object.freeze({
  action: "none",
  routing: "continue",
  defaultAction: "prevent",
  external: "block",
});
const stopOwnedKey: InputRouteDecision = Object.freeze({
  action: "none",
  routing: "stop",
  defaultAction: "prevent",
  external: "block",
});

function keyOperation(event: TuiInputEvent): ScrollOperation | null {
  if (event.kind !== "key" || event.key.phase === "release") return null;
  switch (event.key.name) {
    case "up":
    case "down":
    case "pageup":
    case "pagedown":
    case "home":
    case "end":
      return event.key.name;
    default:
      return null;
  }
}

function visibleHeight(projection: UseElementGeometryReturn, owner: string): number {
  const geometry = projection.geometry.value;
  if (geometry.status !== "visible") {
    throw new Error(`${owner} scroll target must be visible before page input`);
  }
  return geometry.parent.height;
}

function perform(
  handle: ScrollBoxExpose | undefined | null,
  operation: ScrollOperation,
  pageLines: number,
): boolean {
  if (!handle) throw new Error("ScrollBox handle must be available before input delivery");
  switch (operation) {
    case "up":
      return handle.scrollByLines(-1);
    case "down":
      return handle.scrollByLines(1);
    case "pageup":
      return handle.scrollByLines(-pageLines);
    case "pagedown":
      return handle.scrollByLines(pageLines);
    case "home":
      return handle.scrollToTop();
    case "end":
      return handle.scrollToBottom();
  }
}

function scrollLayout(
  outer: ShallowRef<ScrollBoxExpose | null>,
  inner: ShallowRef<ScrollBoxExpose | null>,
  outerTarget: ShallowRef<Target>,
  innerTarget: ShallowRef<Target>,
) {
  return (
    <Box ref={outerTarget} width={20} height={6} flexDirection="column" flexShrink={0}>
      <ScrollBox ref={outer}>
        {outerLines.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
        <Box ref={innerTarget} height={3} flexDirection="column" flexShrink={0}>
          <ScrollBox ref={inner}>
            {innerLines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </ScrollBox>
        </Box>
        <Text>outer tail</Text>
      </ScrollBox>
    </Box>
  );
}

async function setOffsets(
  result: RenderResult,
  outer: ShallowRef<ScrollBoxExpose | null>,
  inner: ShallowRef<ScrollBoxExpose | null>,
  outerLine: number,
  innerLine: number,
): Promise<void> {
  outer.value?.scrollToLine(outerLine);
  inner.value?.scrollToLine(innerLine);
  await result.waitUntilRenderFlush();
}

for (const mode of modes) {
  test(`nested transcript keyboard scrolling continues only at an inner edge in ${mode}`, async () => {
    const outer = shallowRef<ScrollBoxExpose | null>(null);
    const inner = shallowRef<ScrollBoxExpose | null>(null);
    const trace: string[] = [];
    const App = defineComponent(() => {
      const outerTarget = shallowRef<Target>(null);
      const innerTarget = shallowRef<Target>(null);
      const outerGeometry = useElementGeometry(outerTarget);
      const innerGeometry = useElementGeometry(innerTarget);
      const outerScope = useFocusScope();
      const innerFocus = useFocus(innerTarget, {
        scope: outerScope,
        autoFocus: true,
        tabIndex: -1,
      });

      useFocusedInput(innerFocus, (event): InputHandlerResult => {
        const operation = keyOperation(event);
        if (!operation) return "continue";
        const moved = perform(inner.value, operation, visibleHeight(innerGeometry, "inner"));
        trace.push(`inner:${operation}:${moved ? "moved" : "unchanged"}`);
        return moved ? "consume" : continueOwnedKey;
      });
      useFocusScopeInput(outerScope, (event): InputHandlerResult => {
        const operation = keyOperation(event);
        if (!operation) return "continue";
        const moved = perform(outer.value, operation, visibleHeight(outerGeometry, "outer"));
        trace.push(`outer:${operation}:${moved ? "moved" : "unchanged"}`);
        return moved ? "consume" : stopOwnedKey;
      });

      return () => scrollLayout(outer, inner, outerTarget, innerTarget);
    });
    const result = await render(App, { columns: 30, rows: 10, host: { mode } });

    try {
      await setOffsets(result, outer, inner, 3, 2);
      await result.stdin.write("\x1b[B");
      await result.stdin.write("\x1b[F");
      await result.stdin.write("\x1b[B");
      await result.stdin.write("\x1b[A");
      await result.stdin.write("\x1b[H");
      await result.stdin.write("\x1b[H");

      await setOffsets(result, outer, inner, 3, 0);
      await result.stdin.write("\x1b[6~");
      await result.stdin.write("\x1b[6~");
      await result.stdin.write("\x1b[6~");
      await result.stdin.write("\x1b[5~");

      expect(trace).toEqual([
        "inner:down:moved",
        "inner:end:moved",
        "inner:down:unchanged",
        "outer:down:moved",
        "inner:up:moved",
        "inner:home:moved",
        "inner:home:unchanged",
        "outer:home:moved",
        "inner:pagedown:moved",
        "inner:pagedown:moved",
        "inner:pagedown:unchanged",
        "outer:pagedown:moved",
        "inner:pageup:moved",
      ]);
    } finally {
      result.dispose();
    }
  });
}

test("nested workbench wheel scrolling bubbles only at an inner edge", async () => {
  const outer = shallowRef<ScrollBoxExpose | null>(null);
  const inner = shallowRef<ScrollBoxExpose | null>(null);
  const trace: string[] = [];
  let innerGeometry!: UseElementGeometryReturn;
  const App = defineComponent(() => {
    const outerTarget = shallowRef<Target>(null);
    const innerTarget = shallowRef<Target>(null);
    innerGeometry = useElementGeometry(innerTarget);

    const scroll = (
      owner: "inner" | "outer",
      handle: ShallowRef<ScrollBoxExpose | null>,
      event: TuiMouseWheelEvent,
    ): MouseHandlerResult => {
      const exposed = handle.value;
      if (!exposed)
        throw new Error(`${owner} ScrollBox handle must be available before wheel delivery`);
      const moved = exposed.scrollByLines(event.delta.y);
      trace.push(`${owner}:${event.delivery}:${moved ? "moved" : "unchanged"}`);
      return moved ? "consume" : "continue";
    };
    useMouseEvent(innerTarget, "wheel", (event) => scroll("inner", inner, event));
    useMouseEvent(outerTarget, "wheel", (event) => scroll("outer", outer, event));

    return () => scrollLayout(outer, inner, outerTarget, innerTarget);
  });
  const result = await render(App, {
    columns: 30,
    rows: 10,
    host: { mode: "fullscreen" },
  });

  const wheelAtInner = async (direction: "up" | "down") => {
    const geometry = innerGeometry.geometry.value;
    if (geometry.status !== "visible") throw new Error("inner scroll target must be visible");
    const visible = geometry.fragments.find((fragment) => fragment.visibleSurface)?.visibleSurface;
    if (!visible) throw new Error("inner scroll target needs a visible fragment");
    await result.mouse.wheel({ x: visible.x, y: visible.y }, direction);
  };

  try {
    await setOffsets(result, outer, inner, 3, 2);
    await wheelAtInner("down");

    await setOffsets(result, outer, inner, 3, 5);
    await wheelAtInner("down");
    await wheelAtInner("up");

    expect(trace).toEqual([
      "inner:target:moved",
      "inner:target:unchanged",
      "outer:bubble:moved",
      "inner:target:moved",
    ]);
  } finally {
    result.dispose();
  }
});
