import { defineComponent, effectScope, nextTick, shallowRef, type Ref } from "vue";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  Box,
  Static,
  Text,
  createApp,
  useDraggable,
  type MouseTarget,
  type TuiMouseEvent,
  type TuiWheelEvent,
} from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

const ENABLE_SGR_DRAG_MOUSE = "\x1b[?1002h\x1b[?1006h";
const DISABLE_SGR_DRAG_MOUSE = "\x1b[?1002l\x1b[?1006l";
const DISABLE_SGR_BUTTON_TRACKING = "\x1b[?1000l";
const DISABLE_SGR_HOVER_TRACKING = "\x1b[?1003l";
type BoxInstance = InstanceType<typeof Box>;
let previousTerm: string | undefined;

beforeEach(() => {
  previousTerm = process.env["TERM"];
  process.env["TERM"] = "xterm-256color";
});

afterEach(() => {
  if (previousTerm === undefined) delete process.env["TERM"];
  else process.env["TERM"] = previousTerm;
});

async function settle() {
  await nextTick();
  await nextTick();
  await Promise.resolve();
}

function mountMouseApp(
  component: ReturnType<typeof defineComponent>,
  options: boolean | { fullscreen?: boolean; stdinIsTTY?: boolean; maxFps?: number } = true,
) {
  const fullscreen = typeof options === "boolean" ? options : (options.fullscreen ?? true);
  const app = createApp(component);
  const stdout = makeFakeWritable({ columns: 20, rows: 8 });
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  if (typeof options === "object" && options.stdinIsTTY === false) {
    (stdin as { isTTY?: boolean }).isTTY = false;
  }
  const writes = captureWrites(stdout);
  app.mount({
    stdout,
    stderr,
    stdin,
    maxFps: typeof options === "object" ? (options.maxFps ?? 0) : 0,
    mode: fullscreen ? "fullscreen" : "inline",
  });
  return { app, stdin, writes };
}

test("fullscreen element handlers enable 1002 mode and receive hit-tested click events", async () => {
  const clicks: TuiMouseEvent[] = [];
  const App = defineComponent(() => () => (
    <Box width={10} height={4}>
      <Box width={4} height={2} onClick={(event) => clicks.push(event)}>
        <Text>hit</Text>
      </Box>
    </Box>
  ));
  const { app, stdin, writes } = mountMouseApp(App);
  await settle();

  expect(writes.join("")).toContain(ENABLE_SGR_DRAG_MOUSE);

  stdin.emit("data", "\x1b[<0;4;2M\x1b[<0;4;2m");
  await settle();

  expect(clicks).toHaveLength(1);
  expect(clicks[0]!.type).toBe("click");
  expect(clicks[0]!.button).toBe("left");
  expect(clicks[0]!.screenX).toBe(3);
  expect(clicks[0]!.screenY).toBe(1);
  expect(clicks[0]!.offsetX).toBe(3);
  expect(clicks[0]!.offsetY).toBe(1);
  expect(clicks[0]!.detail).toBe(1);
  expect(clicks[0]!.target).toBe(clicks[0]!.currentTarget);
  expect(clicks[0]!.target?.rect).toEqual({ x: 0, y: 0, width: 4, height: 2 });

  app.unmount();
  await settle();
  expect(writes.join("")).toContain(DISABLE_SGR_DRAG_MOUSE);
  expect(writes.join("")).not.toContain(DISABLE_SGR_BUTTON_TRACKING);
  expect(writes.join("")).not.toContain(DISABLE_SGR_HOVER_TRACKING);
});

test("mouse events bubble and stopPropagation stops ancestor handlers", async () => {
  const calls: string[] = [];
  const stop = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box width={10} height={4} onClick={() => calls.push("parent")}>
      <Box
        width={4}
        height={2}
        onClick={(event) => {
          calls.push("child");
          if (stop.value) event.stopPropagation();
        }}
      >
        <Text>hit</Text>
      </Box>
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();
  expect(calls).toEqual(["child", "parent"]);

  calls.length = 0;
  stop.value = true;
  await settle();
  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();
  expect(calls).toEqual(["child"]);

  app.unmount();
});

test("mouse events rebase offsets while bubbling", async () => {
  const calls: Array<[string, number, number]> = [];
  const App = defineComponent(() => () => (
    <Box
      marginLeft={2}
      width={5}
      height={1}
      onClick={(event) => calls.push(["parent", event.offsetX, event.offsetY])}
    >
      <Box
        marginLeft={1}
        width={2}
        height={1}
        onClick={(event) => calls.push(["child", event.offsetX, event.offsetY])}
      />
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;4;1M\x1b[<0;4;1m");
  await settle();

  expect(calls).toEqual([
    ["child", 0, 0],
    ["parent", 1, 0],
  ]);
  app.unmount();
});

test("mouse events keep per-handler rebased event objects stable after bubbling", async () => {
  let childEvent: TuiMouseEvent | undefined;
  let parentEvent: TuiMouseEvent | undefined;
  const App = defineComponent(() => () => (
    <Box
      marginLeft={2}
      width={5}
      height={1}
      onClick={(event) => {
        parentEvent = event;
      }}
    >
      <Box
        marginLeft={1}
        width={2}
        height={1}
        onClick={(event) => {
          childEvent = event;
        }}
      />
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;4;1M\x1b[<0;4;1m");
  await settle();

  if (!childEvent || !parentEvent) throw new Error("expected bubbling click events");
  expect(childEvent).not.toBe(parentEvent);
  expect(childEvent.currentTarget).not.toBe(parentEvent.currentTarget);
  expect(childEvent.offsetX).toBe(0);
  expect(childEvent.offsetY).toBe(0);
  expect(parentEvent.offsetX).toBe(1);
  expect(parentEvent.offsetY).toBe(0);
  app.unmount();
});

test("click detail increments for repeated clicks at the same target and cell", async () => {
  const details: number[] = [];
  const App = defineComponent(() => () => (
    <Box width={4} height={2} onClick={(event) => details.push(event.detail)}>
      <Text>hit</Text>
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();

  expect(details).toEqual([1, 2]);
  app.unmount();
});

test("click synthesis only requires down and up on the same target", async () => {
  const clicks: TuiMouseEvent[] = [];
  const App = defineComponent(() => () => (
    <Box width={4} height={2} onClick={(event) => clicks.push(event)} />
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;4;2m");
  await settle();

  expect(clicks).toHaveLength(1);
  expect(clicks[0]!.screenX).toBe(3);
  expect(clicks[0]!.screenY).toBe(1);
  expect(clicks[0]!.offsetX).toBe(3);
  expect(clicks[0]!.offsetY).toBe(1);
  app.unmount();
});

test("click detail does not increment across cells on the same target", async () => {
  const details: number[] = [];
  const App = defineComponent(() => () => (
    <Box width={4} height={2} onClick={(event) => details.push(event.detail)} />
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m\x1b[<0;4;2M\x1b[<0;4;2m");
  await settle();

  expect(details).toEqual([1, 1]);
  app.unmount();
});

test("click is not synthesized when down and up hit different targets", async () => {
  const clicks: string[] = [];
  const App = defineComponent(() => () => (
    <Box height={1}>
      <Box width={2} height={1} onClick={() => clicks.push("left")} />
      <Box width={2} height={1} onClick={() => clicks.push("right")} />
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;4;1m");
  await settle();

  expect(clicks).toEqual([]);
  app.unmount();
});

test("wheel events use DOM-shaped delta fields and no button", async () => {
  const wheels: TuiWheelEvent[] = [];
  const App = defineComponent(() => () => (
    <Box width={4} height={2} onWheel={(event) => wheels.push(event)}>
      <Text>hit</Text>
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<65;1;1M");
  await settle();

  expect(wheels).toHaveLength(1);
  expect(wheels[0]!.type).toBe("wheel");
  expect(wheels[0]!.button).toBe(null);
  expect(wheels[0]!.deltaX).toBe(0);
  expect(wheels[0]!.deltaY).toBe(1);
  app.unmount();
});

test("inline element mouse handlers warn once and do not arm SGR mouse", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const App = defineComponent(() => () => (
    <Box width={4} height={2} onClick={() => {}}>
      <Text>inline</Text>
    </Box>
  ));
  const { app, writes } = mountMouseApp(App, false);
  await settle();

  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]![0]).toContain('app.mount({ mode: "fullscreen" })');
  expect(warn.mock.calls[0]![0]).toContain("useMouseInput()");
  expect(writes.join("")).not.toContain(ENABLE_SGR_DRAG_MOUSE);

  warn.mockRestore();
  app.unmount();
});

test("inline element mouse handlers warn in production too", async () => {
  const previousNodeEnv = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "production";
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const App = defineComponent(() => () => (
    <Box width={4} height={2} onClick={() => {}}>
      <Text>inline</Text>
    </Box>
  ));

  try {
    const { app } = mountMouseApp(App, false);
    await settle();

    expect(warn).toHaveBeenCalledTimes(1);
    app.unmount();
  } finally {
    if (previousNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = previousNodeEnv;
    warn.mockRestore();
  }
});

test("TERM=dumb does not arm SGR mouse or deliver element handlers", async () => {
  process.env["TERM"] = "dumb";
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const clicks: TuiMouseEvent[] = [];
  const App = defineComponent(() => () => (
    <Box width={4} height={2} onClick={(event) => clicks.push(event)}>
      <Text>dumb</Text>
    </Box>
  ));

  try {
    const { app, stdin, writes } = mountMouseApp(App);
    await settle();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(writes.join("")).not.toContain(ENABLE_SGR_DRAG_MOUSE);

    stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
    await settle();

    expect(clicks).toEqual([]);
    app.unmount();
  } finally {
    process.env["TERM"] = "xterm-256color";
    warn.mockRestore();
  }
});

test("non-TTY stdin does not arm SGR mouse or throw for fullscreen handlers", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const clicks: TuiMouseEvent[] = [];
  const App = defineComponent(() => () => (
    <Box width={4} height={2} onClick={(event) => clicks.push(event)}>
      <Text>pipe</Text>
    </Box>
  ));

  const { app, stdin, writes } = mountMouseApp(App, { stdinIsTTY: false });
  await settle();

  expect(warn).toHaveBeenCalledTimes(1);
  expect(writes.join("")).not.toContain(ENABLE_SGR_DRAG_MOUSE);

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();

  expect(clicks).toEqual([]);
  warn.mockRestore();
  app.unmount();
});

test("nested Text handlers receive virtual-text hit-test events", async () => {
  const calls: TuiMouseEvent[] = [];
  const App = defineComponent(() => () => (
    <Text>
      outer <Text onClick={(event) => calls.push(event)}>inner</Text>
    </Text>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;8;1M\x1b[<0;8;1m");
  await settle();

  expect(calls).toHaveLength(1);
  expect(calls[0]!.target).toBe(calls[0]!.currentTarget);
  expect(calls[0]!.offsetX).toBe(1);
  expect(calls[0]!.offsetY).toBe(0);
  expect(calls[0]!.target?.rect).toEqual({ x: 6, y: 0, width: 5, height: 1 });
  app.unmount();
});

test("hit-testing honors overflow hidden clipping", async () => {
  const calls: TuiMouseEvent[] = [];
  const App = defineComponent(() => () => (
    <Box width={4} height={1} overflow="hidden">
      <Box marginLeft={3} width={3} height={1} onClick={(event) => calls.push(event)} />
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;4;1M\x1b[<0;4;1m\x1b[<0;5;1M\x1b[<0;5;1m");
  await settle();

  expect(calls).toHaveLength(1);
  expect(calls[0]!.screenX).toBe(3);
  expect(calls[0]!.target?.rect).toEqual({ x: 3, y: 0, width: 1, height: 1 });
  app.unmount();
});

test("hit-testing honors absolute positioning", async () => {
  const calls: TuiMouseEvent[] = [];
  const App = defineComponent(() => () => (
    <Box width={6} height={3}>
      <Box
        position="absolute"
        left={2}
        top={1}
        width={2}
        height={1}
        onClick={(event) => calls.push(event)}
      />
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;3;2M\x1b[<0;3;2m\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();

  expect(calls).toHaveLength(1);
  expect(calls[0]!.offsetX).toBe(0);
  expect(calls[0]!.offsetY).toBe(0);
  expect(calls[0]!.target?.rect).toEqual({ x: 2, y: 1, width: 2, height: 1 });
  app.unmount();
});

test("hit-testing excludes Static content", async () => {
  const staticClicks: string[] = [];
  const dynamicClicks: string[] = [];
  const App = defineComponent(() => () => (
    <Box>
      <Box width={6} height={1} onClick={() => dynamicClicks.push("dynamic")}>
        <Text>dyn</Text>
      </Box>
      <Static items={["history"]}>
        {{
          default: ({ index }: { index: number }) => (
            <Box key={index} width={6} height={1} onClick={() => staticClicks.push("static")}>
              <Text>static</Text>
            </Box>
          ),
        }}
      </Static>
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await nextTick();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();

  expect(staticClicks).toEqual([]);
  expect(dynamicClicks).toEqual(["dynamic"]);
  app.unmount();
});

test("hit-testing prefers the last-painted overlapping node", async () => {
  const calls: string[] = [];
  const App = defineComponent(() => () => (
    <Box width={4} height={2}>
      <Box
        position="absolute"
        left={0}
        top={0}
        width={2}
        height={1}
        onClick={() => calls.push("first")}
      />
      <Box
        position="absolute"
        left={0}
        top={0}
        width={2}
        height={1}
        onClick={() => calls.push("second")}
      />
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();

  expect(calls).toEqual(["second"]);
  app.unmount();
});

test("a removed target cannot receive input before the throttled replacement frame paints", async () => {
  const visible = shallowRef(true);
  const calls: string[] = [];
  const App = defineComponent(() => () => (
    <Box width={10} height={2}>
      {visible.value ? (
        <Box
          key="removed"
          position="absolute"
          width={2}
          height={1}
          onClick={() => calls.push("removed")}
        />
      ) : undefined}
      <Box
        position="absolute"
        left={5}
        width={2}
        height={1}
        onClick={() => calls.push("survivor")}
      />
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App, { maxFps: 1 });
  await settle();

  visible.value = false;
  // Vue has removed the host node, but the one-second renderer throttle keeps
  // the previous physical frame and hit map observable for this exact gap.
  await nextTick();
  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  await Promise.resolve();

  expect(calls).toEqual([]);
  app.unmount();
});

test("MouseTarget rect is cleared when a mounted node stops painting", async () => {
  const target = shallowRef<MouseTarget | null>(null);
  const hidden = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box
      width={4}
      height={2}
      display={hidden.value ? "none" : "flex"}
      onClick={(event) => {
        target.value = event.currentTarget;
      }}
    >
      <Text>box</Text>
    </Box>
  ));
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();
  expect(target.value?.rect).toEqual({ x: 0, y: 0, width: 4, height: 2 });

  hidden.value = true;
  await settle();

  expect(target.value?.rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  app.unmount();
});

test("useDraggable tracks element position until release", async () => {
  const dragTarget = shallowRef<BoxInstance | null>(null);
  const moves: Array<[string, number, number, number, number, number, number]> = [];
  const App = defineComponent(() => {
    useDraggable(dragTarget, {
      initialValue: { x: 2, y: 1 },
      onStart: (position, event) =>
        moves.push([
          event.type,
          position.x,
          position.y,
          event.screenX,
          event.screenY,
          event.movementX,
          event.movementY,
        ]),
      onMove: (position, event) =>
        moves.push([
          event.type,
          position.x,
          position.y,
          event.screenX,
          event.screenY,
          event.movementX,
          event.movementY,
        ]),
      onEnd: (position, event) =>
        moves.push([
          event.type,
          position.x,
          position.y,
          event.screenX,
          event.screenY,
          event.movementX,
          event.movementY,
        ]),
    });
    return () => (
      <Box width={4} height={2} ref={dragTarget}>
        <Text>drag</Text>
      </Box>
    );
  });
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<65;20;1M\x1b[<32;8;4M\x1b[<0;8;4m");
  await settle();

  expect(moves).toEqual([
    ["dragstart", 2, 1, 0, 0, 0, 0],
    ["drag", 9, 4, 7, 3, 7, 3],
    ["dragend", 9, 4, 7, 3, 0, 0],
  ]);
  app.unmount();
});

test("useDraggable follows inner host insertion and removal while the component ref stays stable", async () => {
  const phase = shallowRef<"empty" | "visible">("empty");
  const starts: number[] = [];
  const StableTarget = defineComponent(() => {
    return () =>
      phase.value === "visible" ? (
        <Box key="visible" width={4} height={1}>
          <Text>drag</Text>
        </Box>
      ) : null;
  });
  const target = shallowRef<InstanceType<typeof StableTarget> | null>(null);
  let isDragging: Readonly<Ref<boolean>> | undefined;
  const App = defineComponent(() => {
    isDragging = useDraggable(target, {
      onStart: (_position, event) => starts.push(event.screenX),
    }).isDragging;
    return () => <StableTarget ref={target} />;
  });
  const { app, stdin, writes } = mountMouseApp(App);
  await settle();

  const stableInstance = target.value;
  expect(stableInstance).not.toBeNull();
  // A component whose current root is `null` has no rendered target. Its Vue
  // comment anchor must not acquire terminal mouse reporting.
  expect(writes.join("")).not.toContain(ENABLE_SGR_DRAG_MOUSE);

  const beforeInsert = writes.length;
  phase.value = "visible";
  await settle();
  expect(target.value).toBe(stableInstance);
  expect(writes.slice(beforeInsert).join("")).toContain(ENABLE_SGR_DRAG_MOUSE);

  stdin.emit("data", "\x1b[<0;1;1M");
  await settle();
  expect(starts).toEqual([0]);
  expect(isDragging?.value).toBe(true);

  const beforeRemove = writes.length;
  phase.value = "empty";
  await settle();
  expect(target.value).toBe(stableInstance);
  expect(writes.slice(beforeRemove).join("")).toContain(DISABLE_SGR_DRAG_MOUSE);
  expect(isDragging?.value).toBe(false);

  stdin.emit("data", "\x1b[<32;2;1M\x1b[<0;2;1m");
  await settle();
  expect(starts).toEqual([0]);

  const beforeRestore = writes.length;
  phase.value = "visible";
  await settle();
  expect(target.value).toBe(stableInstance);
  expect(writes.slice(beforeRestore).join("")).toContain(ENABLE_SGR_DRAG_MOUSE);

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();
  // One physical press produces one registration callback after restoration;
  // a stale or duplicate registration must not survive either transition.
  expect(starts).toEqual([0, 0]);
  app.unmount();
});

test("useDraggable follows a keyed inner-root replacement without changing the component ref", async () => {
  const phase = shallowRef<"a" | "b">("a");
  const targetRects: number[] = [];
  const StableTarget = defineComponent(() => {
    return () =>
      phase.value === "a" ? (
        <Box key="a" width={4} height={1}>
          <Text>AAAA</Text>
        </Box>
      ) : (
        <Box key="b" marginLeft={5} width={4} height={1}>
          <Text>BBBB</Text>
        </Box>
      );
  });
  const target = shallowRef<InstanceType<typeof StableTarget> | null>(null);
  const App = defineComponent(() => {
    useDraggable(target, {
      onStart: (_position, event) => targetRects.push(event.currentTarget?.rect.x ?? -1),
    });
    return () => <StableTarget ref={target} />;
  });
  const { app, stdin } = mountMouseApp(App);
  await settle();

  const stableInstance = target.value;
  expect(stableInstance).not.toBeNull();
  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  await settle();
  expect(targetRects).toEqual([0]);

  phase.value = "b";
  await settle();
  expect(target.value).toBe(stableInstance);

  // The old cell is no longer a target, while one press on the replacement
  // must reach exactly one freshly attached registration.
  stdin.emit("data", "\x1b[<0;1;1M\x1b[<0;1;1m");
  stdin.emit("data", "\x1b[<0;6;1M\x1b[<0;6;1m");
  await settle();
  expect(targetRects).toEqual([0, 5]);
  app.unmount();
});

test("useDraggable detaches and clears active capture when its owning effect scope stops", async () => {
  const target = shallowRef<BoxInstance | null>(null);
  const events: string[] = [];
  let isDragging: Readonly<Ref<boolean>> | undefined;
  let stopScope = () => {};
  const App = defineComponent(() => {
    const scope = effectScope();
    stopScope = () => scope.stop();
    scope.run(() => {
      const drag = useDraggable(target, {
        onStart: () => events.push("start"),
        onMove: () => events.push("move"),
        onEnd: () => events.push("end"),
      });
      isDragging = drag.isDragging;
    });
    return () => (
      <Box ref={target} width={4} height={1}>
        <Text>drag</Text>
      </Box>
    );
  });
  const { app, stdin, writes } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M");
  await settle();
  expect(events).toEqual(["start"]);
  expect(isDragging?.value).toBe(true);

  const beforeStop = writes.length;
  stopScope();
  await settle();
  expect(isDragging?.value).toBe(false);
  expect(writes.slice(beforeStop).join("")).toContain(DISABLE_SGR_DRAG_MOUSE);

  stdin.emit("data", "\x1b[<32;2;1M\x1b[<0;2;1m");
  await settle();
  expect(events).toEqual(["start"]);
  app.unmount();
});

test("useDraggable honors axis", async () => {
  const dragTarget = shallowRef<BoxInstance | null>(null);
  const positions: Array<[number, number]> = [];
  const App = defineComponent(() => {
    useDraggable(dragTarget, {
      initialValue: { x: 10, y: 20 },
      axis: "x",
      onMove: (position) => positions.push([position.x, position.y]),
      onEnd: (position) => positions.push([position.x, position.y]),
    });
    return () => (
      <Box width={4} height={2} ref={dragTarget}>
        <Text>drag</Text>
      </Box>
    );
  });
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<32;6;4M\x1b[<0;6;4m");
  await settle();

  expect(positions).toEqual([
    [15, 20],
    [15, 20],
  ]);
  app.unmount();
});

test("useDraggable lets onStart cancel capture", async () => {
  const dragTarget = shallowRef<BoxInstance | null>(null);
  const moves: string[] = [];
  const App = defineComponent(() => {
    useDraggable(dragTarget, {
      onStart: () => {
        moves.push("start");
        return false;
      },
      onMove: () => moves.push("move"),
      onEnd: () => moves.push("end"),
    });
    return () => (
      <Box width={4} height={2} ref={dragTarget}>
        <Text>drag</Text>
      </Box>
    );
  });
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<32;8;4M\x1b[<0;8;4m");
  await settle();

  expect(moves).toEqual(["start"]);
  app.unmount();
});

test("useDraggable suppresses click after a drag movement", async () => {
  const dragTarget = shallowRef<BoxInstance | null>(null);
  const clicks: string[] = [];
  const drags: string[] = [];
  const App = defineComponent(() => {
    useDraggable(dragTarget, {
      onStart: () => drags.push("start"),
      onMove: () => drags.push("move"),
      onEnd: () => drags.push("end"),
    });
    return () => (
      <Box width={4} height={2} ref={dragTarget} onClick={() => clicks.push("click")}>
        <Text>drag</Text>
      </Box>
    );
  });
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<32;8;4M\x1b[<0;8;4m");
  await settle();

  expect(drags).toEqual(["start", "move", "end"]);
  expect(clicks).toEqual([]);
  app.unmount();
});

test("useDraggable releases pointer capture when the target unmounts", async () => {
  const dragTarget = shallowRef<BoxInstance | null>(null);
  const mounted = shallowRef(true);
  const moves: string[] = [];
  const App = defineComponent(() => {
    useDraggable(dragTarget, {
      onStart: () => moves.push("start"),
      onMove: () => {
        moves.push("move");
        mounted.value = false;
      },
      onEnd: () => moves.push("end"),
    });
    return () => (
      <Box width={8} height={2}>
        {mounted.value ? (
          <Box width={4} height={1} ref={dragTarget}>
            <Text>drag</Text>
          </Box>
        ) : (
          <Box width={4} height={1}>
            <Text>gone</Text>
          </Box>
        )}
      </Box>
    );
  });
  const { app, stdin } = mountMouseApp(App);
  await settle();

  stdin.emit("data", "\x1b[<0;1;1M\x1b[<32;6;1M");
  await settle();
  stdin.emit("data", "\x1b[<32;7;1M\x1b[<0;7;1m");
  await settle();

  expect(moves).toEqual(["start", "move"]);
  app.unmount();
});

test("useDraggable captures middle and right button drags", async () => {
  const cases = [
    { button: "middle", sequence: "\x1b[<1;1;1M\x1b[<33;6;2M\x1b[<1;6;2m" },
    { button: "right", sequence: "\x1b[<2;1;1M\x1b[<34;6;2M\x1b[<2;6;2m" },
  ] as const;

  for (const item of cases) {
    const dragTarget = shallowRef<BoxInstance | null>(null);
    const moves: Array<[string, TuiMouseEvent["button"], number, number]> = [];
    const App = defineComponent(() => {
      useDraggable(dragTarget, {
        onStart: (_position, event) =>
          moves.push([event.type, event.button, event.screenX, event.screenY]),
        onMove: (_position, event) =>
          moves.push([event.type, event.button, event.screenX, event.screenY]),
        onEnd: (_position, event) =>
          moves.push([event.type, event.button, event.screenX, event.screenY]),
      });
      return () => (
        <Box width={4} height={2} ref={dragTarget}>
          <Text>drag</Text>
        </Box>
      );
    });
    const { app, stdin } = mountMouseApp(App);
    await settle();

    stdin.emit("data", item.sequence);
    await settle();

    expect(moves).toEqual([
      ["dragstart", item.button, 0, 0],
      ["drag", item.button, 5, 1],
      ["dragend", item.button, 5, 1],
    ]);
    app.unmount();
    await settle();
  }
});
