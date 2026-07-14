import type { InjectionKey } from "vue";
import type { InternalTextSelectionController } from "./selection-controller.ts";

export const InternalTextSelectionControllerKey: InjectionKey<InternalTextSelectionController> =
  Symbol("vue-tui:text-selection");
