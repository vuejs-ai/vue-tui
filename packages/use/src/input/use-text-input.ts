import { type MaybeRef, type MaybeRefOrGetter } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { resolveHandlerSource } from "./handler-source.ts";

type TextInputEvent = Extract<TuiInputEvent, { readonly type: "text" }>;

/**
 * Subscribe only to insertion-ready text input for the current app.
 *
 * - Key-only and paste events are ignored.
 * - The original frozen text event is preserved, including optional reliable `key` information.
 * - A handler ref is resolved only when a matching text event arrives.
 *
 * @example Collect text and inspect enhanced key information
 * ```tsx
 * import { shallowRef } from "vue";
 * import { useTextInput } from "@vue-tui/use";
 *
 * const value = shallowRef("");
 * const lastInputUsedShift = shallowRef(false);
 *
 * useTextInput((event) => {
 *   value.value += event.text;
 *   lastInputUsedShift.value = event.key?.shift ?? false;
 * });
 * ```
 */
export function useTextInput(
  handler: MaybeRef<(event: TextInputEvent) => void>,
  options?: { readonly isActive?: MaybeRefOrGetter<boolean> },
): void {
  const callHandler = resolveHandlerSource<TextInputEvent>("useTextInput()", handler);

  useInput((event) => {
    if (event.type === "text") {
      callHandler(event);
    }
  }, options);
}
