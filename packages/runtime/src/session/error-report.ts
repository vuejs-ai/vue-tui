import { messageForNonError } from "../vue/error-value.ts";

/** Produce a durable fatal report without trusting Error-like accessors. */
export function formatErrorForStderr(value: unknown): string {
  let stack: unknown;
  try {
    stack = (value as { stack?: unknown })?.stack;
  } catch {
    stack = undefined;
  }
  if (typeof stack === "string" && stack.trim() !== "") {
    return `${stack.trimEnd()}\n`;
  }
  return `Error: ${messageForNonError(value)}\n`;
}
