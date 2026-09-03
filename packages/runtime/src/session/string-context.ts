import { createInputDispatcher } from "../input/input-subscriptions.ts";
import { createInertReadable } from "../terminal/node/inert-readable.ts";
import type { AppContext, StdinContext } from "../vue/context.ts";

/** Inert contexts for the synchronous string-rendering host. */
export interface NodeStringContexts {
  readonly appContext: AppContext;
  readonly stdinContext: StdinContext;
  dispose(): void;
}

/** Construct the no-op contexts consumed by renderToString(). */
export function createNodeStringContexts(): NodeStringContexts {
  const stdin = createInertReadable();
  const appContext: AppContext = {
    exit: () => {},
    writeToStdout: () => ({ status: "accepted", writable: true }),
    writeToStderr: () => ({ status: "accepted", writable: true }),
  };
  const stdinContext: StdinContext = {
    stdin,
    isRawModeSupported: false,
    inputSubscriptions: createInputDispatcher(),
    acquirePublicRawMode: () => () => {},
  };

  return {
    appContext,
    stdinContext,
    dispose() {
      stdinContext.inputSubscriptions.clear();
      stdin.destroy();
    },
  };
}
