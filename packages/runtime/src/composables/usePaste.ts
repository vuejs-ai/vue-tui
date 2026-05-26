import { inject, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from "vue";
import { StdinContextKey } from "../context.ts";

export interface UsePasteOptions {
  isActive?: MaybeRefOrGetter<boolean>;
}

export function usePaste(handler: (text: string) => void, options: UsePasteOptions = {}): void {
  const stdin = inject(StdinContextKey);
  if (!stdin) throw new Error("usePaste() must be called inside a vue-tui render tree");

  let attached = false;

  function listener(text: string) {
    handler(text);
  }

  function attach() {
    if (attached) return;
    attached = true;
    stdin!.acquireRawMode();
    stdin!.setBracketedPasteMode(true);
    stdin!.internal_eventEmitter.on("paste", listener);
  }

  function detach() {
    if (!attached) return;
    attached = false;
    stdin!.internal_eventEmitter.off("paste", listener);
    stdin!.setBracketedPasteMode(false);
    stdin!.releaseRawMode();
  }

  const isActive = options.isActive ?? true;
  watch(
    () => toValue(isActive),
    (value) => {
      if (value) attach();
      else detach();
    },
    { immediate: true, flush: "sync" },
  );

  onScopeDispose(detach);
}
