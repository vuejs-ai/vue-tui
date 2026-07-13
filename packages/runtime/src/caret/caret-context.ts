import type { InjectionKey } from "vue";
import type { InternalCaretController } from "./caret-controller.ts";

/** Private per-application owner for focus-bound caret declarations. */
export const InternalCaretControllerKey: InjectionKey<InternalCaretController> = Symbol(
  "vue-tui:caret-controller",
);
