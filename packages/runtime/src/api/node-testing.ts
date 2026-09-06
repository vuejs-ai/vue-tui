import { createColorCapability, type ColorCapability } from "../frame/color-profile.ts";
import { createNodeTerminalBackend } from "../terminal/node/backend.ts";
import { getSharedInputIngress } from "../input/shared-input-ingress.ts";

/** Node-backed facts needed by Runtime's deterministic test-host bridge. */
export interface NodeTestHostMountFacts {
  readonly colorCapability: ColorCapability;
  readonly writeInput: (data: string | Uint8Array) => Promise<void>;
}

/** Resolve test-host coordination around the terminal device. */
export function createNodeTestHostMountFacts(
  options: Parameters<typeof createNodeTerminalBackend>[0],
): NodeTestHostMountFacts {
  const terminal = createNodeTerminalBackend({
    ...options,
    sizeProbe: () => ({ kind: "unavailable" }),
  });
  const ingress = getSharedInputIngress(terminal);
  return Object.freeze({
    colorCapability: createColorCapability(terminal.capabilities.stdout.isTTY ? 3 : 0),
    writeInput: (data: string | Uint8Array) =>
      ingress.writeForTest(data, (input) => terminal.stdinForUseStdin.emit("data", input)),
  });
}
