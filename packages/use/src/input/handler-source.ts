import { isRef, unref, type MaybeRef } from "vue";

/**
 * Resolve a `MaybeRef` handler into one listener that reads a ref per event.
 *
 * `apiName` brands the diagnostic, so a misuse reports the entry the caller
 * used rather than the Runtime composable it delegates to.
 */
export function resolveHandlerSource<Event>(
  apiName: string,
  handler: MaybeRef<(event: Event) => void>,
): (event: Event) => void {
  if (typeof handler === "function") return handler;
  if (!isRef(handler)) {
    throw new TypeError(`${apiName} handler must be a function`);
  }

  return (event: Event) => {
    const currentHandler: unknown = unref(handler);

    if (typeof currentHandler !== "function") {
      throw new TypeError(`${apiName} handler must be a function`);
    }

    (currentHandler as (event: Event) => void)(event);
  };
}
