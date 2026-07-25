import type { Writable } from "node:stream";
import ansiEscapes from "ansi-escapes";
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
    },
    done() {
      if (showCursorOption || !hidden) return;
      showCursor(stream, write);
      hidden = false;
    },
    reset(next = hidden) {
      if (hidden === next) return;
      hidden = next;
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

const create = (
  stream: Writable,
  {
    showCursor: showCursorOption = false,
    write,
  }: { showCursor?: boolean; write?: LogUpdateWrite } = {},
): LogUpdate => createStandard(stream, { showCursor: showCursorOption, write });

export default { create };
