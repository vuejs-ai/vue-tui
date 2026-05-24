import { inject, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from "vue";
import { AppContextKey, StdinContextKey } from "../context.ts";
import { parseKey, type Key } from "../io/key-parser.ts";

export type { Key };

export interface UseInputOptions {
  isActive?: MaybeRefOrGetter<boolean>;
}

export function useInput(
  handler: (input: string, key: Key) => void,
  options: UseInputOptions = {},
): void {
  const app = inject(AppContextKey);
  const stdin = inject(StdinContextKey);
  if (!app || !stdin) throw new Error("useInput() must be called inside a vue-tui render tree");

  let attached = false;

  function listener(chunk: string) {
    const { input, key } = parseKey(chunk);
    handler(input, key);
  }

  function attach() {
    if (attached) return;
    attached = true;
    stdin!.acquireRawMode();
    stdin!.internal_eventEmitter.on("data", listener);
  }

  function detach() {
    if (!attached) return;
    attached = false;
    stdin!.internal_eventEmitter.off("data", listener);
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
