import type { Writable } from "node:stream";
import ansiEscapes from "ansi-escapes";
import { changeRuntimeResource } from "../resource-tracker.ts";
import { hideCursorEscape, showCursorEscape } from "./cursor-helpers.ts";

export type ResetOptions = {
  /** Override whether the writer believes it currently owns a hidden cursor. */
  cursorHidden?: boolean;
};

export type LogUpdateWrite = (data: string) => boolean;

export type LogUpdate = {
  clear: () => void;
  done: () => void;
  reset: (options?: ResetOptions) => void;
  sync: (str: string) => void;
  isCursorHidden: () => boolean;
  willRender: (str: string) => boolean;
  /** Restore bookkeeping when a captured transaction was not handed off. */
  createRollback: () => () => void;
  (str: string): boolean;
};

const visibleLineCount = (lines: string[], str: string): number =>
  str.endsWith("\n") ? lines.length - 1 : lines.length;

const isTtyStream = (stream: Writable): boolean => Boolean((stream as { isTTY?: boolean }).isTTY);

const canWriteToStream = (stream: Writable): boolean =>
  !stream.destroyed && !(stream as { writableEnded?: boolean }).writableEnded;

const defaultWrite =
  (stream: Writable): LogUpdateWrite =>
  (data) =>
    stream.write(data);

const hideCursor = (stream: Writable, write: LogUpdateWrite): void => {
  if (isTtyStream(stream) && canWriteToStream(stream)) write(hideCursorEscape);
};

const showCursor = (stream: Writable, write: LogUpdateWrite): void => {
  if (isTtyStream(stream) && canWriteToStream(stream)) write(showCursorEscape);
};

function createCursorOwnership(stream: Writable, write: LogUpdateWrite, showCursorOption: boolean) {
  let hidden = false;
  return {
    hideForRender() {
      if (showCursorOption || hidden) return;
      hideCursor(stream, write);
      hidden = isTtyStream(stream) && canWriteToStream(stream);
      if (hidden) changeRuntimeResource("cursorLeases", 1);
    },
    done() {
      if (showCursorOption || !hidden) return;
      showCursor(stream, write);
      hidden = false;
      changeRuntimeResource("cursorLeases", -1);
    },
    reset(next = hidden) {
      if (hidden === next) return;
      hidden = next;
      changeRuntimeResource("cursorLeases", next ? 1 : -1);
    },
    isHidden: () => hidden,
  };
}

const createStandard = (
  stream: Writable,
  {
    showCursor: showCursorOption = false,
    write = defaultWrite(stream),
  }: { showCursor?: boolean; write?: LogUpdateWrite } = {},
): LogUpdate => {
  let previousLineCount = 0;
  let previousOutput = "";
  const cursor = createCursorOwnership(stream, write, showCursorOption);

  const render = (str: string) => {
    cursor.hideForRender();
    if (str === previousOutput) return false;
    const lines = str.split("\n");
    write(ansiEscapes.eraseLines(previousLineCount) + str);
    previousOutput = str;
    previousLineCount = lines.length;
    return true;
  };

  render.clear = () => {
    write(ansiEscapes.eraseLines(previousLineCount));
    previousOutput = "";
    previousLineCount = 0;
  };

  render.done = () => {
    previousOutput = "";
    previousLineCount = 0;
    cursor.done();
  };

  render.reset = (options?: ResetOptions) => {
    previousOutput = "";
    previousLineCount = 0;
    cursor.reset(options?.cursorHidden);
  };

  render.sync = (str: string) => {
    previousOutput = str;
    previousLineCount = str.split("\n").length;
  };

  render.isCursorHidden = cursor.isHidden;
  render.willRender = (str: string) => str !== previousOutput;
  render.createRollback = () => {
    const snapshot = {
      previousLineCount,
      previousOutput,
      cursorHidden: cursor.isHidden(),
    };
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      previousLineCount = snapshot.previousLineCount;
      previousOutput = snapshot.previousOutput;
      cursor.reset(snapshot.cursorHidden);
    };
  };

  return render;
};

const createIncremental = (
  stream: Writable,
  {
    showCursor: showCursorOption = false,
    write = defaultWrite(stream),
  }: { showCursor?: boolean; write?: LogUpdateWrite } = {},
): LogUpdate => {
  let previousLines: string[] = [];
  let previousOutput = "";
  const cursor = createCursorOwnership(stream, write, showCursorOption);

  const render = (str: string) => {
    cursor.hideForRender();
    if (str === previousOutput) return false;

    const nextLines = str.split("\n");
    const visibleCount = visibleLineCount(nextLines, str);
    const previousVisible = visibleLineCount(previousLines, previousOutput);

    if (str === "\n" || previousOutput.length === 0) {
      write(ansiEscapes.eraseLines(previousLines.length) + str);
      previousOutput = str;
      previousLines = nextLines;
      return true;
    }

    const hasTrailingNewline = str.endsWith("\n");
    const buffer: string[] = [];

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

    for (let index = 0; index < visibleCount; index++) {
      const isLastLine = index === visibleCount - 1;
      if (nextLines[index] === previousLines[index]) {
        if (!isLastLine || hasTrailingNewline) buffer.push(ansiEscapes.cursorNextLine);
        continue;
      }
      buffer.push(
        ansiEscapes.cursorTo(0) +
          nextLines[index]! +
          ansiEscapes.eraseEndLine +
          (isLastLine && !hasTrailingNewline ? "" : "\n"),
      );
    }

    write(buffer.join(""));
    previousOutput = str;
    previousLines = nextLines;
    return true;
  };

  render.clear = () => {
    write(ansiEscapes.eraseLines(previousLines.length));
    previousOutput = "";
    previousLines = [];
  };

  render.done = () => {
    previousOutput = "";
    previousLines = [];
    cursor.done();
  };

  render.reset = (options?: ResetOptions) => {
    previousOutput = "";
    previousLines = [];
    cursor.reset(options?.cursorHidden);
  };

  render.sync = (str: string) => {
    previousOutput = str;
    previousLines = str.split("\n");
  };

  render.isCursorHidden = cursor.isHidden;
  render.willRender = (str: string) => str !== previousOutput;
  render.createRollback = () => {
    const snapshot = {
      previousLines: [...previousLines],
      previousOutput,
      cursorHidden: cursor.isHidden(),
    };
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      previousLines = snapshot.previousLines;
      previousOutput = snapshot.previousOutput;
      cursor.reset(snapshot.cursorHidden);
    };
  };

  return render;
};

const create = (
  stream: Writable,
  {
    showCursor: showCursorOption = false,
    incremental = false,
    write,
  }: { showCursor?: boolean; incremental?: boolean; write?: LogUpdateWrite } = {},
): LogUpdate =>
  incremental
    ? createIncremental(stream, { showCursor: showCursorOption, write })
    : createStandard(stream, { showCursor: showCursorOption, write });

export default { create };
