/** Normalize a thrown value. Six copies of this had accumulated across the harness. */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function describeError(error: unknown): string {
  return asError(error).message;
}
