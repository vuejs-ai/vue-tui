import { expect, test } from "vite-plus/test";
import { createTestTerminalBackend } from "../../src/terminal/test/backend.ts";

test("test backend records bytes, reports fixed facts, and issues a mode at its lease edges", () => {
  const terminal = createTestTerminalBackend({
    size: { columns: 120, rows: 40 },
    capabilities: { stdout: { isTTY: false } },
  });
  const first = terminal.acquire("alternate-screen");
  const second = terminal.acquire("alternate-screen");

  terminal.write("stdout", "one");
  terminal.writeSync("stderr", "two");
  first.release();

  expect(terminal.size).toEqual({ columns: 120, rows: 40 });
  expect(terminal.capabilities.stdout.isTTY).toBe(false);
  expect(terminal.writes).toEqual([
    { output: "stdout", data: "\x1b[?1049h\x1b[H" },
    { output: "stdout", data: "one" },
    { output: "stderr", data: "two" },
  ]);
  expect(terminal.isModeHeld("alternate-screen")).toBe(true);

  second.release();
  second.release();
  expect(terminal.isModeHeld("alternate-screen")).toBe(false);
  expect(terminal.writes.at(-1)).toEqual({ output: "stdout", data: "\x1b[?1049l" });
});

test("test backend exposes deterministic input and resize events", () => {
  const terminal = createTestTerminalBackend();
  const events: string[] = [];
  terminal.onData((data) => {
    if (typeof data !== "string") throw new Error("expected test string");
    events.push(`data:${data}`);
  });
  terminal.onResize(() => events.push("resize"));

  terminal.emitData("a");
  terminal.emitResize();

  expect(events).toEqual(["data:a", "resize"]);
});

test("test backend preserves explicit unknown dimensions", () => {
  const terminal = createTestTerminalBackend({ size: { columns: null, rows: null } });

  expect(terminal.size).toEqual({ columns: null, rows: null });
  expect(terminal.refreshSize()).toBe(terminal.size);
});
