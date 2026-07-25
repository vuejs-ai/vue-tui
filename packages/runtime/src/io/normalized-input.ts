import type { InputEvent } from "./input-parser.ts";
import { nonAlphanumericKeys, parseKeypress, type Keypress } from "./parse-keypress.ts";

/** Command modifiers needed to project an accepted public key identity. */
export interface InternalInputModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly super: boolean;
  readonly hyper: boolean;
  readonly meta: boolean;
}

/**
 * Key detail retained on the broadcast fact.
 *
 * Parser-local protocol metadata (lock bits, alternate codepoints, origins) stays
 * in parse-keypress and is not re-broadcast here.
 */
export interface InternalKeyDetail {
  readonly protocol: "legacy" | "kitty";
  readonly name: string | undefined;
  readonly code: string | undefined;
  /** Kitty logical character identity; required for Kitty character selection. */
  readonly primaryCodepoint: number | undefined;
  readonly modifiers: InternalInputModifiers;
  /** Legacy terminals do not distinguish an initial press from a repeat. */
  readonly phase: "press" | "repeat" | "release" | undefined;
  readonly printable: boolean;
  /** Kitty-reported associated text, when present. */
  readonly text: string | undefined;
}

/**
 * Subscription/broadcast facts that can produce an accepted TuiInputEvent.
 *
 * Uninterpretable sequences and framework-owned replies produce no fact.
 * Release facts may still be broadcast; public projection drops them.
 */
export type NormalizedInputFact =
  | {
      readonly kind: "key";
      /** Wire sequence retained for legacy Alt prefix and digit-key character recovery. */
      readonly sequence: string;
      readonly key: InternalKeyDetail;
    }
  | {
      readonly kind: "text";
      readonly text: string;
      readonly phase: "press" | "repeat" | "release" | undefined;
    }
  | {
      readonly kind: "paste";
      readonly text: string;
    };

const modifiersFromKeypress = (keypress: Keypress): InternalInputModifiers =>
  Object.freeze({
    shift: keypress.shift,
    alt: keypress.alt ?? false,
    ctrl: keypress.ctrl,
    super: keypress.super ?? false,
    hyper: keypress.hyper ?? false,
    meta: keypress.meta,
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
      text: sequence,
      phase: undefined,
    });
  }

  const keypress = parseKeypress(sequence);
  if (keypress.ignore) return undefined;

  if (keypress.isKittyProtocol && keypress.primaryCodepoint === 0 && keypress.text) {
    return Object.freeze({
      kind: "text",
      text: keypress.text,
      phase: keypress.eventType,
    });
  }

  const isEncodedKey =
    keypress.name !== "" ||
    keypress.code !== undefined ||
    keypress.primaryCodepoint !== undefined ||
    keypress.functionalCode !== undefined;
  // Uninterpretable complete sequences produce no application fact.
  if (!isEncodedKey) return undefined;

  const protocol = keypress.isKittyProtocol ? "kitty" : "legacy";
  const printable =
    keypress.isPrintable ??
    (!nonAlphanumericKeys.includes(keypress.name) &&
      (keypress.name.length === 1 || keypress.name === "number" || keypress.name === "space"));
  const key: InternalKeyDetail = Object.freeze({
    protocol,
    name: keypress.name || undefined,
    code: keypress.code,
    primaryCodepoint: keypress.primaryCodepoint,
    modifiers: modifiersFromKeypress(keypress),
    phase: keypress.eventType,
    printable,
    text: keypress.text,
  });
  return Object.freeze({ kind: "key", sequence, key });
};

/** Normalize one already-framed input event. Kitty query replies produce no application fact. */
export function normalizeInputEvent(event: InputEvent): NormalizedInputFact | undefined {
  if (typeof event === "string") return normalizeSequence(event);
  return Object.freeze({
    kind: "paste",
    text: event.paste,
  });
}
