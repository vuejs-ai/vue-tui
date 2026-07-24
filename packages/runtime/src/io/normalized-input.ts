import type { InputEvent } from "./input-parser.ts";
import { nonAlphanumericKeys, parseKeypress, type Keypress } from "./parse-keypress.ts";

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
      readonly kind: "uninterpreted";
      readonly sequence: string;
    };

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

const sgrMouseReport = /^\x1b\[<\d+;\d+;\d+[mM]$/;

const normalizeSequence = (sequence: string): NormalizedInputFact | undefined => {
  // Runtime does not own mouse reporting. Ignore unsolicited complete SGR
  // reports so terminal residue cannot surface as application key or text.
  if (sgrMouseReport.test(sequence)) return undefined;

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
