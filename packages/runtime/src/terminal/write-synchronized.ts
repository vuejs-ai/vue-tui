import type { TerminalBackend } from "./backend.ts";

export const bsu = "\x1b[?2026h";
export const esu = "\x1b[?2026l";

/** Synchronized output only applies to live TTY backends. */
export function shouldSynchronize(terminal: TerminalBackend): boolean {
  return terminal.capabilities.stdout.isTTY;
}
