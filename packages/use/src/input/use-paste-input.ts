import { isRef, type MaybeRef, type MaybeRefOrGetter } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";

type PasteInputEvent = Extract<TuiInputEvent, { readonly type: "paste" }>;

/**
 * Subscribe only to complete bracketed-paste payloads for the current app.
 *
 * - Text and key events are ignored.
 * - The original frozen paste event is preserved, including empty payloads and control characters.
 * - A handler ref is resolved only when a matching paste event arrives.
 *
 * @example Append pasted text to a value
 * ```tsx
 * import { shallowRef } from "vue";
 * import { usePasteInput } from "@vue-tui/use";
 *
 * const value = shallowRef("");
 *
 * usePasteInput((event) => {
 *   value.value += event.text;
 * });
 * ```
 */
export function usePasteInput(
  handler: MaybeRef<(event: PasteInputEvent) => void>,
  options?: { readonly isActive?: MaybeRefOrGetter<boolean> },
): void {
  if (typeof handler !== "function" && !isRef(handler)) {
    throw new TypeError("usePasteInput() handler must be a function");
  }

  const callHandler =
    typeof handler === "function"
      ? handler
      : (event: PasteInputEvent) => {
          const currentHandler: unknown = handler.value;

          if (typeof currentHandler !== "function") {
            throw new TypeError("usePasteInput() handler must be a function");
          }

          currentHandler(event);
        };

  useInput((event) => {
    if (event.type === "paste") {
      callHandler(event);
    }
  }, options);
}
