// String coercion that cannot replace an application error with a secondary
// failure from Symbol.toPrimitive, toString, or valueOf.
const safeString = (value: unknown): string => {
  try {
    return String(value);
  } catch {
    return "[unserializable value]";
  }
};

/** Return one stable message for any non-Error thrown value without throwing. */
export function messageForNonError(value: unknown): string {
  let message: unknown;
  try {
    message = (value as { message?: unknown })?.message;
  } catch {
    return safeString(value);
  }
  return typeof message === "string" ? message : safeString(value);
}

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

/** Recognize ordinary and cross-realm Errors without trusting the input object. */
export function isErrorInput(value: unknown): value is Error {
  try {
    return value instanceof Error || Object.prototype.toString.call(value) === "[object Error]";
  } catch {
    return false;
  }
}
