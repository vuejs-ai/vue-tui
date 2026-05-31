import { test as it, expect } from "vite-plus/test";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import { run } from "./helpers/run.ts";

it("console.log doesn't corrupt output", async () => {
  const output = await run("console");
  expect(output).toContain("First log");
  expect(output).toContain("Second log");
});

// Port of Ink render.tsx:797-812 ("intercept console methods and display result
// above output"): a console.log emitted WHILE a frame is on screen is hoisted
// ABOVE the frame (the frame is erased, the log printed, the frame re-rendered).
// Splitting the raw bytes on eraseLines(2) — the exact erase the patched console
// writes to lift the one-line "Hello World" frame — isolates the pre-frame text
// ("First log", logged while mounted) from the post-frame text ("Second log",
// logged after unmount, below the final frame).
it("patched console.log appears above the on-screen frame", async () => {
  const output = await run("console");

  const frames = output.split(ansiEscapes.eraseLines(2)).map((line) => stripAnsi(line));

  // First segment is the initial frame; the second is the post-log re-render,
  // with "First log" hoisted above the re-rendered frame and "Second log" below.
  expect(frames).toEqual(["Hello World\r\n", "First log\r\nHello World\r\nSecond log\r\n"]);

  // Ordering is explicit: First log precedes the (re-rendered) frame, which
  // precedes Second log.
  const firstIdx = frames[1]!.indexOf("First log");
  const frameIdx = frames[1]!.indexOf("Hello World");
  const secondIdx = frames[1]!.indexOf("Second log");
  expect(firstIdx).toBeGreaterThanOrEqual(0);
  expect(firstIdx).toBeLessThan(frameIdx);
  expect(frameIdx).toBeLessThan(secondIdx);
});

it("useStdout.write in real terminal", async () => {
  const output = await run("use-stdout");
  expect(output).toContain("Hello from vue-tui to stdout");
  expect(output).toContain("exited");
});

// Port of Ink hooks.tsx:92-103 ("useStdout - write to stdout"): an external
// useStdout().write while a frame is on screen is hoisted ABOVE the preserved
// frame. After stripping ANSI and splitting on \r\n, the inner lines (dropping
// the leading initial-frame line and the trailing empty segment) are EXACTLY
// the external write, the preserved frame, and the post-exit log — in order.
it("useStdout.write appears above the preserved frame (exact ordering)", async () => {
  const output = await run("use-stdout");

  const lines = stripAnsi(output).split("\r\n");
  expect(lines.slice(1, -1)).toEqual(["Hello from vue-tui to stdout", "Hello World", "exited"]);
});
