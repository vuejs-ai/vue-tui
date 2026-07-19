import type { InternalInputRouteDecision } from "./input-route-policy.ts";
import type { NormalizedInputFact } from "./normalized-input.ts";

export type TuiKeyName =
  | "backspace"
  | "delete"
  | "down"
  | "end"
  | "enter"
  | "escape"
  | "home"
  | "left"
  | "page-down"
  | "page-up"
  | "right"
  | "tab"
  | "up";

interface PublicKeyModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
}

export type TuiInputEvent =
  | {
      readonly kind: "text";
      readonly text: string;
    }
  | {
      readonly kind: "paste";
      readonly text: string;
    }
  | (PublicKeyModifiers & {
      readonly kind: "key";
      readonly name: TuiKeyName;
      readonly character?: never;
    })
  | (PublicKeyModifiers & {
      readonly kind: "key";
      readonly character: string;
      readonly name?: never;
    });

/**
 * Source-private bridge for the focus composables that are removed later in
 * Path 3. These supporting names must not remain package-root exports.
 */
export type InputHandlerResult = void | { readonly preventDefault: true };
export type InputHandler = (event: TuiInputEvent) => InputHandlerResult;

const publicInputCache = new WeakMap<NormalizedInputFact, TuiInputEvent | null>();

const namedKeys = Object.freeze({
  backspace: "backspace",
  delete: "delete",
  down: "down",
  end: "end",
  enter: "enter",
  escape: "escape",
  home: "home",
  left: "left",
  pagedown: "page-down",
  pageup: "page-up",
  return: "enter",
  right: "right",
  tab: "tab",
  up: "up",
  kpbackspace: "backspace",
  kpdelete: "delete",
  kpdown: "down",
  kpend: "end",
  kpenter: "enter",
  kphome: "home",
  kpleft: "left",
  kppagedown: "page-down",
  kppageup: "page-up",
  kpright: "right",
  kpup: "up",
} as const satisfies Readonly<Record<string, TuiKeyName>>);

const normalizeNamedKey = (name: string | undefined): TuiKeyName | undefined => {
  if (!name) return undefined;
  return (namedKeys as Readonly<Record<string, TuiKeyName>>)[name];
};

const isOneUnicodeScalar = (value: string): boolean => {
  const iterator = value[Symbol.iterator]();
  return !iterator.next().done && iterator.next().done === true;
};

const normalizeShortcutCharacter = (value: string | undefined): string | undefined => {
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
  // A single CSI carrying the explicit Meta bit does, and must stay filtered.
  return fact.key.code === undefined;
};

const publicModifiers = (
  fact: Extract<NormalizedInputFact, { readonly kind: "key" }>,
): PublicKeyModifiers | undefined => {
  const { modifiers } = fact.key;
  const legacyEscapeAlt = hasLegacyEscapePrefixAlt(fact);
  if (modifiers.super || modifiers.hyper || (modifiers.meta && !legacyEscapeAlt)) {
    return undefined;
  }
  return {
    shift: modifiers.shift,
    alt: modifiers.alt || legacyEscapeAlt,
    ctrl: modifiers.ctrl,
  };
};

const shortcutCharacter = (
  fact: Extract<NormalizedInputFact, { readonly kind: "key" }>,
): string | undefined => {
  const { key } = fact;
  if (key.protocol === "kitty") {
    const codepoint = key.baseLayoutCodepoint ?? key.primaryCodepoint;
    return codepoint === undefined
      ? undefined
      : normalizeShortcutCharacter(String.fromCodePoint(codepoint));
  }
  if (key.name === "space") return " ";
  if (key.name === "number") {
    const scalars = Array.from(fact.sequence);
    return normalizeShortcutCharacter(scalars.at(-1));
  }
  return normalizeShortcutCharacter(key.name);
};

const projectKey = (
  fact: Extract<NormalizedInputFact, { readonly kind: "key" }>,
): TuiInputEvent | null => {
  if (fact.key.phase === "release") return null;
  const modifiers = publicModifiers(fact);
  if (!modifiers) return null;

  if (fact.key.printable && fact.key.text && !modifiers.ctrl && !modifiers.alt) {
    return Object.freeze({ kind: "text", text: fact.key.text.value });
  }

  const name = normalizeNamedKey(fact.key.name);
  if (name) return Object.freeze({ kind: "key", name, ...modifiers });
  if (!fact.key.printable) return null;

  const character = shortcutCharacter(fact);
  return character ? Object.freeze({ kind: "key", character, ...modifiers }) : null;
};

/** Project one private normalized fact to the minimum public input union. */
export function projectPublicInputEvent(fact: NormalizedInputFact): TuiInputEvent | null {
  if (publicInputCache.has(fact)) return publicInputCache.get(fact)!;

  let event: TuiInputEvent | null;
  switch (fact.kind) {
    case "key":
      event = projectKey(fact);
      break;
    case "text":
      event = fact.phase === "release" ? null : Object.freeze({ kind: "text", text: fact.text });
      break;
    case "paste":
      event = Object.freeze({ kind: "paste", text: fact.text });
      break;
    case "pointer":
    case "uninterpreted":
      event = null;
      break;
  }

  publicInputCache.set(fact, event);
  return event;
}

const continuedDecision: InternalInputRouteDecision = Object.freeze({
  performed: false,
  continue: true,
  preventDefault: false,
  blockExternal: false,
});
const preventedDecision: InternalInputRouteDecision = Object.freeze({
  performed: false,
  continue: true,
  preventDefault: true,
  blockExternal: false,
});

const invalidResult = (): TypeError =>
  new TypeError(
    "useInput() handlers must synchronously return undefined or the exact object { preventDefault: true }.",
  );

/** Validate the one public default-control result and keep all routing private. */
export function normalizeInputHandlerResult(result: unknown): InternalInputRouteDecision {
  if (result === undefined) return continuedDecision;
  if (
    typeof result !== "object" ||
    result === null ||
    Object.getPrototypeOf(result) !== Object.prototype
  ) {
    throw invalidResult();
  }

  const keys = Reflect.ownKeys(result);
  if (keys.length !== 1 || keys[0] !== "preventDefault") throw invalidResult();
  if ((result as { readonly preventDefault?: unknown }).preventDefault !== true) {
    throw invalidResult();
  }
  return preventedDecision;
}
