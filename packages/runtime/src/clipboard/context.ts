import type { InjectionKey } from "vue";
import type { InternalClipboardService } from "./clipboard-service.ts";

export const InternalClipboardServiceKey: InjectionKey<InternalClipboardService> =
  Symbol("vue-tui:clipboard");
