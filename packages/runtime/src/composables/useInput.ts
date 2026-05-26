import { inject, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from "vue";
import { AppContextKey, StdinContextKey } from "../context.ts";
import { parseKeypress, nonAlphanumericKeys } from "../io/parse-keypress.ts";

export interface Key {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  home: boolean;
  end: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  meta: boolean;
}

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

  function listener(data: string) {
    const keypress = parseKeypress(data);

    const key: Key = {
      upArrow: keypress.name === "up",
      downArrow: keypress.name === "down",
      leftArrow: keypress.name === "left",
      rightArrow: keypress.name === "right",
      pageDown: keypress.name === "pagedown",
      pageUp: keypress.name === "pageup",
      home: keypress.name === "home",
      end: keypress.name === "end",
      return: keypress.name === "return",
      escape: keypress.name === "escape",
      ctrl: keypress.ctrl,
      shift: keypress.shift,
      tab: keypress.name === "tab",
      backspace: keypress.name === "backspace",
      delete: keypress.name === "delete",
      meta: keypress.meta,
    };

    let input: string;
    if (keypress.ctrl) {
      input = keypress.name ?? "";
    } else {
      input = keypress.sequence;
    }

    if (nonAlphanumericKeys.includes(keypress.name)) {
      input = "";
    }

    // Strip escape prefix from incomplete sequences
    if (input.startsWith("\x1b")) {
      input = input.slice(1);
    }

    if (input.length === 1 && /[A-Z]/.test(input)) {
      key.shift = true;
    }

    // exitOnCtrlC skip: don't call user handler for Ctrl+C when intercepted
    if (input === "c" && key.ctrl && stdin?.internal_exitOnCtrlC) {
      return;
    }

    handler(input, key);
  }

  function attach() {
    if (attached) return;
    attached = true;
    stdin!.acquireRawMode();
    stdin!.internal_eventEmitter.on("input", listener);
  }

  function detach() {
    if (!attached) return;
    attached = false;
    stdin!.internal_eventEmitter.off("input", listener);
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
