import ansiEscapes from "ansi-escapes";
import type { TerminalBackend, TerminalOutput } from "../terminal/backend.ts";

export interface FrameWriter {
  write: (frame: string) => void;
  done: () => void;
  clear: () => void;
  /** Forget the current physical region without writing terminal bytes. */
  reset: () => void;
  /** Restore bookkeeping after a captured transaction fails before full handoff. */
  createRollback: () => () => void;
}

export function createFrameWriter(
  terminal: TerminalBackend,
  options: { output?: TerminalOutput; write?: (data: string) => boolean } = {},
): FrameWriter {
  const output = options.output ?? "stdout";
  const write = options.write ?? ((data: string) => terminal.write(output, data));
  let previousLineCount = 0;
  const reset = () => {
    previousLineCount = 0;
  };

  return {
    write(frame: string) {
      const lines = frame.split("\n");
      write(ansiEscapes.eraseLines(previousLineCount) + frame);
      previousLineCount = lines.length;
    },
    done: reset,
    clear() {
      write(ansiEscapes.eraseLines(previousLineCount));
      reset();
    },
    reset,
    createRollback() {
      const snapshot = previousLineCount;
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        previousLineCount = snapshot;
      };
    },
  };
}
