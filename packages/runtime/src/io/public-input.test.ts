import { describe, expect, test } from "vite-plus/test";
import { normalizeInputEvent, type NormalizedInputFact } from "./normalized-input.ts";
import { projectPublicInputEvent } from "./public-input.ts";

function fact(event: string | { readonly paste: string }): NormalizedInputFact {
  const result = normalizeInputEvent(event);
  if (!result) throw new Error(`Expected an input fact for ${JSON.stringify(event)}`);
  return result;
}

const noModifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  super: false,
  hyper: false,
} as const;

describe("public input projection", () => {
  test("keeps plain and composed input as text without inventing key identity", () => {
    for (const text of ["Hello 😀", "é", "日本語"]) {
      const inputFact = fact(text);
      const event = projectPublicInputEvent(inputFact);
      expect(event).toEqual({ type: "text", text });
      expect(Object.isFrozen(event)).toBe(true);
      expect(projectPublicInputEvent(inputFact)).toBe(event);
    }

    expect(projectPublicInputEvent(fact("\x1b[0;;229u"))).toEqual({
      type: "text",
      text: "å",
    });
  });

  test("includes a complete logical key only with enhanced key evidence", () => {
    const event = projectPublicInputEvent(fact("\x1b[97:65;2;65u"));
    expect(event).toEqual({
      type: "text",
      text: "A",
      key: { character: "a", ...noModifiers, shift: true },
    });
    expect(event?.type === "text" ? Object.isFrozen(event.key) : false).toBe(true);
  });

  test("uses logical primary identity rather than Kitty base-layout metadata", () => {
    expect(projectPublicInputEvent(fact("\x1b[1089::99;5u"))).toEqual({
      type: "key",
      key: { character: "с", ...noModifiers, ctrl: true },
    });
  });

  test("keeps every complete bracketed-paste payload opaque", () => {
    for (const text of ["", "first\nsecond", "\x03\x1b[A\x1b[?31u"]) {
      const event = projectPublicInputEvent(fact({ paste: text }));
      expect(event).toEqual({ type: "paste", text });
      expect(Object.isFrozen(event)).toBe(true);
    }
  });

  test.each([
    ["carriage return", "\r", "enter"],
    ["line feed", "\n", "enter"],
    ["Kitty return", "\x1b[13u", "enter"],
    ["keypad Enter", "\x1b[57414u", "enter"],
    ["Tab", "\t", "tab"],
    ["Backspace", "\x7f", "backspace"],
    ["Escape", "\x1b", "escape"],
    ["Insert", "\x1b[2~", "insert"],
    ["Delete", "\x1b[3~", "delete"],
    ["Up", "\x1b[A", "up"],
    ["keypad Down", "\x1b[57420u", "down"],
    ["Left", "\x1b[D", "left"],
    ["Right", "\x1b[C", "right"],
    ["Home", "\x1b[H", "home"],
    ["keypad End", "\x1b[57424u", "end"],
    ["Page Up", "\x1b[5~", "page-up"],
    ["keypad Page Down", "\x1b[57422u", "page-down"],
    ["F1", "\x1bOP", "f1"],
    ["F12", "\x1b[24~", "f12"],
    ["future F13", "\x1b[57376u", "f13"],
    ["future media key", "\x1b[57430u", "media-play-pause"],
    ["future modifier key", "\x1b[57441u", "left-shift"],
  ] as const)("normalizes the %s identity", (_label, sequence, name) => {
    const event = projectPublicInputEvent(fact(sequence));
    expect(event).toEqual({ type: "key", key: { name, ...noModifiers } });
    expect(event?.type === "key" ? Object.isFrozen(event.key) : false).toBe(true);
  });

  test("projects logical shortcut characters and all six command modifiers", () => {
    expect(projectPublicInputEvent(fact("\x01"))).toEqual({
      type: "key",
      key: { character: "a", ...noModifiers, ctrl: true },
    });
    expect(projectPublicInputEvent(fact("\x1bA"))).toEqual({
      type: "key",
      key: { character: "a", ...noModifiers, shift: true, alt: true },
    });
    expect(projectPublicInputEvent(fact("\x1b[97;33u"))).toEqual({
      type: "key",
      key: { character: "a", ...noModifiers, meta: true },
    });
    expect(projectPublicInputEvent(fact("\x1b[97;64u"))).toEqual({
      type: "key",
      key: {
        character: "a",
        shift: true,
        alt: true,
        ctrl: true,
        meta: true,
        super: true,
        hyper: true,
      },
    });
  });

  test.each([
    ["pure-text release", "\x1b[0;1:3;229u", "text"],
    ["key release", "\x1b[99;5:3u", "key"],
    ["unknown private key", "\x1b[58000u", "key"],
    ["uninterpreted sequence", "\x1b[?25h", "uninterpreted"],
  ] as const)("drops %s", (_label, sequence, expectedInternalKind) => {
    const inputFact = fact(sequence);
    expect(inputFact.kind).toBe(expectedInternalKind);
    expect(projectPublicInputEvent(inputFact)).toBeNull();
  });

  test("delivers press and repeat with the same public shape", () => {
    const expected = {
      type: "key",
      key: { name: "up", ...noModifiers, ctrl: true },
    };
    expect(projectPublicInputEvent(fact("\x1b[1;5:1A"))).toEqual(expected);
    expect(projectPublicInputEvent(fact("\x1b[1;5:2A"))).toEqual(expected);
  });
});
