import { type MaybeRef, type MaybeRefOrGetter } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { resolveHandlerSource } from "./handler-source.ts";

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
  const callHandler = resolveHandlerSource<KeyInputEvent>("useKeyInput()", handler);

  useInput((event) => {
    if (event.type === "key") {
      callHandler(event);
    }
  }, options);
}
