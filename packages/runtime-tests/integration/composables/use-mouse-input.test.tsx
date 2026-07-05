import { defineComponent, nextTick, shallowRef } from "vue";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import {
  Box,
  Text,
  createApp,
  useInput,
  useMouseInput,
  type MouseInputEvent,
} from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

const ENABLE_SGR_MOUSE = "\x1b[?1000h\x1b[?1006h";
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

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test("useMouseInput enables SGR mouse mode and emits wheel events", async () => {
  const events: MouseInputEvent[] = [];
  const App = defineComponent(() => {
    useMouseInput((event) => {
      events.push(event);
    });
    return () => <Text>listening</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stderr, stdin, debug: true, exitOnCtrlC: false, rawMode: "auto" });
  await settle();

  expect(writes.join("")).toContain(ENABLE_SGR_MOUSE);

  stdin.emit("data", "\x1b[<68;3;4M\x1b[<81;5;6M");
  await settle();

  expect(events).toEqual([
    { type: "wheel", direction: "up", x: 3, y: 4, shift: true, meta: false, ctrl: false },
    { type: "wheel", direction: "down", x: 5, y: 6, shift: false, meta: false, ctrl: true },
  ]);

  app.unmount();
  await settle();

  expect(writes.join("")).toContain(DISABLE_SGR_MOUSE);
});

test("useMouseInput accepts a handler ref", async () => {
  const first: MouseInputEvent[] = [];
  const second: MouseInputEvent[] = [];
  const currentHandler = shallowRef((event: MouseInputEvent) => first.push(event));
  const App = defineComponent(() => {
    useMouseInput(currentHandler);
    return () => <Text>listening</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  app.mount({ stdout, stderr, stdin, debug: true, exitOnCtrlC: false, rawMode: "auto" });
  await settle();

  stdin.emit("data", "\x1b[<64;1;1M");
  await settle();

  currentHandler.value = (event: MouseInputEvent) => second.push(event);
  stdin.emit("data", "\x1b[<65;2;3M");
  await settle();

  expect(first).toEqual([
    { type: "wheel", direction: "up", x: 1, y: 1, shift: false, meta: false, ctrl: false },
  ]);
  expect(second).toEqual([
    { type: "wheel", direction: "down", x: 2, y: 3, shift: false, meta: false, ctrl: false },
  ]);
  app.unmount();
});

test("useMouseInput keeps SGR mouse mode enabled until the last consumer releases it", async () => {
  const showA = shallowRef(true);
  const showB = shallowRef(true);

  const A = defineComponent(() => {
    useMouseInput(() => {});
    return () => <Text>a</Text>;
  });
  const B = defineComponent(() => {
    useMouseInput(() => {});
    return () => <Text>b</Text>;
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
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stderr, stdin, debug: true, exitOnCtrlC: false, rawMode: "auto" });
  await settle();

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(0);

  showA.value = false;
  await settle();

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(0);

  showB.value = false;
  await settle();

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(1);

  app.unmount();
});

test("useMouseInput respects isActive", async () => {
  const active = shallowRef(false);
  const events: MouseInputEvent[] = [];
  const App = defineComponent(() => {
    useMouseInput((event) => events.push(event), { isActive: active });
    return () => <Text>listening</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stderr, stdin, debug: true, exitOnCtrlC: false, rawMode: "auto" });
  await settle();

  expect(writes.join("")).not.toContain(ENABLE_SGR_MOUSE);

  stdin.emit("data", "\x1b[<64;1;1M");
  await settle();
  expect(events).toEqual([]);

  active.value = true;
  await settle();
  expect(writes.join("")).toContain(ENABLE_SGR_MOUSE);

  stdin.emit("data", "\x1b[<65;1;1M");
  await settle();
  expect(events).toEqual([
    { type: "wheel", direction: "down", x: 1, y: 1, shift: false, meta: false, ctrl: false },
  ]);

  active.value = false;
  await settle();
  expect(writes.join("")).toContain(DISABLE_SGR_MOUSE);

  app.unmount();
});

test("element mouse handlers upgrade useMouseInput to drag mode and downgrade on removal", async () => {
  const showTarget = shallowRef(false);

  const App = defineComponent(() => {
    useMouseInput(() => {});
    return () => (
      <Box>
        {showTarget.value ? <Box width={2} height={1} onClick={() => {}} /> : null}
        <Text>raw</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 20, rows: 4 });
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
    fullscreen: true,
  });
  await settle();

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), ENABLE_SGR_DRAG_MOUSE)).toBe(0);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(0);

  showTarget.value = true;
  await settle();

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), ENABLE_SGR_DRAG_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(1);

  showTarget.value = false;
  await settle();

  expect(countOccurrences(writes.join(""), ENABLE_SGR_MOUSE)).toBe(2);
  expect(countOccurrences(writes.join(""), ENABLE_SGR_DRAG_MOUSE)).toBe(1);
  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(2);

  app.unmount();
  await settle();

  expect(countOccurrences(writes.join(""), DISABLE_SGR_MOUSE)).toBe(3);
});

test("useMouseInput consumes unsupported SGR mouse events before keyboard input", async () => {
  const mouseEvents: MouseInputEvent[] = [];
  const keyboardEvents: string[] = [];
  const App = defineComponent(() => {
    useMouseInput((event) => mouseEvents.push(event));
    useInput((input) => keyboardEvents.push(input));
    return () => <Text>listening</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  app.mount({ stdout, stderr, stdin, debug: true, exitOnCtrlC: false, rawMode: "auto" });
  await settle();

  stdin.emit("data", "\x1b[<0;10;5M\x1b[<0;10;5m\x1b[<64;10;5M");
  await settle();

  expect(mouseEvents).toEqual([
    { type: "wheel", direction: "up", x: 10, y: 5, shift: false, meta: false, ctrl: false },
  ]);
  expect(keyboardEvents).toEqual([]);

  app.unmount();
});

test("useMouseInput does not consume bare CSI-like text", async () => {
  const mouseEvents: MouseInputEvent[] = [];
  const keyboardEvents: string[] = [];
  const App = defineComponent(() => {
    useMouseInput((event) => mouseEvents.push(event));
    useInput((input) => keyboardEvents.push(input));
    return () => <Text>listening</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  app.mount({ stdout, stderr, stdin, debug: true, exitOnCtrlC: false, rawMode: "auto" });
  await settle();

  stdin.emit("data", "[<64;10;5M");
  await settle();

  expect(mouseEvents).toEqual([]);
  expect(keyboardEvents).toEqual(["[<64;10;5M"]);

  app.unmount();
});
