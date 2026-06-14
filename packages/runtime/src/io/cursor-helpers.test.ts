import ansiEscapes from "ansi-escapes";
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

  // The escape constants must match their hardcoded literals exactly (Ink locks
  // these byte-for-byte in cursor-helpers.tsx).
  test("escape constants are the exact DECTCEM byte sequences", () => {
    expect(showCursorEscape).toBe("\x1b[?25h");
    expect(hideCursorEscape).toBe("\x1b[?25l");
  });

  test("buildCursorSuffix returns empty for undefined position", () => {
    expect(buildCursorSuffix(5, undefined)).toBe("");
  });

  test("buildCursorSuffix moves cursor up and to position", () => {
    // moveUp = 3 - 1 = 2 (Ink's exact case). Lock the FULL output, not substrings.
    const result = buildCursorSuffix(3, { x: 5, y: 1 });
    expect(result).toBe(ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(5) + showCursorEscape);
  });

  test("buildCursorSuffix omits cursorUp when already on target line", () => {
    // moveUp = 3 - 3 = 0, so no cursorUp — exact composition is cursorTo + show.
    const result = buildCursorSuffix(3, { x: 0, y: 3 });
    expect(result).toBe(ansiEscapes.cursorTo(0) + showCursorEscape);
  });

  test("buildCursorSuffix - cursor at first line of single-line output", () => {
    // moveUp = 1 - 0 = 1
    const result = buildCursorSuffix(1, { x: 4, y: 0 });
    expect(result).toBe(ansiEscapes.cursorUp(1) + ansiEscapes.cursorTo(4) + showCursorEscape);
  });

  test("buildReturnToBottom returns empty for undefined position", () => {
    expect(buildReturnToBottom(5, undefined)).toBe("");
  });

  test("buildReturnToBottom moves cursor down and to column 0", () => {
    // down = 4 - 1 - 0 = 3 (Ink's exact case). Lock the FULL output.
    const result = buildReturnToBottom(4, { x: 5, y: 0 });
    expect(result).toBe(ansiEscapes.cursorDown(3) + ansiEscapes.cursorTo(0));
  });

  test("buildReturnToBottom - no cursorDown when cursor already at bottom", () => {
    // down = 4 - 1 - 3 = 0, so no cursorDown — exact composition is just cursorTo.
    const result = buildReturnToBottom(4, { x: 0, y: 3 });
    expect(result).toBe(ansiEscapes.cursorTo(0));
  });

  test("buildReturnToBottomPrefix returns empty when cursor was not shown", () => {
    expect(buildReturnToBottomPrefix(false, 5, { x: 0, y: 0 })).toBe("");
  });

  test("buildReturnToBottomPrefix hides cursor and returns to bottom", () => {
    // Lock the FULL output: hide + buildReturnToBottom (Ink's exact composition).
    const result = buildReturnToBottomPrefix(true, 4, { x: 0, y: 0 });
    expect(result).toBe(hideCursorEscape + buildReturnToBottom(4, { x: 0, y: 0 }));
  });

  test("buildReturnToBottomPrefix - with undefined previousCursorPosition still hides cursor", () => {
    const result = buildReturnToBottomPrefix(true, 4, undefined);
    expect(result).toBe(hideCursorEscape + buildReturnToBottom(4, undefined));
  });

  test("buildCursorOnlySequence combines hide + return + reposition", () => {
    // Lock the FULL composition: hide prefix + buildReturnToBottom + buildCursorSuffix
    // (Ink's exact case, cursor-helpers.tsx).
    const result = buildCursorOnlySequence({
      cursorWasShown: true,
      previousLineCount: 2,
      previousCursorPosition: { x: 0, y: 0 },
      visibleLineCount: 1,
      cursorPosition: { x: 3, y: 0 },
    });
    const expected =
      hideCursorEscape +
      buildReturnToBottom(2, { x: 0, y: 0 }) +
      buildCursorSuffix(1, { x: 3, y: 0 });
    expect(result).toBe(expected);
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

  // Fullscreen frames are written WITHOUT a trailing newline (render.ts:962
  // `isFullscreen ? output : output + "\n"`), so the cursor rests on the LAST
  // visible row (visibleLineCount - 1), not one row below the content like the
  // trailing-newline case. buildCursorSuffix must move up from that real row, or
  // it overshoots by one — misplacing a declared caret and then making the next
  // frame's buildReturnToBottom undershoot the true bottom (stale-row corruption).
  test("buildCursorSuffix - no trailing newline moves up from the last visible row", () => {
    // hasTrailingNewline=false: cursor rests at row 2 (visibleLineCount-1), so
    // moveUp = 2 - 1 = 1 (NOT 3 - 1 = 2 as the trailing-newline case computes).
    const result = buildCursorSuffix(3, { x: 5, y: 1 }, undefined, false);
    expect(result).toBe(ansiEscapes.cursorUp(1) + ansiEscapes.cursorTo(5) + showCursorEscape);
  });

  test("buildCursorSuffix - no trailing newline, single-line frame needs no cursorUp", () => {
    // Single visible line, no trailing newline: cursor already on row 0, caret y=0,
    // moveUp = 0 - 0 = 0 → no cursorUp (the trailing-newline case would emit up(1)).
    const result = buildCursorSuffix(1, { x: 4, y: 0 }, undefined, false);
    expect(result).toBe(ansiEscapes.cursorTo(4) + showCursorEscape);
  });

  test("buildCursorSuffix - trailing-newline default is unchanged (no regression)", () => {
    // Omitting the flag (or passing true) keeps the original behavior exactly.
    expect(buildCursorSuffix(3, { x: 5, y: 1 })).toBe(
      buildCursorSuffix(3, { x: 5, y: 1 }, undefined, true),
    );
    expect(buildCursorSuffix(3, { x: 5, y: 1 })).toBe(
      ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(5) + showCursorEscape,
    );
  });

  test("buildCursorOnlySequence - no trailing newline threads the flag to the suffix", () => {
    const result = buildCursorOnlySequence({
      cursorWasShown: true,
      previousLineCount: 3,
      previousCursorPosition: { x: 0, y: 0 },
      visibleLineCount: 3,
      cursorPosition: { x: 3, y: 1 },
      hasTrailingNewline: false,
    });
    const expected =
      hideCursorEscape +
      buildReturnToBottom(3, { x: 0, y: 0 }) +
      buildCursorSuffix(3, { x: 3, y: 1 }, undefined, false);
    expect(result).toBe(expected);
  });
});
