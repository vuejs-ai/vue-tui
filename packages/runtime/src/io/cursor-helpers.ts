import ansiEscapes from "ansi-escapes";

export type CursorPosition = {
  x: number;
  y: number;
};

const showCursorEscape = "[?25h";
const hideCursorEscape = "[?25l";

export { showCursorEscape, hideCursorEscape };

/**
 * Compare two cursor positions. Returns true if they differ.
 */
export const cursorPositionChanged = (
  a: CursorPosition | undefined,
  b: CursorPosition | undefined,
): boolean => a?.x !== b?.x || a?.y !== b?.y;

/**
 * Build escape sequence to move cursor from bottom of output to the target
 * position and show it.
 * Assumes cursor is at (col 0, line visibleLineCount) — i.e. just after the
 * last output line.
 *
 * The position is clamped to the visible region before emitting: under the
 * persistent-declaration re-emit (the caret is re-asserted every commit until
 * the declaration changes), a stale {x,y} left over from a larger frame —
 * after a resize, overflow, or content shrink — must not produce an
 * out-of-range move. `y` is clamped to `[0, visibleLineCount]` (so a y past the
 * shrunk content lands on the last visible line, never below it) and `x` to
 * `[0, width - 1]` when `width` is known (so a column past the terminal edge
 * lands at the rightmost cell, not beyond it). This is D5 in the cursor design
 * study; D1 (a stale-but-in-range coordinate that no longer tracks content) is
 * accepted residue, not corrected here.
 */
export const buildCursorSuffix = (
  visibleLineCount: number,
  cursorPosition: CursorPosition | undefined,
  width?: number,
): string => {
  if (!cursorPosition) {
    return "";
  }

  const clampedY = Math.max(0, Math.min(cursorPosition.y, visibleLineCount));
  const clampedX =
    width !== undefined && width > 0
      ? Math.max(0, Math.min(cursorPosition.x, width - 1))
      : Math.max(0, cursorPosition.x);

  const moveUp = visibleLineCount - clampedY;
  return (
    (moveUp > 0 ? ansiEscapes.cursorUp(moveUp) : "") +
    ansiEscapes.cursorTo(clampedX) +
    showCursorEscape
  );
};

/**
 * Build escape sequence to move cursor from previousCursorPosition back to the
 * bottom of output.
 * This must be done before eraseLines or any operation that assumes cursor is
 * at the bottom.
 */
export const buildReturnToBottom = (
  previousLineCount: number,
  previousCursorPosition: CursorPosition | undefined,
): string => {
  if (!previousCursorPosition) {
    return "";
  }

  // PreviousLineCount includes trailing newline, so visible lines =
  // previousLineCount - 1. Cursor is at previousCursorPosition.y, need to go
  // to line (previousLineCount - 1). Clamp y to the same [0, previousLineCount-1]
  // range buildCursorSuffix used when it last placed the caret: the suffix
  // already clamped the move (D5), so return-to-bottom must measure from the
  // CLAMPED row the caret actually sits at — measuring from a raw out-of-range y
  // (e.g. a negative y, or a y left over from a taller frame) would over-move.
  const bottomLine = previousLineCount - 1;
  const clampedY = Math.max(0, Math.min(previousCursorPosition.y, bottomLine));
  const down = bottomLine - clampedY;
  return (down > 0 ? ansiEscapes.cursorDown(down) : "") + ansiEscapes.cursorTo(0);
};

export type CursorOnlyInput = {
  cursorWasShown: boolean;
  previousLineCount: number;
  previousCursorPosition: CursorPosition | undefined;
  visibleLineCount: number;
  cursorPosition: CursorPosition | undefined;
  width?: number;
};

/**
 * Build the escape sequence for cursor-only updates (output unchanged, cursor
 * moved). Hides cursor if it was previously shown, returns to bottom, then
 * repositions.
 */
export const buildCursorOnlySequence = (input: CursorOnlyInput): string => {
  const hidePrefix = input.cursorWasShown ? hideCursorEscape : "";
  const returnToBottom = buildReturnToBottom(input.previousLineCount, input.previousCursorPosition);
  const cursorSuffix = buildCursorSuffix(input.visibleLineCount, input.cursorPosition, input.width);
  return hidePrefix + returnToBottom + cursorSuffix;
};

/**
 * Build the prefix that hides cursor and returns to bottom before erasing or
 * rewriting. Returns empty string if cursor was not shown.
 */
export const buildReturnToBottomPrefix = (
  cursorWasShown: boolean,
  previousLineCount: number,
  previousCursorPosition: CursorPosition | undefined,
): string => {
  if (!cursorWasShown) {
    return "";
  }

  return hideCursorEscape + buildReturnToBottom(previousLineCount, previousCursorPosition);
};
