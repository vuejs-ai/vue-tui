import type { Writable } from "node:stream";
import isInCi from "is-in-ci";

export const bsu = "\x1b[?2026h";
export const esu = "\x1b[?2026l";

export function shouldSynchronize(stream: Writable, interactive?: boolean): boolean {
  return (
    "isTTY" in stream && (stream as Writable & { isTTY: boolean }).isTTY && (interactive ?? !isInCi)
  );
}
