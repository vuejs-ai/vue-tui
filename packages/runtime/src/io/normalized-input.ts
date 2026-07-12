import type { InputEvent } from "./input-parser.ts";
import { nonAlphanumericKeys, parseKeypress, type Keypress } from "./parse-keypress.ts";
import { parseSgrMouseReport, type SgrMouseEvent } from "./parse-mouse.ts";

export interface InternalInputModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly super: boolean;
  readonly hyper: boolean;
  readonly meta: boolean;
  readonly capsLock: boolean;
  readonly numLock: boolean;
}

export interface InternalKeyDetail {
  readonly protocol: "legacy" | "kitty";
  readonly name: string | undefined;
  readonly code: string | undefined;
  readonly primaryCodepoint: number | undefined;
  readonly shiftedCodepoint: number | undefined;
  readonly baseLayoutCodepoint: number | undefined;
  readonly functionalCode: number | undefined;
  readonly modifiers: InternalInputModifiers;
  /** Legacy terminals do not distinguish an initial press from a repeat. */
  readonly phase: "press" | "repeat" | "release" | undefined;
  readonly printable: boolean;
  readonly text: { readonly value: string; readonly origin: "reported" } | undefined;
}

export interface InternalPointerDetail {
  readonly protocol: "sgr";
  readonly wireButton: number;
  readonly x: number;
  readonly y: number;
  readonly final: "M" | "m";
  readonly modifiers: InternalInputModifiers;
  /** Absent when the report is valid SGR input but its action is not interpreted yet. */
  readonly event: Readonly<SgrMouseEvent> | undefined;
}

export type NormalizedInputFact =
  | {
      readonly kind: "key";
      readonly sequence: string;
      readonly key: InternalKeyDetail;
    }
  | {
      readonly kind: "text";
      readonly sequence: string;
      readonly text: string;
      readonly protocol: "plain" | "kitty";
      readonly phase: "press" | "repeat" | "release" | undefined;
      readonly primaryCodepoint: number | undefined;
      readonly textOrigin: "reported" | undefined;
    }
  | {
      readonly kind: "paste";
      readonly sequence: string;
      readonly text: string;
    }
  | {
      readonly kind: "pointer";
      readonly sequence: string;
      readonly pointer: InternalPointerDetail;
    }
  | {
      readonly kind: "uninterpreted";
      readonly sequence: string;
    };

const noModifiers = (): InternalInputModifiers => ({
  shift: false,
  alt: false,
  ctrl: false,
  super: false,
  hyper: false,
  meta: false,
  capsLock: false,
  numLock: false,
});

const modifiersFromKeypress = (keypress: Keypress): InternalInputModifiers =>
  Object.freeze({
    shift: keypress.shift,
    alt: keypress.alt ?? false,
    ctrl: keypress.ctrl,
    super: keypress.super ?? false,
    hyper: keypress.hyper ?? false,
    meta: keypress.meta,
    capsLock: keypress.capsLock ?? false,
    numLock: keypress.numLock ?? false,
  });

const isPlainText = (sequence: string): boolean => {
  if (sequence.includes("\x1b")) return false;
  // A multi-codepoint run has no key boundary on the wire. Preserve it as text
  // even if it contains a control character (for example unbracketed input),
  // rather than inventing one physical key event for the whole run.
  const codepoint = sequence.codePointAt(0);
  const firstCodepointLength = codepoint !== undefined && codepoint > 0xff_ff ? 2 : 1;
  if (sequence.length > firstCodepointLength) return true;
  return codepoint !== undefined && codepoint >= 0x20 && !(codepoint >= 0x7f && codepoint <= 0x9f);
};

const normalizeSequence = (sequence: string): NormalizedInputFact | undefined => {
  const pointerReport = parseSgrMouseReport(sequence);
  if (pointerReport) {
    const event = pointerReport.event ? Object.freeze({ ...pointerReport.event }) : undefined;
    const modifiers = Object.freeze({
      ...noModifiers(),
      shift: pointerReport.shift,
      meta: pointerReport.meta,
      ctrl: pointerReport.ctrl,
    });
    return Object.freeze({
      kind: "pointer",
      sequence,
      pointer: Object.freeze({
        protocol: "sgr",
        wireButton: pointerReport.wireButton,
        x: pointerReport.x,
        y: pointerReport.y,
        final: pointerReport.final,
        modifiers,
        event,
      }),
    });
  }

  if (isPlainText(sequence)) {
    return Object.freeze({
      kind: "text",
      sequence,
      text: sequence,
      protocol: "plain",
      phase: undefined,
      primaryCodepoint: undefined,
      textOrigin: undefined,
    });
  }

  const keypress = parseKeypress(sequence);
  if (keypress.ignore) return undefined;

  if (keypress.isKittyProtocol && keypress.primaryCodepoint === 0 && keypress.text) {
    return Object.freeze({
      kind: "text",
      sequence,
      text: keypress.text,
      protocol: "kitty",
      phase: keypress.eventType,
      primaryCodepoint: 0,
      textOrigin: "reported",
    });
  }

  const isEncodedKey =
    keypress.name !== "" ||
    keypress.code !== undefined ||
    keypress.primaryCodepoint !== undefined ||
    keypress.functionalCode !== undefined;
  if (!isEncodedKey) {
    return Object.freeze({ kind: "uninterpreted", sequence });
  }

  const protocol = keypress.isKittyProtocol ? "kitty" : "legacy";
  const printable =
    keypress.isPrintable ??
    (!nonAlphanumericKeys.includes(keypress.name) &&
      (keypress.name.length === 1 || keypress.name === "number" || keypress.name === "space"));
  const text = keypress.text
    ? Object.freeze({
        value: keypress.text,
        origin: "reported" as const,
      })
    : undefined;
  const key: InternalKeyDetail = Object.freeze({
    protocol,
    name: keypress.name || undefined,
    code: keypress.code,
    primaryCodepoint: keypress.primaryCodepoint,
    shiftedCodepoint: keypress.shiftedCodepoint,
    baseLayoutCodepoint: keypress.baseLayoutCodepoint,
    functionalCode: keypress.functionalCode,
    modifiers: modifiersFromKeypress(keypress),
    phase: keypress.eventType,
    printable,
    text,
  });
  return Object.freeze({ kind: "key", sequence, key });
};

/** Normalize one already-framed input event. Kitty query replies produce no application fact. */
export function normalizeInputEvent(event: InputEvent): NormalizedInputFact | undefined {
  if (typeof event === "string") return normalizeSequence(event);
  return Object.freeze({
    kind: "paste",
    sequence: `\x1b[200~${event.paste}\x1b[201~`,
    text: event.paste,
  });
}

export interface LegacyInputKeyProjection {
  readonly upArrow: boolean;
  readonly downArrow: boolean;
  readonly leftArrow: boolean;
  readonly rightArrow: boolean;
  readonly pageDown: boolean;
  readonly pageUp: boolean;
  readonly home: boolean;
  readonly end: boolean;
  readonly return: boolean;
  readonly escape: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly tab: boolean;
  readonly backspace: boolean;
  readonly delete: boolean;
  readonly meta: boolean;
  readonly super: boolean;
  readonly hyper: boolean;
  readonly capsLock: boolean;
  readonly numLock: boolean;
  readonly eventType: "press" | "repeat" | "release" | undefined;
}

export interface LegacyInputProjection {
  readonly input: string;
  readonly key: LegacyInputKeyProjection;
}

type MutableLegacyInputKey = {
  -readonly [Key in keyof LegacyInputKeyProjection]: LegacyInputKeyProjection[Key];
};

const emptyLegacyKey = (): MutableLegacyInputKey => ({
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
  eventType: undefined,
});

const projectRawSequence = (sequence: string): LegacyInputProjection => {
  const key = emptyLegacyKey();
  let input = sequence;
  if (input.startsWith("\x1b")) input = input.slice(1);
  if (input.length === 1 && /[A-Z]/.test(input)) key.shift = true;
  return Object.freeze({ input, key: Object.freeze(key) });
};

const projectNormalizedKey = (
  fact: Extract<NormalizedInputFact, { readonly kind: "key" }>,
): LegacyInputProjection => {
  const key = emptyLegacyKey();
  const { modifiers } = fact.key;
  Object.assign(key, {
    upArrow: fact.key.name === "up",
    downArrow: fact.key.name === "down",
    leftArrow: fact.key.name === "left",
    rightArrow: fact.key.name === "right",
    pageDown: fact.key.name === "pagedown",
    pageUp: fact.key.name === "pageup",
    home: fact.key.name === "home",
    end: fact.key.name === "end",
    return: fact.key.name === "return",
    escape: fact.key.name === "escape",
    ctrl: modifiers.ctrl,
    shift: modifiers.shift,
    tab: fact.key.name === "tab",
    backspace: fact.key.name === "backspace",
    delete: fact.key.name === "delete",
    meta: modifiers.meta || modifiers.alt,
    super: modifiers.super,
    hyper: modifiers.hyper,
    capsLock: modifiers.capsLock,
    numLock: modifiers.numLock,
    eventType: fact.key.phase,
  });

  let input: string;
  if (fact.key.protocol === "kitty") {
    if (fact.key.text) input = fact.key.text.value;
    else if (fact.key.printable && fact.key.primaryCodepoint !== undefined) {
      input = String.fromCodePoint(fact.key.primaryCodepoint);
    } else if (fact.key.name === "return") input = "\r";
    else if (modifiers.ctrl && fact.key.name?.length === 1) input = fact.key.name;
    else input = "";
  } else if (modifiers.ctrl) {
    input = fact.key.name ?? "";
  } else {
    input = fact.sequence;
  }
  if (
    fact.key.protocol === "legacy" &&
    fact.key.name &&
    nonAlphanumericKeys.includes(fact.key.name)
  ) {
    input = "";
  }
  if (input.startsWith("\x1b")) input = input.slice(1);
  if (input.length === 1 && /[A-Z]/.test(input)) key.shift = true;

  return Object.freeze({ input, key: Object.freeze(key) });
};

const projectionCache = new WeakMap<NormalizedInputFact, LegacyInputProjection | null>();

/** Current Ink-shaped hook projection, cached once per shared semantic fact. */
export function getLegacyInputProjection(
  fact: NormalizedInputFact,
): LegacyInputProjection | undefined {
  const cached = projectionCache.get(fact);
  if (cached !== undefined) return cached ?? undefined;

  let projection: LegacyInputProjection | undefined;
  switch (fact.kind) {
    case "key":
      projection = projectNormalizedKey(fact);
      break;
    case "text": {
      const key = emptyLegacyKey();
      if (fact.text.length === 1 && /[A-Z]/.test(fact.text)) key.shift = true;
      key.eventType = fact.phase;
      projection = Object.freeze({ input: fact.text, key: Object.freeze(key) });
      break;
    }
    case "paste": {
      // Paste fallback remains one useInput callback, but its payload is text,
      // not a key or protocol packet. Do not manufacture Ctrl+C, focus, mouse,
      // or query semantics from bytes inside the preserved paste boundary.
      projection = Object.freeze({ input: fact.text, key: Object.freeze(emptyLegacyKey()) });
      break;
    }
    case "pointer":
    case "uninterpreted":
      projection = projectRawSequence(fact.sequence);
      break;
  }

  projectionCache.set(fact, projection ?? null);
  return projection;
}
