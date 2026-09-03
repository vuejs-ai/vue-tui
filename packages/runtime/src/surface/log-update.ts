import ansiEscapes from "ansi-escapes";
import type { TerminalBackend, TerminalOutput } from "../terminal/backend.ts";
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
  isCursorHidden: () => boolean;
  /** Restore bookkeeping when a captured transaction was not handed off. */
  createRollback: () => () => void;
  (str: string): boolean;
};

const defaultWrite =
  (terminal: TerminalBackend, output: TerminalOutput): LogUpdateWrite =>
  (data) =>
    terminal.write(output, data);

const canWriteToOutput = (terminal: TerminalBackend, output: TerminalOutput): boolean =>
  terminal.capabilities[output].canWrite;

const hideCursor = (
  terminal: TerminalBackend,
  output: TerminalOutput,
  write: LogUpdateWrite,
): void => {
  if (terminal.capabilities[output].isTTY && canWriteToOutput(terminal, output)) {
    write(hideCursorEscape);
  }
};

const showCursor = (
  terminal: TerminalBackend,
  output: TerminalOutput,
  write: LogUpdateWrite,
): void => {
  if (terminal.capabilities[output].isTTY && canWriteToOutput(terminal, output)) {
    write(showCursorEscape);
  }
};

function createCursorOwnership(
  terminal: TerminalBackend,
  output: TerminalOutput,
  write: LogUpdateWrite,
  showCursorOption: boolean,
) {
  let hidden = false;
  return {
    hideForRender() {
      if (showCursorOption || hidden) return;
      hideCursor(terminal, output, write);
      hidden = terminal.capabilities[output].isTTY && canWriteToOutput(terminal, output);
    },
    done() {
      if (showCursorOption || !hidden) return;
      showCursor(terminal, output, write);
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
  terminal: TerminalBackend,
  output: TerminalOutput,
  {
    showCursor: showCursorOption = false,
    write = defaultWrite(terminal, output),
  }: { showCursor?: boolean; write?: LogUpdateWrite } = {},
): LogUpdate => {
  let previousLineCount = 0;
  const cursor = createCursorOwnership(terminal, output, write, showCursorOption);

  const render = (str: string) => {
    cursor.hideForRender();
    const lines = str.split("\n");
    write(ansiEscapes.eraseLines(previousLineCount) + str);
    previousLineCount = lines.length;
    return true;
  };

  render.clear = () => {
    write(ansiEscapes.eraseLines(previousLineCount));
    previousLineCount = 0;
  };

  render.done = () => {
    previousLineCount = 0;
    cursor.done();
  };

  render.reset = (options?: ResetOptions) => {
    previousLineCount = 0;
    cursor.reset(options?.cursorHidden);
  };

  render.isCursorHidden = cursor.isHidden;
  render.createRollback = () => {
    const snapshot = {
      previousLineCount,
      cursorHidden: cursor.isHidden(),
    };
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      previousLineCount = snapshot.previousLineCount;
      cursor.reset(snapshot.cursorHidden);
    };
  };

  return render;
};

const create = (
  terminal: TerminalBackend,
  {
    output = "stdout",
    showCursor: showCursorOption = false,
    write,
  }: { output?: TerminalOutput; showCursor?: boolean; write?: LogUpdateWrite } = {},
): LogUpdate => createStandard(terminal, output, { showCursor: showCursorOption, write });

export default { create };
