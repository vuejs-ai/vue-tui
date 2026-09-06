import ansiEscapes from "ansi-escapes";
import type { TerminalBackend, TerminalOutput } from "../terminal/backend.ts";

export type LogUpdateWrite = (data: string) => boolean;

export type LogUpdate = {
  clear: () => void;
  done: () => void;
  /** Forget the current physical region without writing terminal bytes. */
  reset: () => void;
  /** Restore bookkeeping when a captured transaction was not handed off. */
  createRollback: () => () => void;
  (str: string): boolean;
};

const defaultWrite =
  (terminal: TerminalBackend, output: TerminalOutput): LogUpdateWrite =>
  (data) =>
    terminal.write(output, data);

const createStandard = (
  terminal: TerminalBackend,
  output: TerminalOutput,
  { write = defaultWrite(terminal, output) }: { write?: LogUpdateWrite } = {},
): LogUpdate => {
  let previousLineCount = 0;

  const render = (str: string) => {
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
  };

  render.reset = () => {
    previousLineCount = 0;
  };

  render.createRollback = () => {
    const snapshot = { previousLineCount };
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      previousLineCount = snapshot.previousLineCount;
    };
  };

  return render;
};

const create = (
  terminal: TerminalBackend,
  { output = "stdout", write }: { output?: TerminalOutput; write?: LogUpdateWrite } = {},
): LogUpdate => createStandard(terminal, output, { write });

export default { create };
