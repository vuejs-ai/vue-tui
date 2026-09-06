import { test, expect } from "vite-plus/test";
import { bsu, esu, shouldSynchronize } from "../../../../packages/runtime/dist/internal.mjs";
import { createTestTerminalBackend } from "../../../../packages/runtime/src/terminal/test/backend.ts";

test("bsu is the expected synchronized update sequence", () => {
  expect(bsu).toBe("\x1b[?2026h");
});

test("esu is the expected synchronized update sequence", () => {
  expect(esu).toBe("\x1b[?2026l");
});

test("shouldSynchronize returns true for a TTY backend", () => {
  const terminal = createTestTerminalBackend();
  expect(shouldSynchronize(terminal)).toBe(true);
});

test("shouldSynchronize returns false for non-TTY output", () => {
  const terminal = createTestTerminalBackend({ capabilities: { stdout: { isTTY: false } } });
  expect(shouldSynchronize(terminal)).toBe(false);
});
