import process from "node:process";
import { onExit as onTermination } from "signal-exit";
import {
  processSuspensionHost,
  type SuspensionHooks,
  type SuspensionHost,
} from "./process-suspension.ts";

/** Node process-lifetime hooks attached by one terminal backend. */
export interface NodeProcessLifecycle {
  onExit(listener: () => void): () => void;
  onBeforeExit(listener: () => void): () => void;
  onTermination(listener: () => void): () => void;
  registerSuspension(hooks: SuspensionHooks): (() => void) | null;
}

export interface NodeProcessLifecycleOptions {
  /** Deterministic hosts replace only job-control process signals. */
  readonly suspensionHost?: SuspensionHost;
}

/** Create the process hooks used by one mounted Node terminal session. */
export function createNodeProcessLifecycle(
  options: NodeProcessLifecycleOptions = {},
): NodeProcessLifecycle {
  const suspensionHost = options.suspensionHost ?? processSuspensionHost;
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
    registerSuspension(hooks: SuspensionHooks) {
      if (!suspensionHost.supported) return null;
      return suspensionHost.register(hooks);
    },
  });
}
