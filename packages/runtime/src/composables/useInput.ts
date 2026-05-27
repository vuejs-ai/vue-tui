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
  super: boolean;
  hyper: boolean;
  capsLock: boolean;
  numLock: boolean;
  eventType?: "press" | "repeat" | "release";
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
    if (keypress.ignore) return;

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
      super: keypress.super ?? false,
      hyper: keypress.hyper ?? false,
      capsLock: keypress.capsLock ?? false,
      numLock: keypress.numLock ?? false,
      eventType: keypress.eventType,
    };

    let input: string;
    if (keypress.isKittyProtocol) {
      if (keypress.eventType === "release") {
        input = "";
      } else if (keypress.isPrintable) {
        input = keypress.text ?? keypress.name;
      } else if (keypress.ctrl && keypress.name.length === 1) {
        input = keypress.name;
      } else {
        input = "";
      }
    } else if (keypress.ctrl) {
      input = keypress.name ?? "";
    } else {
      input = keypress.sequence;
    }

    if (!keypress.isKittyProtocol && nonAlphanumericKeys.includes(keypress.name)) {
      input = "";
    }

    if (input.startsWith("\x1b")) {
      input = input.slice(1);
    }

    if (input.length === 1 && /[A-Z]/.test(input)) {
      key.shift = true;
    }

    // exitOnCtrlC: intercept kitty Ctrl+C (\x1b[3;5u). Legacy \x03 is caught
    // by emitInput in createStdinController and never reaches useInput.
    if (input === "c" && key.ctrl && stdin?.internal_exitOnCtrlC) {
      app!.exit();
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
