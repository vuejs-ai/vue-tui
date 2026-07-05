import { inject, isRef, toValue, watch, type MaybeRefOrGetter } from "vue";
import { StdinContextKey } from "../context.ts";
import type { MouseInputEvent } from "../io/parse-mouse.ts";
import { tryOnScopeDispose } from "./scope.ts";

export type { MouseInputEvent } from "../io/parse-mouse.ts";

export interface UseMouseInputOptions {
  isActive?: MaybeRefOrGetter<boolean>;
}

type MouseInputHandler = (event: MouseInputEvent) => void;

export function useMouseInput(
  handler: MaybeRefOrGetter<MouseInputHandler>,
  options: UseMouseInputOptions = {},
): void {
  const stdin = inject(StdinContextKey);
  if (!stdin) throw new Error("useMouseInput() must be called inside a vue-tui render tree");

  let attached = false;
  let mouseModeToken: symbol | undefined;

  function listener(event: MouseInputEvent) {
    const source = isRef(handler) ? handler.value : handler;
    // Function handlers and getter functions overlap; zero-arg getters return
    // the real handler, while direct handlers usually consume the event here.
    const result = (source as (event: MouseInputEvent) => void | MouseInputHandler)(event);
    if (source.length === 0 && typeof result === "function") result(event);
  }

  function attach() {
    if (attached) return;
    stdin!.acquireRawMode();
    try {
      mouseModeToken = stdin!.acquireSgrMouseMode("button");
      stdin!.internal_eventEmitter.on("mouse", listener);
      attached = true;
    } catch (error) {
      mouseModeToken = undefined;
      stdin!.releaseRawMode();
      throw error;
    }
  }

  function detach() {
    if (!attached) return;
    attached = false;
    stdin!.internal_eventEmitter.off("mouse", listener);
    if (mouseModeToken) {
      stdin!.releaseSgrMouseMode(mouseModeToken);
      mouseModeToken = undefined;
    }
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

  tryOnScopeDispose(detach);
}
