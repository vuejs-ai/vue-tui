import type { TerminalBackend } from "./backend.ts";

/** Synchronized output only applies to live TTY backends. */
export function shouldSynchronize(terminal: TerminalBackend): boolean {
  return terminal.capabilities.stdout.isTTY;
}
