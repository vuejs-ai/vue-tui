import logUpdate, { type LogUpdate, type LogUpdateWrite, type ResetOptions } from "./log-update.ts";
import type { TerminalBackend, TerminalOutput } from "../terminal/backend.ts";

export interface FrameWriter {
  write: (frame: string) => void;
  done: () => void;
  clear: () => void;
  /** Forget the current physical region without writing terminal bytes. */
  reset: (options?: ResetOptions) => void;
  isCursorHidden: () => boolean;
  /** Restore bookkeeping after a captured transaction fails before full handoff. */
  createRollback: () => () => void;
}

export function createFrameWriter(
  terminal: TerminalBackend,
  options: { output?: TerminalOutput; write?: LogUpdateWrite } = {},
): FrameWriter {
  const log: LogUpdate = logUpdate.create(terminal, {
    output: options.output,
    write: options.write,
  });

  return {
    write(frame: string) {
      log(frame);
    },
    done() {
      log.done();
    },
    clear() {
      log.clear();
    },
    reset(resetOptions?: ResetOptions) {
      log.reset(resetOptions);
    },
    isCursorHidden() {
      return log.isCursorHidden();
    },
    createRollback() {
      const rollbackLog = log.createRollback();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        rollbackLog();
      };
    },
  };
}
