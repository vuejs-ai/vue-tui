import type { InjectionKey } from "vue";
import type { InternalFocusController } from "./focus-controller.ts";

/** Private per-application focus owner consumed by the public F4 composables. */
export const InternalFocusControllerKey: InjectionKey<InternalFocusController> = Symbol(
  "vue-tui:focus-controller",
);
