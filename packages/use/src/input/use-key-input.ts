import { isRef, type MaybeRef, type MaybeRefOrGetter } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";

type KeyInputEvent = Extract<TuiInputEvent, { readonly type: "key" }>;

/**
 * Subscribe only to key-only input for the current app.
 *
 * - Text and paste events are ignored, including text events with reliable `key` information.
 * - The original frozen key event is preserved.
 * - A handler ref is resolved only when a matching key event arrives.
 *
 * @example Track the latest non-text key
 * ```tsx
 * import { shallowRef } from "vue";
 * import { useKeyInput } from "@vue-tui/use";
 *
 * const lastKey = shallowRef<string>();
 *
 * useKeyInput((event) => {
 *   lastKey.value = event.key.name ?? event.key.character;
 * });
 * ```
 */
export function useKeyInput(
  handler: MaybeRef<(event: KeyInputEvent) => void>,
  options?: { readonly isActive?: MaybeRefOrGetter<boolean> },
): void {
  if (typeof handler !== "function" && !isRef(handler)) {
    throw new TypeError("useKeyInput() handler must be a function");
  }

  const callHandler =
    typeof handler === "function"
      ? handler
      : (event: KeyInputEvent) => {
          const currentHandler: unknown = handler.value;

          if (typeof currentHandler !== "function") {
            throw new TypeError("useKeyInput() handler must be a function");
          }

          currentHandler(event);
        };

  useInput((event) => {
    if (event.type === "key") {
      callHandler(event);
    }
  }, options);
}
