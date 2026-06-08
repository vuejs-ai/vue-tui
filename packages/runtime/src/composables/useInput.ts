import {
  inject,
  onScopeDispose,
  toValue,
  unref,
  watch,
  type MaybeRef,
  type MaybeRefOrGetter,
} from "vue";
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

type InputHandler = (input: string, key: Key) => void;

export function useInput(handler: MaybeRef<InputHandler>, options: UseInputOptions = {}): void {
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
      // No release special-case: Ink (use-input.ts:204-217) classifies a kitty
      // event purely by isPrintable / ctrl+letter, regardless of
      // press/repeat/release. A printable release delivers `text ?? name` (e.g.
      // 'a'); a ctrl+letter release delivers the letter name. Suppressing input
      // on release here was an undocumented divergence — removed for byte-parity
      // with Ink. (Ctrl+C exit is scoped to non-release in emitInput, so a
      // Ctrl+C release flowing through here does not trigger a spurious exit.)
      if (keypress.isPrintable) {
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

    // Ctrl+C exit (both the legacy \x03 byte and the kitty CSI-u form) is
    // handled once, upstream in emitInput (createStdinController), so when
    // exitOnCtrlC is on Ctrl+C never reaches here — and useInput forwards every
    // key it does receive. Keeping the exit in one always-on place is what makes
    // it fire for useFocus/usePaste-only apps too; don't re-add a copy here.
    unref(handler)(input, key);
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
