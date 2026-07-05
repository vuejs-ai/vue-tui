import { defineComponent, nextTick, shallowRef } from "vue";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  Box,
  Text,
  createApp,
  useDraggable,
  type MouseTarget,
  type TuiMouseEvent,
  type TuiWheelEvent,
} from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

const ENABLE_SGR_DRAG_MOUSE = "\x1b[?1002h\x1b[?1006h";
const DISABLE_SGR_MOUSE = "\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l";
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

function mountMouseApp(component: ReturnType<typeof defineComponent>, fullscreen = true) {
  const app = createApp(component);
  const stdout = makeFakeWritable({ columns: 20, rows: 8 });
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);
  app.mount({
    stdout,
    stderr,
    stdin,
    debug: true,
    exitOnCtrlC: false,
    rawMode: "auto",
    fullscreen,
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
  expect(writes.join("")).toContain(DISABLE_SGR_MOUSE);
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
  expect(warn.mock.calls[0]![0]).toContain("app.mount({ fullscreen: true })");
  expect(warn.mock.calls[0]![0]).toContain("useMouseInput()");
  expect(writes.join("")).not.toContain(ENABLE_SGR_DRAG_MOUSE);

  warn.mockRestore();
  app.unmount();
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

test("MouseTarget rect is cleared when a mounted node stops painting", async () => {
  const target = shallowRef<MouseTarget | null>(null);
  const hidden = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box ref={target} width={4} height={2} display={hidden.value ? "none" : "flex"}>
      <Text>box</Text>
    </Box>
  ));
  const { app } = mountMouseApp(App);
  await settle();

  expect(target.value?.rect).toEqual({ x: 0, y: 0, width: 4, height: 2 });

  hidden.value = true;
  await settle();

  expect(target.value?.rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  app.unmount();
});

test("useDraggable captures pointer movement until release", async () => {
  const dragTarget = shallowRef<import("@vue-tui/runtime").MouseTarget | null>(null);
  const moves: Array<[string, number, number, number, number]> = [];
  const App = defineComponent(() => {
    useDraggable(dragTarget, {
      onStart: (event) =>
        moves.push([event.type, event.screenX, event.screenY, event.movementX, event.movementY]),
      onMove: (event) =>
        moves.push([event.type, event.screenX, event.screenY, event.movementX, event.movementY]),
      onEnd: (event) =>
        moves.push([event.type, event.screenX, event.screenY, event.movementX, event.movementY]),
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

  expect(moves).toEqual([
    ["dragstart", 0, 0, 0, 0],
    ["drag", 7, 3, 7, 3],
    ["dragend", 7, 3, 0, 0],
  ]);
  app.unmount();
});
