import { describe, test, expect } from "vite-plus/test";
import {
  cursorPositionChanged,
  buildCursorSuffix,
  buildReturnToBottom,
  buildReturnToBottomPrefix,
  buildCursorOnlySequence,
  showCursorEscape,
  hideCursorEscape,
} from "./cursor-helpers.ts";

describe("cursor-helpers", () => {
  test("cursorPositionChanged - both undefined returns false", () => {
    expect(cursorPositionChanged(undefined, undefined)).toBe(false);
  });

  test("cursorPositionChanged - same position returns false", () => {
    expect(cursorPositionChanged({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(false);
  });

  test("cursorPositionChanged - different x returns true", () => {
    expect(cursorPositionChanged({ x: 1, y: 2 }, { x: 3, y: 2 })).toBe(true);
  });

  test("cursorPositionChanged - different y returns true", () => {
    expect(cursorPositionChanged({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(true);
  });

  test("cursorPositionChanged - undefined vs defined returns true", () => {
    expect(cursorPositionChanged(undefined, { x: 0, y: 0 })).toBe(true);
    expect(cursorPositionChanged({ x: 0, y: 0 }, undefined)).toBe(true);
  });

  test("buildCursorSuffix returns empty for undefined position", () => {
    expect(buildCursorSuffix(5, undefined)).toBe("");
  });

  test("buildCursorSuffix moves cursor up and to position", () => {
    const result = buildCursorSuffix(5, { x: 3, y: 2 });
    // Should move up 3 lines (5 - 2), move to column 3, and show cursor
    expect(result).toContain("\x1b[3A"); // cursorUp(3)
    expect(result).toContain("\x1b[4G"); // cursorTo(3) — 1-indexed column
    expect(result).toContain("\x1b[?25h"); // show cursor
  });

  test("buildCursorSuffix omits cursorUp when already on target line", () => {
    const result = buildCursorSuffix(3, { x: 0, y: 3 });
    expect(result).not.toContain("A"); // no cursorUp
    expect(result).toContain("\x1b[?25h"); // still shows cursor
  });

  test("buildCursorSuffix - cursor at first line of single-line output", () => {
    const result = buildCursorSuffix(1, { x: 4, y: 0 });
    // moveUp = 1 - 0 = 1
    expect(result).toContain("\x1b[1A"); // cursorUp(1)
    expect(result).toContain("\x1b[5G"); // cursorTo(4) — 1-indexed column
    expect(result).toContain("\x1b[?25h"); // show cursor
  });

  test("buildReturnToBottom returns empty for undefined position", () => {
    expect(buildReturnToBottom(5, undefined)).toBe("");
  });

  test("buildReturnToBottom moves cursor down and to column 0", () => {
    const result = buildReturnToBottom(5, { x: 3, y: 2 });
    // down = 5 - 1 - 2 = 2
    expect(result).toContain("\x1b[2B"); // cursorDown(2)
    expect(result).toContain("\x1b[1G"); // cursorTo(0) — 1-indexed column 1
  });

  test("buildReturnToBottom - no cursorDown when cursor already at bottom", () => {
    const result = buildReturnToBottom(4, { x: 0, y: 3 });
    // down = 4 - 1 - 3 = 0, so no cursorDown
    expect(result).not.toContain("B"); // no cursorDown
    expect(result).toContain("\x1b[1G"); // cursorTo(0)
  });

  test("buildReturnToBottomPrefix returns empty when cursor was not shown", () => {
    expect(buildReturnToBottomPrefix(false, 5, { x: 0, y: 0 })).toBe("");
  });

  test("buildReturnToBottomPrefix hides cursor and returns to bottom", () => {
    const result = buildReturnToBottomPrefix(true, 5, { x: 0, y: 2 });
    expect(result).toContain(hideCursorEscape);
    expect(result).toContain("\x1b[2B"); // cursorDown(2): 5-1-2
  });

  test("buildReturnToBottomPrefix - with undefined previousCursorPosition still hides cursor", () => {
    const result = buildReturnToBottomPrefix(true, 4, undefined);
    expect(result).toBe(hideCursorEscape + buildReturnToBottom(4, undefined));
  });

  test("buildCursorOnlySequence combines hide + return + reposition", () => {
    const result = buildCursorOnlySequence({
      cursorWasShown: true,
      previousLineCount: 5,
      previousCursorPosition: { x: 0, y: 2 },
      visibleLineCount: 5,
      cursorPosition: { x: 3, y: 1 },
    });
    expect(result).toContain(hideCursorEscape);
    expect(result).toContain(showCursorEscape);
    // Should contain return-to-bottom (down 2) and cursor suffix (up 4)
    expect(result).toContain("\x1b[2B"); // cursorDown(2)
    expect(result).toContain("\x1b[4A"); // cursorUp(4): 5-1
  });

  test("buildCursorOnlySequence skips hide when cursor was not shown", () => {
    const result = buildCursorOnlySequence({
      cursorWasShown: false,
      previousLineCount: 3,
      previousCursorPosition: undefined,
      visibleLineCount: 3,
      cursorPosition: { x: 0, y: 0 },
    });
    expect(result).not.toContain(hideCursorEscape);
    expect(result).toContain(showCursorEscape);
  });
});
