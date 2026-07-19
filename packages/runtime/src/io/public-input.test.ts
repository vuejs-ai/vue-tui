import { describe, expect, test } from "vite-plus/test";
import type { InternalInputRouteDecision } from "./input-route-policy.ts";
import { normalizeInputEvent, type NormalizedInputFact } from "./normalized-input.ts";
import { normalizeInputHandlerResult, projectPublicInputEvent } from "./public-input.ts";

function fact(event: string | { readonly paste: string }): NormalizedInputFact {
  const result = normalizeInputEvent(event);
  if (!result) throw new Error(`Expected an input fact for ${JSON.stringify(event)}`);
  return result;
}

describe("public input projection", () => {
  test("projects insertion-ready text and opaque paste as immutable facts", () => {
    const plainFact = fact("Hello 😀");
    const plain = projectPublicInputEvent(plainFact);
    expect(plain).toEqual({ kind: "text", text: "Hello 😀" });
    expect(Object.isFrozen(plain)).toBe(true);
    expect(projectPublicInputEvent(plainFact)).toBe(plain);

    expect(projectPublicInputEvent(fact("\x1b[0;;229u"))).toEqual({
      kind: "text",
      text: "å",
    });
    expect(projectPublicInputEvent(fact("\x1b[97:65;2;65u"))).toEqual({
      kind: "text",
      text: "A",
    });

    const payload = "\x03\x1b[A\x1b[?31u";
    const paste = projectPublicInputEvent(fact({ paste: payload }));
    expect(paste).toEqual({ kind: "paste", text: payload });
    expect(Object.isFrozen(paste)).toBe(true);
  });

  test.each([
    ["carriage return", "\r", "enter"],
    ["line feed", "\n", "enter"],
    ["Kitty return", "\x1b[13u", "enter"],
    ["keypad Enter", "\x1b[57414u", "enter"],
    ["Tab", "\t", "tab"],
    ["Backspace", "\x7f", "backspace"],
    ["Escape", "\x1b", "escape"],
    ["Up", "\x1b[A", "up"],
    ["keypad Down", "\x1b[57420u", "down"],
    ["keypad Left", "\x1b[57417u", "left"],
    ["Right", "\x1b[C", "right"],
    ["Home", "\x1b[H", "home"],
    ["keypad End", "\x1b[57424u", "end"],
    ["Page Up", "\x1b[5~", "page-up"],
    ["keypad Page Down", "\x1b[57422u", "page-down"],
    ["Delete", "\x1b[3~", "delete"],
    ["keypad Delete", "\x1b[57426u", "delete"],
  ] as const)("normalizes the supported %s identity", (_label, sequence, name) => {
    const event = projectPublicInputEvent(fact(sequence));
    expect(event).toEqual({
      kind: "key",
      name,
      shift: false,
      alt: false,
      ctrl: false,
    });
    expect(Object.isFrozen(event)).toBe(true);
  });

  test("projects shortcut characters without exposing parser details", () => {
    expect(projectPublicInputEvent(fact("\x03"))).toEqual({
      kind: "key",
      character: "c",
      shift: false,
      alt: false,
      ctrl: true,
    });
    expect(projectPublicInputEvent(fact("\x1bA"))).toEqual({
      kind: "key",
      character: "a",
      shift: true,
      alt: true,
      ctrl: false,
    });
    expect(projectPublicInputEvent(fact("\x1b1"))).toEqual({
      kind: "key",
      character: "1",
      shift: false,
      alt: true,
      ctrl: false,
    });
    expect(projectPublicInputEvent(fact("\x1b[97:65:99;6:2;65u"))).toEqual({
      kind: "key",
      character: "c",
      shift: true,
      alt: false,
      ctrl: true,
    });
    expect(projectPublicInputEvent(fact("\x1b[65;5u"))).toEqual({
      kind: "key",
      character: "a",
      shift: false,
      alt: false,
      ctrl: true,
    });
    expect(projectPublicInputEvent(fact("\x1b[229;5u"))).toEqual({
      kind: "key",
      character: "å",
      shift: false,
      alt: false,
      ctrl: true,
    });
  });

  test.each([
    ["pure-text release", "\x1b[0;1:3;229u", "text"],
    ["key release", "\x1b[99;5:3u", "key"],
    ["function key", "\x1bOP", "key"],
    ["Insert", "\x1b[2~", "key"],
    ["Clear", "\x1b[E", "key"],
    ["media key", "\x1b[57430u", "key"],
    ["standalone modifier", "\x1b[57441u", "key"],
    ["unknown private key", "\x1b[58000u", "key"],
    ["Kitty Meta chord", "\x1b[97;33u", "key"],
    ["Kitty Super chord", "\x1b[97;9u", "key"],
    ["Kitty Hyper chord", "\x1b[97;17u", "key"],
    ["legacy explicit Meta chord", "\x1b[1;33A", "key"],
    ["legacy Super chord", "\x1b[1;9A", "key"],
    ["legacy Hyper chord", "\x1b[1;17A", "key"],
    ["uninterpreted sequence", "\x1b[?25h", "uninterpreted"],
    ["pointer report", "\x1b[<0;4;5M", "pointer"],
  ] as const)("drops a %s fact", (_label, sequence, expectedInternalKind) => {
    const inputFact = fact(sequence);
    expect(inputFact.kind).toBe(expectedInternalKind);
    expect(projectPublicInputEvent(inputFact)).toBeNull();
  });

  test("delivers press and repeat with the same public shape", () => {
    expect(projectPublicInputEvent(fact("\x1b[1;5:1A"))).toEqual({
      kind: "key",
      name: "up",
      shift: false,
      alt: false,
      ctrl: true,
    });
    expect(projectPublicInputEvent(fact("\x1b[1;5:2A"))).toEqual({
      kind: "key",
      name: "up",
      shift: false,
      alt: false,
      ctrl: true,
    });
  });
});

describe("public input handler result", () => {
  const continued: InternalInputRouteDecision = {
    performed: false,
    continue: true,
    preventDefault: false,
    blockExternal: false,
  };
  const prevented: InternalInputRouteDecision = {
    performed: false,
    continue: true,
    preventDefault: true,
    blockExternal: false,
  };

  test("maps the two supported results without controlling routing or external delivery", () => {
    expect(normalizeInputHandlerResult(undefined)).toEqual(continued);
    expect(normalizeInputHandlerResult({ preventDefault: true })).toEqual(prevented);
    expect(Object.isFrozen(normalizeInputHandlerResult(undefined))).toBe(true);
    expect(Object.isFrozen(normalizeInputHandlerResult({ preventDefault: true }))).toBe(true);
  });

  test("reads the exact preventDefault field once", () => {
    let reads = 0;
    const result = {};
    Object.defineProperty(result, "preventDefault", {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        return true;
      },
    });

    expect(normalizeInputHandlerResult(result)).toEqual(prevented);
    expect(reads).toBe(1);
  });

  test.each([
    null,
    false,
    0,
    "continue",
    "consume",
    Promise.resolve(undefined),
    [],
    {},
    { preventDefault: false },
    { preventDefault: true, extra: true },
    Object.create({ preventDefault: true }),
    Object.assign(Object.create(null), { preventDefault: true }),
    new (class Result {
      preventDefault = true;
    })(),
    { preventDefault: true, [Symbol("extra")]: true },
  ])("rejects an invalid synchronous result: %j", (result) => {
    expect(() => normalizeInputHandlerResult(result)).toThrow(
      new TypeError(
        "useInput() handlers must synchronously return undefined or the exact object { preventDefault: true }.",
      ),
    );
  });
});
