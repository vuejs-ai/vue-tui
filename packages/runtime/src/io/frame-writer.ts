import logUpdate, { type LogUpdate, type LogUpdateWrite, type ResetOptions } from "./log-update.ts";

export interface FrameWriter {
  write: (frame: string) => void;
  done: () => void;
  clear: () => void;
  /** Forget the previous physical frame without writing terminal bytes. */
  reset: (options?: ResetOptions) => void;
  sync: (frame: string) => void;
  isCursorHidden: () => boolean;
  willRender: (frame: string) => boolean;
  /** Restore bookkeeping after a captured transaction fails before full handoff. */
  createRollback: () => () => void;
}

export function createFrameWriter(
  stream: NodeJS.WriteStream,
  options: { incremental?: boolean; write?: LogUpdateWrite },
): FrameWriter {
  // Sentinel: use a value that can never equal a real frame so the very first
  // write (even an empty string) is always emitted.
  let lastFrame: string | null = null;
  const log: LogUpdate = logUpdate.create(stream, {
    incremental: options.incremental,
    write: options.write,
  });

  return {
    write(frame: string) {
      if (frame === lastFrame) return;
      log(frame);
      // A throwing stream did not accept this frame. Keep the prior baseline so
      // an identical retry still reaches log-update.
      lastFrame = frame;
    },
    done() {
      log.done();
    },
    clear() {
      lastFrame = null;
      log.clear();
    },
    reset(resetOptions?: ResetOptions) {
      lastFrame = null;
      log.reset(resetOptions);
    },
    sync(frame: string) {
      // Keep this writer's dedup baseline aligned with log-update's internal
      // previousOutput. Without this, a later write() of `frame` is skipped by
      // log-update (state synced) while a write() of the *pre-sync* lastFrame
      // passes this layer's dedup but is dropped by log-update — desyncing the
      // two dedup layers and dropping a legitimately-changed frame.
      log.sync(frame);
      lastFrame = frame;
    },
    isCursorHidden() {
      return log.isCursorHidden();
    },
    willRender(frame: string) {
      return log.willRender(frame);
    },
    createRollback() {
      const previousLastFrame = lastFrame;
      const rollbackLog = log.createRollback();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        lastFrame = previousLastFrame;
        rollbackLog();
      };
    },
  };
}
