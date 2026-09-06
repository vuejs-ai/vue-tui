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
  // The enable is issued once, and the holder that left while another remains
  // issues nothing.
  expect(terminal.writes).toEqual([
    { output: "stdout", data: "\x1b[?1049h\x1b[H" },
    { output: "stdout", data: "one" },
    { output: "stderr", data: "two" },
  ]);

  second.release();
  second.release();
  // The restore is issued once, when the last holder leaves; the redundant
  // release writes nothing.
  expect(terminal.writes).toEqual([
    { output: "stdout", data: "\x1b[?1049h\x1b[H" },
    { output: "stdout", data: "one" },
    { output: "stderr", data: "two" },
    { output: "stdout", data: "\x1b[?1049l" },
  ]);
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
