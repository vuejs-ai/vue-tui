import type { InjectionKey } from "vue";
import type { InternalFocusController } from "./focus-controller.ts";

/** Private per-application owner behind the public useFocus() handles. */
export const InternalFocusControllerKey: InjectionKey<InternalFocusController> = Symbol(
  "vue-tui:focus-controller",
);
