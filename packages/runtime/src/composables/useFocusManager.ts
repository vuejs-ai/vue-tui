import { inject, type ShallowRef } from "vue";
import { InternalFocusControllerKey } from "../focus/focus-context.ts";
import type { UseFocusReturn } from "./useFocus.ts";

export interface UseFocusManagerReturn {
  readonly focusedTarget: Readonly<ShallowRef<UseFocusReturn | null>>;
  focusNext(): boolean;
  focusPrevious(): boolean;
  blur(): boolean;
}

export function useFocusManager(): UseFocusManagerReturn {
  const controller = inject(InternalFocusControllerKey, null);
  if (!controller) {
    throw new Error("useFocusManager() must be called inside a vue-tui render tree");
  }
  return {
    focusedTarget: controller.focusedTarget as Readonly<ShallowRef<UseFocusReturn | null>>,
    focusNext: () => controller.focusNext(),
    focusPrevious: () => controller.focusPrevious(),
    blur: () => controller.blur(),
  };
}
