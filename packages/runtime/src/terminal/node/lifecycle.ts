import process from "node:process";
import { onExit as onTermination } from "signal-exit";

/** Node process-lifetime hooks kept separate from the terminal device boundary. */
export interface NodeProcessLifecycle {
  onExit(listener: () => void): () => void;
  onBeforeExit(listener: () => void): () => void;
  onTermination(listener: () => void): () => void;
}

/** Create the process hooks used by one mounted Node session. */
export function createNodeProcessLifecycle(): NodeProcessLifecycle {
  return Object.freeze({
    onExit(listener: () => void) {
      process.on("exit", listener);
      return () => process.off("exit", listener);
    },
    onBeforeExit(listener: () => void) {
      process.once("beforeExit", listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        process.off("beforeExit", listener);
      };
    },
    onTermination(listener: () => void) {
      return onTermination(listener, { alwaysLast: false });
    },
  });
}
