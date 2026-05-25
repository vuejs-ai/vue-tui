import { createLogUpdate } from "log-update";

export interface FrameWriter {
  write: (frame: string) => void;
  done: () => void;
  clear: () => void;
}

export function createFrameWriter(
  stream: NodeJS.WriteStream,
  options: { debug?: boolean },
): FrameWriter {
  // Sentinel: use a value that can never equal a real frame so the very first
  // write (even an empty string) is always emitted.
  let lastFrame: string | null = null;
  const debug = options.debug ?? false;
  const update = debug ? null : createLogUpdate(stream);

  return {
    write(frame: string) {
      if (frame === lastFrame) return;
      lastFrame = frame;
      if (debug) {
        stream.write(frame + "\n");
      } else {
        update!(frame);
      }
    },
    done() {
      if (update) update.done();
    },
    clear() {
      lastFrame = null;
      if (update) update.clear();
    },
  };
}
