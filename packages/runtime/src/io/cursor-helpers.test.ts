import ansiEscapes from "ansi-escapes";
import { describe, expect, test } from "vite-plus/test";
import { hideCursorEscape, nextLineEscape, showCursorEscape } from "./cursor-helpers.ts";

describe("cursor helpers", () => {
  test("uses the exact DECTCEM byte sequences", () => {
    expect(showCursorEscape).toBe("\x1b[?25h");
    expect(hideCursorEscape).toBe("\x1b[?25l");
  });

  test("uses NEL rather than bottom-clamped CNL for an inline next line", () => {
    expect(nextLineEscape).toBe("\x1bE");
    expect(nextLineEscape).not.toBe(ansiEscapes.cursorNextLine);
  });
});
