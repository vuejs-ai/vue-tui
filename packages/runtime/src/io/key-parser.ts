export interface Key {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  meta: boolean;
}

const empty: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
};

export function parseKey(input: string): { input: string; key: Key } {
  const key: Key = { ...empty };
  if (input === "\r" || input === "\n") {
    key.return = true;
    return { input: "", key };
  }
  if (input === "\x1b") {
    key.escape = true;
    return { input: "", key };
  }
  if (input === "\t") {
    key.tab = true;
    return { input: "", key };
  }
  if (input === "\x7f" || input === "\b") {
    key.backspace = true;
    return { input: "", key };
  }
  if (input === "\x1b[A") return { input: "", key: { ...key, upArrow: true } };
  if (input === "\x1b[B") return { input: "", key: { ...key, downArrow: true } };
  if (input === "\x1b[C") return { input: "", key: { ...key, rightArrow: true } };
  if (input === "\x1b[D") return { input: "", key: { ...key, leftArrow: true } };
  if (input === "\x1b[5~") return { input: "", key: { ...key, pageUp: true } };
  if (input === "\x1b[6~") return { input: "", key: { ...key, pageDown: true } };
  if (input === "\x1b[3~") return { input: "", key: { ...key, delete: true } };
  if (input === "\x1b[Z") return { input: "", key: { ...key, tab: true, shift: true } };
  // Bare forms (no leading ESC) for test pipelines that strip it.
  if (input === "[A") return { input: "", key: { ...key, upArrow: true } };
  if (input === "[B") return { input: "", key: { ...key, downArrow: true } };
  if (input === "[C") return { input: "", key: { ...key, rightArrow: true } };
  if (input === "[D") return { input: "", key: { ...key, leftArrow: true } };
  // Ctrl+letter -> codes 1..26
  if (input.length === 1 && input.charCodeAt(0) >= 1 && input.charCodeAt(0) <= 26) {
    return {
      input: String.fromCharCode(input.charCodeAt(0) + 96),
      key: { ...key, ctrl: true },
    };
  }
  return { input, key };
}
