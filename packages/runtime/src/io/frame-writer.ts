import logUpdate, { type LogUpdate, type ResetOptions, type SyncOptions } from "./log-update.ts";
import type { CursorPosition } from "./cursor-helpers.ts";

export interface FrameWriter {
  write: (frame: string) => void;
  done: () => void;
  clear: () => void;
  /** Forget the previous physical frame without writing terminal bytes. */
  reset: (options?: ResetOptions) => void;
  /** Return bytes that move a declared caret back to the physical frame bottom. */
  getCursorReturnToBottom: () => string;
  sync: (frame: string, options?: SyncOptions) => void;
  setCursorPosition: (pos: CursorPosition | undefined) => void;
  isCursorHidden: () => boolean;
  isCursorDirty: () => boolean;
  willRender: (frame: string) => boolean;
}

export function createFrameWriter(
  stream: NodeJS.WriteStream,
  options: { incremental?: boolean },
): FrameWriter {
  // Sentinel: use a value that can never equal a real frame so the very first
  // write (even an empty string) is always emitted.
  let lastFrame: string | null = null;
  const log: LogUpdate = logUpdate.create(stream, { incremental: options.incremental });

  return {
    write(frame: string) {
      // Skip the frame-dedup early-return when the cursor is dirty: a
      // cursor-only move (output byte-identical, cursor position changed —
      // e.g. typing a space that the layout collapses) must still reach
      // log-update so it emits buildCursorOnlySequence. log-update's own
      // hasChanges() then decides whether to actually write. Mirrors Ink,
      // which has no FrameWriter dedup layer and lets log-update own this.
      if (frame === lastFrame && !log.isCursorDirty()) return;
      lastFrame = frame;
      log(frame);
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
    getCursorReturnToBottom() {
      return log.getCursorReturnToBottom();
    },
    sync(frame: string, options?: SyncOptions) {
      // Keep this writer's dedup baseline aligned with log-update's internal
      // previousOutput. Without this, a later write() of `frame` is skipped by
      // log-update (state synced) while a write() of the *pre-sync* lastFrame
      // passes this layer's dedup but is dropped by log-update — desyncing the
      // two dedup layers and dropping a legitimately-changed frame.
      // `options` (for example { cursor: false } after a fixed-viewport clear)
      // is forwarded so the
      // caller can suppress the cursor emit on this sync — see log-update.sync.
      lastFrame = frame;
      log.sync(frame, options);
    },
    setCursorPosition(pos) {
      log.setCursorPosition(pos);
    },
    isCursorHidden() {
      return log.isCursorHidden();
    },
    isCursorDirty() {
      return log.isCursorDirty();
    },
    willRender(frame: string) {
      return log.willRender(frame);
    },
  };
}
