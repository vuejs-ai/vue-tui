import type { Writable } from "node:stream";

export const bsu = "\x1b[?2026h";
export const esu = "\x1b[?2026l";

/** Synchronized output only applies to live TTY streams. */
export function shouldSynchronize(stream: Writable): boolean {
  return "isTTY" in stream && (stream as Writable & { isTTY: boolean }).isTTY;
}
