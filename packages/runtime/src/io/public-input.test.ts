import { describe, expect, test } from "vite-plus/test";
import type { InternalInputRouteDecision } from "./input-route-policy.ts";
import { normalizeInputEvent, type NormalizedInputFact } from "./normalized-input.ts";
import {
  normalizeInputHandlerResult,
  projectPublicInputEvent,
  type InputRouteDecision,
} from "./public-input.ts";

function fact(event: string | { readonly paste: string }): NormalizedInputFact {
  const result = normalizeInputEvent(event);
  if (!result) throw new Error(`Expected an input fact for ${JSON.stringify(event)}`);
  return result;
}

describe("public input projection", () => {
  test("projects legacy keys with explicit nulls and immutable nested data", () => {
    const projected = projectPublicInputEvent(fact("\x03"));

    expect(projected).toEqual({
      kind: "key",
      sequence: "\x03",
      fidelity: "normalized-utf8-sequence",
      key: {
        protocol: "legacy",
        name: "c",
        code: null,
        primaryCodepoint: null,
        shiftedCodepoint: null,
        baseLayoutCodepoint: null,
        functionalCode: null,
        modifiers: {
          shift: false,
          alt: false,
          ctrl: true,
          super: false,
          hyper: false,
          meta: false,
          capsLock: false,
          numLock: false,
        },
        phase: null,
        printable: true,
        reportedText: null,
      },
    });
    if (projected?.kind !== "key") throw new Error("Expected a key event");
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.key)).toBe(true);
    expect(Object.isFrozen(projected.key.modifiers)).toBe(true);
  });

  test("preserves rich Kitty key, text, paste, and uninterpreted facts", () => {
    expect(projectPublicInputEvent(fact("\x1b[97:65:99;6:2;65u"))).toMatchObject({
      kind: "key",
      sequence: "\x1b[97:65:99;6:2;65u",
      fidelity: "normalized-utf8-sequence",
      key: {
        protocol: "kitty",
        name: "a",
        code: null,
        primaryCodepoint: 97,
        shiftedCodepoint: 65,
        baseLayoutCodepoint: 99,
        functionalCode: null,
        phase: "repeat",
        reportedText: "A",
      },
    });
    expect(projectPublicInputEvent(fact("hello"))).toEqual({
      kind: "text",
      sequence: "hello",
      fidelity: "normalized-utf8-sequence",
      text: "hello",
      protocol: "plain",
      phase: null,
      primaryCodepoint: null,
      textOrigin: null,
    });
    expect(projectPublicInputEvent(fact("\x1b[0;1:3;229u"))).toEqual({
      kind: "text",
      sequence: "\x1b[0;1:3;229u",
      fidelity: "normalized-utf8-sequence",
      text: "å",
      protocol: "kitty",
      phase: "release",
      primaryCodepoint: 0,
      textOrigin: "reported",
    });

    const pasteText = "\x03\x1b[A\x1b[?31u";
    expect(projectPublicInputEvent(fact({ paste: pasteText }))).toEqual({
      kind: "paste",
      sequence: `\x1b[200~${pasteText}\x1b[201~`,
      fidelity: "normalized-utf8-sequence",
      text: pasteText,
    });
    expect(projectPublicInputEvent(fact("\x1b[?25h"))).toEqual({
      kind: "uninterpreted",
      sequence: "\x1b[?25h",
      fidelity: "normalized-utf8-sequence",
    });
  });

  test("caches one public object per fact and excludes pointer facts", () => {
    const inputFact = fact("a");
    expect(projectPublicInputEvent(inputFact)).toBe(projectPublicInputEvent(inputFact));
    expect(projectPublicInputEvent(fact("\x1b[<0;4;5M"))).toBeNull();
  });
});

describe("public input handler result", () => {
  const continued: InternalInputRouteDecision = {
    performed: false,
    continue: true,
    preventDefault: false,
    blockExternal: false,
  };
  const consumed: InternalInputRouteDecision = {
    performed: true,
    continue: false,
    preventDefault: true,
    blockExternal: true,
  };

  test("expands the two shorthand results", () => {
    expect(normalizeInputHandlerResult("continue")).toEqual(continued);
    expect(normalizeInputHandlerResult("consume")).toEqual(consumed);
  });

  test("maps every complete result field independently", () => {
    const values = [false, true] as const;
    for (const action of values) {
      for (const stop of values) {
        for (const prevent of values) {
          for (const block of values) {
            const result: InputRouteDecision = {
              action: action ? "performed" : "none",
              routing: stop ? "stop" : "continue",
              defaultAction: prevent ? "prevent" : "allow",
              external: block ? "block" : "allow",
            };
            expect(normalizeInputHandlerResult(result)).toEqual({
              performed: action,
              continue: !stop,
              preventDefault: prevent,
              blockExternal: block,
            });
          }
        }
      }
    }
  });

  test("accepts structurally complete decisions with additional or inherited fields", () => {
    const withExtra = {
      action: "performed",
      routing: "continue",
      defaultAction: "prevent",
      external: "allow",
      debug: true,
    } as const;
    const inherited = Object.create({
      action: "none",
      routing: "stop",
      defaultAction: "allow",
      external: "block",
    }) as InputRouteDecision;

    expect(normalizeInputHandlerResult(withExtra)).toEqual({
      performed: true,
      continue: true,
      preventDefault: true,
      blockExternal: false,
    });
    expect(normalizeInputHandlerResult(inherited)).toEqual({
      performed: false,
      continue: false,
      preventDefault: false,
      blockExternal: true,
    });
  });

  test.each([
    undefined,
    null,
    "unknown",
    1,
    Promise.resolve("continue"),
    {},
    { action: "none", routing: "continue", defaultAction: "allow" },
    { action: "acted", routing: "continue", defaultAction: "allow", external: "allow" },
  ])("rejects an invalid synchronous result: %j", (result) => {
    expect(() => normalizeInputHandlerResult(result)).toThrow(TypeError);
  });
});
