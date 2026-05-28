import logUpdate, { type LogUpdate } from "./log-update.ts";
import type { CursorPosition } from "./cursor-helpers.ts";

export interface FrameWriter {
  write: (frame: string) => void;
  done: () => void;
  clear: () => void;
  sync: (frame: string) => void;
  setCursorPosition: (pos: CursorPosition | undefined) => void;
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
      if (frame === lastFrame) return;
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
    sync(frame: string) {
      // Keep this writer's dedup baseline aligned with log-update's internal
      // previousOutput. Without this, a later write() of `frame` is skipped by
      // log-update (state synced) while a write() of the *pre-sync* lastFrame
      // passes this layer's dedup but is dropped by log-update — desyncing the
      // two dedup layers and dropping a legitimately-changed frame.
      lastFrame = frame;
      if (log) log.sync(frame);
    },
    setCursorPosition(pos) {
      if (log) log.setCursorPosition(pos);
    },
    willRender(frame: string) {
      return log ? log.willRender(frame) : true;
    },
  };
}
