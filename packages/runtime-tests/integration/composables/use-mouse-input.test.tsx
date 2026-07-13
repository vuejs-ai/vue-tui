import { defineComponent, nextTick, shallowRef, type ComponentPublicInstance } from "vue";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import { Box, Text, createApp, useInput, type TuiApp } from "@vue-tui/runtime";
import {
  useMouseDrag,
  useMouseEvent,
  type MouseEventHandler,
  type TuiMouseWheelEvent,
} from "@vue-tui/runtime/fullscreen";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

const ENABLE_SGR_MOUSE = "\x1b[?1000h\x1b[?1006h";
const ENABLE_SGR_DRAG_MOUSE = "\x1b[?1002h\x1b[?1006h";
const DISABLE_SGR_MOUSE = "\x1b[?1000l\x1b[?1006l";
const DISABLE_SGR_DRAG_MOUSE = "\x1b[?1002l\x1b[?1006l";
const DISABLE_SGR_HOVER_TRACKING = "\x1b[?1003l";
let previousTerm: string | undefined;

beforeEach(() => {
  previousTerm = process.env["TERM"];
  process.env["TERM"] = "xterm-256color";
});

afterEach(() => {
  if (previousTerm === undefined) delete process.env["TERM"];
  else process.env["TERM"] = previousTerm;
});

async function settle(app?: TuiApp) {
  await nextTick();
  await nextTick();
  if (app) await app.waitUntilRenderFlush();
  await Promise.resolve();
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function wheelDirection(event: TuiMouseWheelEvent): "up" | "down" | "left" | "right" {
  if (event.delta.y < 0) return "up";
  if (event.delta.y > 0) return "down";
  return event.delta.x < 0 ? "left" : "right";
}

test("a visible targeted wheel hook owns SGR mouse mode and receives normalized events", async () => {
  const events: TuiMouseWheelEvent[] = [];
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "wheel", (event) => {
      events.push(event);
      return "continue";
    });
    return () => (
      <Box ref={target} width={20} height={8} flexShrink={0}>
        <Text>listening</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 20, rows: 8 });
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stderr, stdin, maxFps: 0, mode: "fullscreen" });
  await settle(app);

  expect(writes.join("")).toContain(ENABLE_SGR_MOUSE);

  stdin.emit("data", "\x1b[<68;3;4M\x1b[<81;5;6M");
  await settle(app);

  expect(events).toEqual([
    {
      type: "wheel",
      delivery: "target",
      surface: { x: 2, y: 3 },
      local: { x: 2, y: 3 },
      delta: { x: 0, y: -1 },
      modifiers: { shift: true, alt: false, ctrl: false },
    },
    {
      type: "wheel",
      delivery: "target",
      surface: { x: 4, y: 5 },
      local: { x: 4, y: 5 },
      delta: { x: 0, y: 1 },
      modifiers: { shift: false, alt: false, ctrl: true },
    },
  ]);

  app.unmount();
  await settle();

  expect(writes.join("")).toContain(DISABLE_SGR_MOUSE);
  expect(writes.join("")).not.toContain(DISABLE_SGR_DRAG_MOUSE);
  expect(writes.join("")).not.toContain(DISABLE_SGR_HOVER_TRACKING);
});

test("useMouseEvent reads the current handler ref at delivery time", async () => {
  const first: TuiMouseWheelEvent[] = [];
  const second: TuiMouseWheelEvent[] = [];
  const currentHandler = shallowRef<MouseEventHandler<"wheel">>((event) => {
    first.push(event);
    return "continue";
  });
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "wheel", currentHandler);
    return () => (
      <Box ref={target} width={4} height={4} flexShrink={0}>
        <Text>listening</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 10, rows: 6 });
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  app.mount({ stdout, stderr, stdin, maxFps: 0, mode: "fullscreen" });
  await settle(app);

  stdin.emit("data", "\x1b[<64;1;1M");
  await settle(app);

  currentHandler.value = (event) => {
    second.push(event);
    return "continue";
  };
  stdin.emit("data", "\x1b[<65;2;3M");
  await settle(app);

  expect(first.map(wheelDirection)).toEqual(["up"]);
  expect(second.map(wheelDirection)).toEqual(["down"]);
  app.unmount();
});

test("SGR mouse mode remains enabled until the last visible registration is removed", async () => {
  const showA = shallowRef(true);
  const showB = shallowRef(true);

  const A = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "wheel", () => "continue");
    return () => <Text ref={target}>a</Text>;
  });
  const B = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "wheel", () => "continue");
    return () => <Text ref={target}>b</Text>;
  });
  const App = defineComponent(() => {
    return () => (
      <Box>
        {showA.value ? <A /> : null}
        {showB.value ? <B /> : null}
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 20, rows: 4 });
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stderr, stdin, maxFps: 0, mode: "fullscreen" });
  await settle(app);

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(0);

  showA.value = false;
  await settle(app);

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(0);

  showB.value = false;
  await settle(app);

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_DRAG_MOUSE)).toBe(0);
  expect(writes.join("")).not.toContain(DISABLE_SGR_HOVER_TRACKING);

  app.unmount();
});

test("an acquired SGR mouse mode is released even if TERM changes before deactivation", async () => {
  const active = shallowRef(true);
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "wheel", () => "continue", { isActive: active });
    return () => <Text ref={target}>listening</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stderr, stdin, maxFps: 0, mode: "fullscreen" });
  await settle(app);

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(0);

  process.env["TERM"] = "dumb";
  active.value = false;
  await settle(app);

  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_DRAG_MOUSE)).toBe(0);
  expect(writes.join("")).not.toContain(DISABLE_SGR_HOVER_TRACKING);
  app.unmount();
});

test("committed targeted demand upgrades and downgrades the exact SGR reporting level", async () => {
  const dragActive = shallowRef(false);

  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "click", () => "continue");
    useMouseDrag(target, () => {}, { isActive: dragActive });
    return () => (
      <Box ref={target} width={4} height={2} flexShrink={0}>
        <Text>target</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 20, rows: 4 });
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stderr, stdin, maxFps: 0, mode: "fullscreen" });
  await settle(app);

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), ENABLE_SGR_DRAG_MOUSE)).toBe(0);

  dragActive.value = true;
  await settle(app);

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), ENABLE_SGR_DRAG_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(1);

  dragActive.value = false;
  await settle(app);

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(2);
  expect(countOccurrences(writes.join(""), ENABLE_SGR_DRAG_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_DRAG_MOUSE)).toBe(1);

  app.unmount();
  await settle();

  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(2);
  expect(writes.join("")).not.toContain(DISABLE_SGR_HOVER_TRACKING);
});

test("unsupported SGR mouse facts remain private from keyboard input", async () => {
  const wheelEvents: TuiMouseWheelEvent[] = [];
  const keyboardEvents: string[] = [];
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "wheel", (event) => {
      wheelEvents.push(event);
      return "continue";
    });
    useInput((event) => {
      keyboardEvents.push(event.sequence);
      return "continue";
    });
    return () => (
      <Box ref={target} width={20} height={6} flexShrink={0}>
        <Text>listening</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 20, rows: 6 });
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  app.mount({ stdout, stderr, stdin, maxFps: 0, mode: "fullscreen" });
  await settle(app);

  stdin.emit("data", "\x1b[<0;10;5M\x1b[<0;10;5m\x1b[<64;10;5M");
  await settle(app);

  expect(wheelEvents.map(wheelDirection)).toEqual(["up"]);
  expect(keyboardEvents).toEqual([]);

  app.unmount();
});

test("bare CSI-like text is still delivered to keyboard input", async () => {
  const wheelEvents: TuiMouseWheelEvent[] = [];
  const keyboardEvents: string[] = [];
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "wheel", (event) => {
      wheelEvents.push(event);
      return "continue";
    });
    useInput((event) => {
      keyboardEvents.push(event.sequence);
      return "continue";
    });
    return () => <Text ref={target}>listening</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  app.mount({ stdout, stderr, stdin, maxFps: 0, mode: "fullscreen" });
  await settle(app);

  stdin.emit("data", "[<64;10;5M");
  await settle(app);

  expect(wheelEvents).toEqual([]);
  expect(keyboardEvents).toEqual(["[<64;10;5M"]);

  app.unmount();
});
