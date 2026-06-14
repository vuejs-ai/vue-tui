import type { Writable } from "node:stream";
import ansiEscapes from "ansi-escapes";
import {
  type CursorPosition,
  cursorPositionChanged,
  buildCursorSuffix,
  buildCursorOnlySequence,
  buildReturnToBottomPrefix,
  hideCursorEscape,
  showCursorEscape,
} from "./cursor-helpers.ts";

export type { CursorPosition } from "./cursor-helpers.ts";

export type SyncOptions = {
  // When false, sync re-seats only the OUTPUT bookkeeping and emits NO cursor
  // escape (no reposition, no show, and — because clear() has already set
  // cursorWasShown=false — no hide either). Used by app.clear(): clear() erases
  // the lines WITHOUT redrawing them, so re-asserting the persistent caret would
  // float it on a blank screen. Defaults to true (the restoreLastOutput path,
  // which DOES redraw, still re-shows the caret). See render.ts mountedClear.
  cursor?: boolean;
};

export type LogUpdate = {
  clear: () => void;
  done: () => void;
  reset: () => void;
  sync: (str: string, options?: SyncOptions) => void;
  setCursorPosition: (position: CursorPosition | undefined) => void;
  isCursorDirty: () => boolean;
  willRender: (str: string) => boolean;
  (str: string): boolean;
};

// Count visible lines in a string, ignoring the trailing empty element
// that `split('\n')` produces when the string ends with '\n'.
const visibleLineCount = (lines: string[], str: string): number =>
  str.endsWith("\n") ? lines.length - 1 : lines.length;

// Cursor hide/show is a TTY-only concern. Ink routes every hide/show through
// `cli-cursor`, which short-circuits `if (!stream.isTTY) return`
// (cli-cursor/index.js:8-24), so a forced-interactive run on a piped/non-TTY
// stream emits no cursor escapes. `stream` is typed `Writable`, which has no
// `isTTY`, so we read it off the runtime object (WriteStream sets it).
const isTtyStream = (stream: Writable): boolean => Boolean((stream as { isTTY?: boolean }).isTTY);

// Terminal width for the D5 cursor-x clamp (see buildCursorSuffix). `stream` is
// typed `Writable`, which has no `columns`; the runtime WriteStream sets it.
// Returns undefined when unknown so the clamp falls back to the no-width path.
const streamWidth = (stream: Writable): number | undefined =>
  (stream as { columns?: number }).columns;

// The show-cursor restore at done() runs on the teardown path, where stdout may
// already be destroyed/ended. `isTTY` stays cached-truthy after destroy()/end(),
// so gating cursor writes on isTTY alone throws ERR_STREAM_DESTROYED on a
// teardown where the terminal is already gone. Mirror Ink's `canWriteToStdout =
// !destroyed && !writableEnded` guard (App.tsx:620-624, the cursor-show on
// unmount) so a TTY-gated cursor write is also skipped on a dead stream.
const canWriteToStream = (stream: Writable): boolean =>
  !stream.destroyed && !(stream as { writableEnded?: boolean }).writableEnded;

const hideCursor = (stream: Writable): void => {
  if (!isTtyStream(stream) || !canWriteToStream(stream)) {
    return;
  }
  stream.write(hideCursorEscape);
};

const showCursor = (stream: Writable): void => {
  if (!isTtyStream(stream) || !canWriteToStream(stream)) {
    return;
  }
  stream.write(showCursorEscape);
};

const createStandard = (
  stream: Writable,
  { showCursor: showCursorOption = false } = {},
): LogUpdate => {
  let previousLineCount = 0;
  let previousOutput = "";
  let hasHiddenCursor = false;
  let cursorPosition: CursorPosition | undefined;
  let cursorDirty = false;
  let previousCursorPosition: CursorPosition | undefined;
  let cursorWasShown = false;

  // Persistent-declaration: the active cursor is the LAST-declared position and
  // is re-emitted at the end of EVERY commit, so a focused input's caret stays
  // at its edit point across unrelated repaints (spinner/log/progress) in all
  // component topologies — matching real terminal apps (vim/readline/nano
  // re-place the caret each frame). It is NOT gated on cursorDirty: gating there
  // dropped the caret on any commit that did not re-declare, zombieing it to the
  // bottom-left corner (a deliberate divergence from Ink — see
  // .agents/docs/ink-divergences.md). A CLEARED declaration (setCursorPosition
  // undefined, e.g. useCursor's onScopeDispose on unmount) sets cursorPosition
  // to undefined, so the next re-emit places no caret — the clear is not
  // resurrected. cursorDirty still tracks "was re-declared this commit" purely
  // to gate the commit/dedup paths (render.ts outer gate + frame-writer skip).
  const getActiveCursor = () => cursorPosition;
  const hasChanges = (str: string, activeCursor: CursorPosition | undefined): boolean => {
    const cursorChanged = cursorPositionChanged(activeCursor, previousCursorPosition);
    return str !== previousOutput || cursorChanged;
  };

  const render = (str: string) => {
    if (!showCursorOption && !hasHiddenCursor) {
      hideCursor(stream);
      hasHiddenCursor = true;
    }

    const activeCursor = getActiveCursor();
    cursorDirty = false;
    const cursorChanged = cursorPositionChanged(activeCursor, previousCursorPosition);

    if (!hasChanges(str, activeCursor)) {
      return false;
    }

    const lines = str.split("\n");
    const visibleCount = visibleLineCount(lines, str);
    const hasTrailingNewline = str.endsWith("\n");
    const cursorSuffix = buildCursorSuffix(
      visibleCount,
      activeCursor,
      streamWidth(stream),
      hasTrailingNewline,
    );

    if (str === previousOutput && cursorChanged) {
      stream.write(
        buildCursorOnlySequence({
          cursorWasShown,
          previousLineCount,
          previousCursorPosition,
          visibleLineCount: visibleCount,
          cursorPosition: activeCursor,
          width: streamWidth(stream),
          hasTrailingNewline,
        }),
      );
    } else {
      previousOutput = str;
      const returnPrefix = buildReturnToBottomPrefix(
        cursorWasShown,
        previousLineCount,
        previousCursorPosition,
      );
      stream.write(returnPrefix + ansiEscapes.eraseLines(previousLineCount) + str + cursorSuffix);
      previousLineCount = lines.length;
    }

    previousCursorPosition = activeCursor ? { ...activeCursor } : undefined;
    cursorWasShown = activeCursor !== undefined;
    return true;
  };

  render.clear = () => {
    const prefix = buildReturnToBottomPrefix(
      cursorWasShown,
      previousLineCount,
      previousCursorPosition,
    );
    stream.write(prefix + ansiEscapes.eraseLines(previousLineCount));
    previousOutput = "";
    previousLineCount = 0;
    previousCursorPosition = undefined;
    cursorWasShown = false;
  };

  render.done = () => {
    previousOutput = "";
    previousLineCount = 0;
    previousCursorPosition = undefined;
    cursorWasShown = false;

    if (!showCursorOption) {
      showCursor(stream);
      hasHiddenCursor = false;
    }
  };

  render.reset = () => {
    previousOutput = "";
    previousLineCount = 0;
    previousCursorPosition = undefined;
    cursorWasShown = false;
  };

  render.sync = (str: string, options?: SyncOptions) => {
    // Persistent-declaration: sync the LAST-declared position (not cursorDirty-
    // gated), so the clearTerminal / restoreLastOutput sync re-seats the caret
    // at the declared point too.
    //
    // options.cursor === false suppresses the cursor emit for THIS sync (the
    // app.clear() path). clear() erased the lines WITHOUT redrawing them, so
    // re-asserting the persistent caret would float it on a blank screen — Ink
    // leaves it hidden (its clear()-time sync sees cursorDirty=false, so it
    // emits no caret either). We do NOT touch cursorPosition (the declaration
    // persists), so the NEXT real render re-shows the caret normally. Treating
    // the active cursor as undefined here also drives previousCursorPosition/
    // cursorWasShown to the true post-clear blank state.
    const activeCursor = options?.cursor === false ? undefined : getActiveCursor();
    cursorDirty = false;

    const lines = str.split("\n");
    previousOutput = str;
    previousLineCount = lines.length;

    // NOT isTTY-gated: Ink's sync() writes the hide directly (Ink
    // log-update.ts:149-151), NOT via cli-cursor, so it has no isTTY guard —
    // unlike render()/done()'s hide/show which DO route through cli-cursor.
    // After clear() cursorWasShown is already false, so the clear() path (which
    // passes cursor:false → activeCursor undefined) writes no hide here either.
    if (!activeCursor && cursorWasShown) {
      stream.write(hideCursorEscape);
    }

    if (activeCursor) {
      stream.write(
        buildCursorSuffix(
          visibleLineCount(lines, str),
          activeCursor,
          streamWidth(stream),
          str.endsWith("\n"),
        ),
      );
    }

    previousCursorPosition = activeCursor ? { ...activeCursor } : undefined;
    cursorWasShown = activeCursor !== undefined;
  };

  render.setCursorPosition = (position: CursorPosition | undefined) => {
    cursorPosition = position;
    cursorDirty = true;
  };

  render.isCursorDirty = () => cursorDirty;
  render.willRender = (str: string) => hasChanges(str, getActiveCursor());

  return render;
};

const createIncremental = (
  stream: Writable,
  { showCursor: showCursorOption = false } = {},
): LogUpdate => {
  let previousLines: string[] = [];
  let previousOutput = "";
  let hasHiddenCursor = false;
  let cursorPosition: CursorPosition | undefined;
  let cursorDirty = false;
  let previousCursorPosition: CursorPosition | undefined;
  let cursorWasShown = false;

  // Persistent-declaration (see createStandard for the full rationale): the
  // active cursor is the last-declared position, re-emitted at the end of every
  // commit so it survives unrelated repaints; a cleared declaration emits no
  // caret. cursorDirty only gates the commit/dedup paths now.
  const getActiveCursor = () => cursorPosition;
  const hasChanges = (str: string, activeCursor: CursorPosition | undefined): boolean => {
    const cursorChanged = cursorPositionChanged(activeCursor, previousCursorPosition);
    return str !== previousOutput || cursorChanged;
  };

  const render = (str: string) => {
    if (!showCursorOption && !hasHiddenCursor) {
      hideCursor(stream);
      hasHiddenCursor = true;
    }

    const activeCursor = getActiveCursor();
    cursorDirty = false;
    const cursorChanged = cursorPositionChanged(activeCursor, previousCursorPosition);

    if (!hasChanges(str, activeCursor)) {
      return false;
    }

    const nextLines = str.split("\n");
    const visibleCount = visibleLineCount(nextLines, str);
    const previousVisible = visibleLineCount(previousLines, previousOutput);

    if (str === previousOutput && cursorChanged) {
      stream.write(
        buildCursorOnlySequence({
          cursorWasShown,
          previousLineCount: previousLines.length,
          previousCursorPosition,
          visibleLineCount: visibleCount,
          cursorPosition: activeCursor,
          width: streamWidth(stream),
          hasTrailingNewline: str.endsWith("\n"),
        }),
      );
      previousCursorPosition = activeCursor ? { ...activeCursor } : undefined;
      cursorWasShown = activeCursor !== undefined;
      return true;
    }

    const returnPrefix = buildReturnToBottomPrefix(
      cursorWasShown,
      previousLines.length,
      previousCursorPosition,
    );

    if (str === "\n" || previousOutput.length === 0) {
      const cursorSuffix = buildCursorSuffix(
        visibleCount,
        activeCursor,
        streamWidth(stream),
        str.endsWith("\n"),
      );
      stream.write(
        returnPrefix + ansiEscapes.eraseLines(previousLines.length) + str + cursorSuffix,
      );
      cursorWasShown = activeCursor !== undefined;
      previousCursorPosition = activeCursor ? { ...activeCursor } : undefined;
      previousOutput = str;
      previousLines = nextLines;
      return true;
    }

    const hasTrailingNewline = str.endsWith("\n");

    // We aggregate all chunks for incremental rendering into a buffer,
    // and then write them to stdout at the end.
    const buffer: string[] = [];

    buffer.push(returnPrefix);

    // Clear extra lines if the current content's line count is lower than the previous.
    if (visibleCount < previousVisible) {
      const previousHadTrailingNewline = previousOutput.endsWith("\n");
      const extraSlot = previousHadTrailingNewline ? 1 : 0;
      buffer.push(
        ansiEscapes.eraseLines(previousVisible - visibleCount + extraSlot),
        ansiEscapes.cursorUp(visibleCount),
      );
    } else {
      buffer.push(ansiEscapes.cursorUp(previousLines.length - 1));
    }

    for (let i = 0; i < visibleCount; i++) {
      const isLastLine = i === visibleCount - 1;

      // We do not write lines if the contents are the same. This prevents flickering during renders.
      if (nextLines[i] === previousLines[i]) {
        // Don't move past the last line when there's no trailing newline,
        // otherwise the cursor overshoots the rendered block.
        if (!isLastLine || hasTrailingNewline) {
          buffer.push(ansiEscapes.cursorNextLine);
        }

        continue;
      }

      buffer.push(
        ansiEscapes.cursorTo(0) +
          nextLines[i]! +
          ansiEscapes.eraseEndLine +
          // Don't append newline after the last line when the input
          // has no trailing newline (fullscreen mode).
          (isLastLine && !hasTrailingNewline ? "" : "\n"),
      );
    }

    const cursorSuffix = buildCursorSuffix(
      visibleCount,
      activeCursor,
      streamWidth(stream),
      hasTrailingNewline,
    );
    buffer.push(cursorSuffix);

    stream.write(buffer.join(""));

    cursorWasShown = activeCursor !== undefined;
    previousCursorPosition = activeCursor ? { ...activeCursor } : undefined;
    previousOutput = str;
    previousLines = nextLines;
    return true;
  };

  render.clear = () => {
    const prefix = buildReturnToBottomPrefix(
      cursorWasShown,
      previousLines.length,
      previousCursorPosition,
    );
    stream.write(prefix + ansiEscapes.eraseLines(previousLines.length));
    previousOutput = "";
    previousLines = [];
    previousCursorPosition = undefined;
    cursorWasShown = false;
  };

  render.done = () => {
    previousOutput = "";
    previousLines = [];
    previousCursorPosition = undefined;
    cursorWasShown = false;

    if (!showCursorOption) {
      showCursor(stream);
      hasHiddenCursor = false;
    }
  };

  render.reset = () => {
    previousOutput = "";
    previousLines = [];
    previousCursorPosition = undefined;
    cursorWasShown = false;
  };

  render.sync = (str: string, options?: SyncOptions) => {
    // Persistent-declaration: sync the LAST-declared position (not cursorDirty-
    // gated), so the clearTerminal / restoreLastOutput sync re-seats the caret
    // at the declared point too.
    //
    // options.cursor === false suppresses the cursor emit for THIS sync (the
    // app.clear() path). clear() erased the lines WITHOUT redrawing them, so
    // re-asserting the persistent caret would float it on a blank screen — Ink
    // leaves it hidden (its clear()-time sync sees cursorDirty=false, so it
    // emits no caret either). We do NOT touch cursorPosition (the declaration
    // persists), so the NEXT real render re-shows the caret normally. Treating
    // the active cursor as undefined here also drives previousCursorPosition/
    // cursorWasShown to the true post-clear blank state.
    const activeCursor = options?.cursor === false ? undefined : getActiveCursor();
    cursorDirty = false;

    const lines = str.split("\n");
    previousOutput = str;
    previousLines = lines;

    // NOT isTTY-gated: Ink's sync() writes the hide directly (Ink
    // log-update.ts:149-151), NOT via cli-cursor, so it has no isTTY guard —
    // unlike render()/done()'s hide/show which DO route through cli-cursor.
    // After clear() cursorWasShown is already false, so the clear() path (which
    // passes cursor:false → activeCursor undefined) writes no hide here either.
    if (!activeCursor && cursorWasShown) {
      stream.write(hideCursorEscape);
    }

    if (activeCursor) {
      stream.write(
        buildCursorSuffix(
          visibleLineCount(lines, str),
          activeCursor,
          streamWidth(stream),
          str.endsWith("\n"),
        ),
      );
    }

    previousCursorPosition = activeCursor ? { ...activeCursor } : undefined;
    cursorWasShown = activeCursor !== undefined;
  };

  render.setCursorPosition = (position: CursorPosition | undefined) => {
    cursorPosition = position;
    cursorDirty = true;
  };

  render.isCursorDirty = () => cursorDirty;
  render.willRender = (str: string) => hasChanges(str, getActiveCursor());

  return render;
};

const create = (
  stream: Writable,
  { showCursor: showCursorOption = false, incremental = false } = {},
): LogUpdate => {
  if (incremental) {
    return createIncremental(stream, { showCursor: showCursorOption });
  }

  return createStandard(stream, { showCursor: showCursorOption });
};

const logUpdate = { create };
export default logUpdate;
