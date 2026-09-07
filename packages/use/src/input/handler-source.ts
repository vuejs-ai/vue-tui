import { isRef, unref, type MaybeRef } from "vue";

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
