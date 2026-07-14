import { inject } from "vue";
import { InternalClipboardServiceKey } from "../clipboard/context.ts";
import type {
  ClipboardAvailability,
  ClipboardWriteResult,
} from "../clipboard/clipboard-service.ts";
import type { ShallowRef } from "vue";

export interface UseClipboardReturn {
  readonly availability: Readonly<ShallowRef<ClipboardAvailability>>;
  readonly writeText: (text: string) => Promise<ClipboardWriteResult>;
}

export function useClipboard(): UseClipboardReturn {
  const service = inject(InternalClipboardServiceKey, null);
  if (!service) throw new Error("useClipboard() must be called inside a vue-tui render tree");
  return Object.freeze({
    availability: service.availability,
    writeText: (text: string) => service.writeText(text),
  });
}
