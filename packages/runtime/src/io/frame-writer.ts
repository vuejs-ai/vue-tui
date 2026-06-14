import logUpdate, { type LogUpdate, type SyncOptions } from "./log-update.ts";
import type { CursorPosition } from "./cursor-helpers.ts";

export interface FrameWriter {
  write: (frame: string) => void;
  done: () => void;
  clear: () => void;
  sync: (frame: string, options?: SyncOptions) => void;
  setCursorPosition: (pos: CursorPosition | undefined) => void;
  isCursorDirty: () => boolean;
  willRender: (frame: string) => boolean;
}

export function createFrameWriter(
  stream: NodeJS.WriteStream,
  options: { debug?: boolean; incremental?: boolean },
): FrameWriter {
  // Sentinel: use a value that can never equal a real frame so the very first
  // write (even an empty string) is always emitted.
  let lastFrame: string | null = null;
  const debug = options.debug ?? false;
  const log: LogUpdate | null = debug
    ? null
    : logUpdate.create(stream, { incremental: options.incremental });

  return {
    write(frame: string) {
      // Skip the frame-dedup early-return when the cursor is dirty: a
      // cursor-only move (output byte-identical, cursor position changed —
      // e.g. typing a space that the layout collapses) must still reach
      // log-update so it emits buildCursorOnlySequence. log-update's own
      // hasChanges() then decides whether to actually write. Mirrors Ink,
      // which has no FrameWriter dedup layer and lets log-update own this.
      if (frame === lastFrame && !(log && log.isCursorDirty())) return;
      lastFrame = frame;
      if (debug) {
        stream.write(frame + "\n");
      } else {
        log!(frame);
      }
    },
    done() {
      if (log) log.done();
    },
    clear() {
      lastFrame = null;
      if (log) log.clear();
    },
    sync(frame: string, options?: SyncOptions) {
      // Keep this writer's dedup baseline aligned with log-update's internal
      // previousOutput. Without this, a later write() of `frame` is skipped by
      // log-update (state synced) while a write() of the *pre-sync* lastFrame
      // passes this layer's dedup but is dropped by log-update — desyncing the
      // two dedup layers and dropping a legitimately-changed frame.
      // `options` (e.g. { cursor: false } from app.clear()) is forwarded so the
      // caller can suppress the cursor emit on this sync — see log-update.sync.
      lastFrame = frame;
      if (log) log.sync(frame, options);
    },
    setCursorPosition(pos) {
      if (log) log.setCursorPosition(pos);
    },
    isCursorDirty() {
      return log ? log.isCursorDirty() : false;
    },
    willRender(frame: string) {
      return log ? log.willRender(frame) : true;
    },
  };
}
