import type { NormalizedInputFact } from "./normalized-input.ts";

/**
 * Stable semantic key names emitted by Runtime.
 *
 * The listed names are editor suggestions, not a closed world: newer terminal
 * protocols may add other normalized lower-kebab-case names.
 */
export type TuiKeyName =
  | "backspace"
  | "tab"
  | "enter"
  | "escape"
  | "insert"
  | "delete"
  | "up"
  | "down"
  | "left"
  | "right"
  | "home"
  | "end"
  | "page-up"
  | "page-down"
  | "f1"
  | "f2"
  | "f3"
  | "f4"
  | "f5"
  | "f6"
  | "f7"
  | "f8"
  | "f9"
  | "f10"
  | "f11"
  | "f12"
  | (string & {});

interface TuiKeyModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly super: boolean;
  readonly hyper: boolean;
}

/** One complete logical key identity and its command modifiers. */
export type TuiKey = TuiKeyModifiers &
  (
    | {
        readonly name: TuiKeyName;
        readonly character?: never;
      }
    | {
        readonly character: string;
        readonly name?: never;
      }
  );

/**
 * Normalized application input.
 *
 * Text is insertion-ready and non-empty. A text event includes `key` only when
 * the terminal also supplied reliable logical-key identity. Paste always
 * contains one complete decoded bracketed-paste payload, including an empty
 * payload. Key events contain no insertion text.
 */
export type TuiInputEvent =
  | {
      readonly type: "text";
      readonly text: string;
      readonly key?: TuiKey;
    }
  | {
      readonly type: "key";
      readonly key: TuiKey;
      readonly text?: never;
    }
  | {
      readonly type: "paste";
      readonly text: string;
      readonly key?: never;
    };

const namedKeyAliases = Object.freeze({
  return: "enter",
  pageup: "page-up",
  pagedown: "page-down",
  kpbackspace: "backspace",
  kpdelete: "delete",
  kpdown: "down",
  kpend: "end",
  kpenter: "enter",
  kphome: "home",
  kpinsert: "insert",
  kpleft: "left",
  kppagedown: "page-down",
  kppageup: "page-up",
  kpright: "right",
  kpup: "up",
  kp0: "keypad-0",
  kp1: "keypad-1",
  kp2: "keypad-2",
  kp3: "keypad-3",
  kp4: "keypad-4",
  kp5: "keypad-5",
  kp6: "keypad-6",
  kp7: "keypad-7",
  kp8: "keypad-8",
  kp9: "keypad-9",
  kpdecimal: "keypad-decimal",
  kpdivide: "keypad-divide",
  kpmultiply: "keypad-multiply",
  kpsubtract: "keypad-subtract",
  kpadd: "keypad-add",
  kpequal: "keypad-equal",
  kpseparator: "keypad-separator",
  kpbegin: "keypad-begin",
  capslock: "caps-lock",
  scrolllock: "scroll-lock",
  numlock: "num-lock",
  printscreen: "print-screen",
  mediaplay: "media-play",
  mediapause: "media-pause",
  mediaplaypause: "media-play-pause",
  mediareverse: "media-reverse",
  mediastop: "media-stop",
  mediafastforward: "media-fast-forward",
  mediarewind: "media-rewind",
  mediatracknext: "media-track-next",
  mediatrackprevious: "media-track-previous",
  mediarecord: "media-record",
  lowervolume: "lower-volume",
  raisevolume: "raise-volume",
  mutevolume: "mute-volume",
  leftshift: "left-shift",
  leftcontrol: "left-control",
  leftalt: "left-alt",
  leftsuper: "left-super",
  lefthyper: "left-hyper",
  leftmeta: "left-meta",
  rightshift: "right-shift",
  rightcontrol: "right-control",
  rightalt: "right-alt",
  rightsuper: "right-super",
  righthyper: "right-hyper",
  rightmeta: "right-meta",
  isoLevel3Shift: "iso-level-3-shift",
  isoLevel5Shift: "iso-level-5-shift",
} as const satisfies Readonly<Record<string, TuiKeyName>>);

const normalizeNamedKey = (name: string | undefined): TuiKeyName | undefined => {
  if (!name) return undefined;
  const aliased = (namedKeyAliases as Readonly<Record<string, TuiKeyName>>)[name];
  if (aliased) return aliased;

  const normalized = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : undefined;
};

const isOneUnicodeScalar = (value: string): boolean => {
  const iterator = value[Symbol.iterator]();
  return !iterator.next().done && iterator.next().done === true;
};

const normalizeLogicalCharacter = (value: string | undefined): string | undefined => {
  if (!value || !isOneUnicodeScalar(value)) return undefined;
  const codepoint = value.codePointAt(0)!;
  if (codepoint >= 0x41 && codepoint <= 0x5a) return value.toLowerCase();
  return value;
};

const hasLegacyEscapePrefixAlt = (
  fact: Extract<NormalizedInputFact, { readonly kind: "key" }>,
): boolean => {
  if (fact.key.protocol !== "legacy" || !fact.key.modifiers.meta) return false;
  if (fact.sequence.startsWith("\x1b\x1b")) return true;
  // A legacy ESC-prefixed printable/control key has no parsed CSI/SS3 code.
  // A CSI carrying an explicit Meta bit does, and remains Meta.
  return fact.key.code === undefined;
};

const projectModifiers = (
  fact: Extract<NormalizedInputFact, { readonly kind: "key" }>,
): TuiKeyModifiers => {
  const { modifiers } = fact.key;
  const legacyEscapeAlt = hasLegacyEscapePrefixAlt(fact);
  return {
    shift: modifiers.shift,
    alt: modifiers.alt || legacyEscapeAlt,
    ctrl: modifiers.ctrl,
    meta: modifiers.meta && !legacyEscapeAlt,
    super: modifiers.super,
    hyper: modifiers.hyper,
  };
};

const logicalCharacter = (
  fact: Extract<NormalizedInputFact, { readonly kind: "key" }>,
): string | undefined => {
  const { key } = fact;
  if (!key.printable) return undefined;

  // Kitty's primary codepoint is logical identity. The optional base-layout
  // codepoint is physical-layout metadata and deliberately stays private.
  if (key.protocol === "kitty" && key.primaryCodepoint !== undefined) {
    return normalizeLogicalCharacter(String.fromCodePoint(key.primaryCodepoint));
  }
  if (key.name === "space") return " ";
  if (key.name === "number") {
    return normalizeLogicalCharacter(Array.from(fact.sequence).at(-1));
  }
  return normalizeLogicalCharacter(key.name);
};

const projectKey = (
  fact: Extract<NormalizedInputFact, { readonly kind: "key" }>,
): TuiKey | undefined => {
  const modifiers = projectModifiers(fact);
  const character = logicalCharacter(fact);
  if (character !== undefined) {
    return Object.freeze({ character, ...modifiers });
  }

  const name = normalizeNamedKey(fact.key.name);
  return name === undefined ? undefined : Object.freeze({ name, ...modifiers });
};

const publicInputCache = new WeakMap<NormalizedInputFact, TuiInputEvent | null>();

/** Project one private normalized fact to the public text, key, or paste union. */
export function projectPublicInputEvent(fact: NormalizedInputFact): TuiInputEvent | null {
  if (publicInputCache.has(fact)) return publicInputCache.get(fact)!;

  let event: TuiInputEvent | null;
  switch (fact.kind) {
    case "paste":
      event = Object.freeze({ type: "paste", text: fact.text });
      break;
    case "text":
      event =
        fact.phase === "release" || fact.text.length === 0
          ? null
          : Object.freeze({ type: "text", text: fact.text });
      break;
    case "key": {
      if (fact.key.phase === "release") {
        event = null;
        break;
      }
      const key = projectKey(fact);
      const text = fact.key.text?.value;
      if (text !== undefined && text.length > 0) {
        event = Object.freeze(
          key === undefined ? { type: "text", text } : { type: "text", text, key },
        );
      } else {
        event = key === undefined ? null : Object.freeze({ type: "key", key });
      }
      break;
    }
    case "uninterpreted":
      event = null;
      break;
  }

  publicInputCache.set(fact, event);
  return event;
}
