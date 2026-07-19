import { describe, expect, test } from "vite-plus/test";
import { PassThrough } from "node:stream";
import { normalizeInputEvent, type NormalizedInputFact } from "./normalized-input.ts";
import { getSharedStdinIngress } from "./stdin-ingress.ts";

function fact(event: string | { readonly paste: string }): NormalizedInputFact {
  const result = normalizeInputEvent(event);
  expect(result).toBeDefined();
  return result!;
}

describe("normalizeInputEvent", () => {
  test("keeps a plain UTF-8 run as text without inventing physical key facts", () => {
    expect(fact("hello")).toEqual({
      kind: "text",
      sequence: "hello",
      text: "hello",
      protocol: "plain",
      phase: undefined,
      primaryCodepoint: undefined,
      textOrigin: undefined,
    });
    expect(fact("A")).toEqual({
      kind: "text",
      sequence: "A",
      text: "A",
      protocol: "plain",
      phase: undefined,
      primaryCodepoint: undefined,
      textOrigin: undefined,
    });
  });

  test("normalizes legacy control and escape sequences without inventing a phase", () => {
    expect(fact("\x03")).toMatchObject({
      kind: "key",
      sequence: "\x03",
      key: {
        protocol: "legacy",
        name: "c",
        phase: undefined,
        modifiers: { ctrl: true },
      },
    });
    expect(fact("\x1b[1;5A")).toMatchObject({
      kind: "key",
      sequence: "\x1b[1;5A",
      key: {
        protocol: "legacy",
        name: "up",
        code: "[A",
        phase: undefined,
        modifiers: { ctrl: true },
      },
    });
    expect(fact("\x1bOP")).toMatchObject({
      kind: "key",
      key: { protocol: "legacy", name: "f1", code: "OP" },
    });
  });

  test("preserves exact legacy CSI modifiers and rejects unsafe values", () => {
    expect(fact("\x1b[1;3A")).toMatchObject({
      kind: "key",
      key: { modifiers: { alt: true, meta: false } },
    });
    expect(fact("\x1b[1;9A")).toMatchObject({
      kind: "key",
      key: { modifiers: { super: true } },
    });
    expect(fact("\x1b[1;17A")).toMatchObject({
      kind: "key",
      key: { modifiers: { hyper: true } },
    });
    expect(fact("\x1b[1;33A")).toMatchObject({
      kind: "key",
      key: { modifiers: { meta: true, alt: false } },
    });

    for (const sequence of [
      "\x1b[1;0A",
      "\x1b[1;9007199254740993A",
      `\x1b[1;${"9".repeat(400)}A`,
    ]) {
      expect(fact(sequence)).toEqual({ kind: "uninterpreted", sequence });
    }
  });

  test("keeps an unknown complete terminal sequence uninterpreted", () => {
    expect(fact("\x1b[?25h")).toEqual({
      kind: "uninterpreted",
      sequence: "\x1b[?25h",
    });
  });

  test("preserves Kitty alternate keys, independent modifiers, phase, and reported text", () => {
    expect(fact("\x1b[97:65:99;6:2;65u")).toEqual({
      kind: "key",
      sequence: "\x1b[97:65:99;6:2;65u",
      key: {
        protocol: "kitty",
        name: "a",
        primaryCodepoint: 97,
        shiftedCodepoint: 65,
        baseLayoutCodepoint: 99,
        modifiers: {
          shift: true,
          alt: false,
          ctrl: true,
          super: false,
          hyper: false,
          meta: false,
          capsLock: false,
          numLock: false,
        },
        phase: "repeat",
        printable: true,
        text: { value: "A", origin: "reported" },
      },
    });

    expect(fact("\x1b[97;3u")).toMatchObject({
      kind: "key",
      key: { modifiers: { alt: true, meta: false } },
    });
    expect(fact("\x1b[97;33u")).toMatchObject({
      kind: "key",
      key: { modifiers: { alt: false, meta: true } },
    });
  });

  test("preserves a base-layout-only Kitty alternate key", () => {
    expect(fact("\x1b[1089::99;5u")).toMatchObject({
      kind: "key",
      key: {
        primaryCodepoint: 1089,
        shiftedCodepoint: undefined,
        baseLayoutCodepoint: 99,
        modifiers: { ctrl: true },
      },
    });
  });

  test("normalizes a Kitty pure-text event without inventing a key", () => {
    expect(fact("\x1b[0;;229u")).toEqual({
      kind: "text",
      sequence: "\x1b[0;;229u",
      text: "å",
      protocol: "kitty",
      phase: "press",
      primaryCodepoint: 0,
      textOrigin: "reported",
    });
  });

  test("preserves a Kitty pure-text phase in the fact", () => {
    const inputFact = fact("\x1b[0;1:3;229u");
    expect(inputFact).toMatchObject({
      kind: "text",
      protocol: "kitty",
      phase: "release",
      primaryCodepoint: 0,
      textOrigin: "reported",
    });
  });

  test("preserves known and unknown Kitty functional key identity", () => {
    expect(fact("\x1b[57376u")).toMatchObject({
      kind: "key",
      key: { name: "f13", primaryCodepoint: 57376, printable: false },
    });
    expect(fact("\x1b[57399u")).toMatchObject({
      kind: "key",
      key: { name: "kp0", primaryCodepoint: 57399, printable: false },
    });
    expect(fact("\x1b[57430u")).toMatchObject({
      kind: "key",
      key: { name: "mediaplaypause", primaryCodepoint: 57430, printable: false },
    });
    expect(fact("\x1b[58000u")).toMatchObject({
      kind: "key",
      key: { name: undefined, primaryCodepoint: 58000, printable: false },
    });
  });

  test.each([
    "\x1b[97;1:4u",
    "\x1b[97;0u",
    "\x1b[97;u",
    "\x1b[97;:2u",
    "\x1b[2;1:1A",
    "\x1b[55296u",
    "\x1b[1114112u",
    "\x1b[97;1:1;3u",
    `\x1b[${"9".repeat(400)};1:1~`,
    "\x1b[9007199254740993;1:1~",
    `\x1b[<${"9".repeat(400)};1;1M`,
    "\x1b[<0;9007199254740993;1M",
  ])("keeps invalid protocol input uninterpreted: %j", (sequence) => {
    expect(fact(sequence)).toEqual({ kind: "uninterpreted", sequence });
  });

  test("normalizes large valid Kitty associated text without exceeding the call stack", () => {
    const textCodepoints = Array.from({ length: 125_000 }, () => "65").join(":");
    const inputFact = fact(`\x1b[97;1:1;${textCodepoints}u`);
    expect(inputFact).toMatchObject({
      kind: "key",
      key: { text: { origin: "reported" } },
    });
    if (inputFact.kind !== "key") throw new Error("expected a key fact");
    expect(inputFact.key.text?.value).toHaveLength(125_000);
  });

  test("drops a framework-owned Kitty query response", () => {
    expect(normalizeInputEvent("\x1b[?31u")).toBeUndefined();
  });

  test("keeps paste boundaries and never reclassifies its payload", () => {
    const text = "\x03\x1b[A\x1b[<64;2;3M\x1b[?31u";
    expect(fact({ paste: text })).toEqual({
      kind: "paste",
      sequence: `\x1b[200~${text}\x1b[201~`,
      text,
    });
  });

  test("keeps the complete SGR pointer report even when its action is unsupported", () => {
    expect(fact("\x1b[<66;4;5M")).toMatchObject({
      kind: "pointer",
      sequence: "\x1b[<66;4;5M",
      pointer: {
        protocol: "sgr",
        wireButton: 66,
        x: 4,
        y: 5,
        final: "M",
        event: { type: "wheel", direction: "left" },
      },
    });
    expect(fact("\x1b[<3;4;5M")).toMatchObject({
      kind: "pointer",
      pointer: { wireButton: 3, event: undefined },
    });
    expect(fact("\x1b[<4294967296;4;5M")).toMatchObject({
      kind: "pointer",
      pointer: { wireButton: 4_294_967_296, event: undefined },
    });
  });
});

describe("shared stdin normalization", () => {
  const collect = (chunks: Array<string | Uint8Array>): NormalizedInputFact[] => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const facts: NormalizedInputFact[] = [];
    const subscription = getSharedStdinIngress(stdin).subscribe(
      () => undefined,
      (inputFact) => facts.push(inputFact),
    );
    subscription.setActive(true);
    for (const chunk of chunks) stdin.emit("data", chunk);
    subscription.dispose();
    stdin.destroy();
    return facts;
  };

  test("multicasts the same once-normalized fact object to every application", () => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const ingress = getSharedStdinIngress(stdin);
    const first: NormalizedInputFact[] = [];
    const second: NormalizedInputFact[] = [];
    const firstSubscription = ingress.subscribe(
      () => undefined,
      (inputFact) => first.push(inputFact),
    );
    const secondSubscription = ingress.subscribe(
      () => undefined,
      (inputFact) => second.push(inputFact),
    );
    firstSubscription.setActive(true);
    secondSubscription.setActive(true);

    stdin.emit("data", Buffer.from("a"));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toBe(second[0]);
    firstSubscription.dispose();
    secondSubscription.dispose();
    stdin.destroy();
  });

  test("disposing an application removes its unresolved Kitty query tombstones", () => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const ingress = getSharedStdinIngress(stdin);
    const subscription = ingress.subscribe(
      () => undefined,
      () => {},
    );
    const cancel = ingress.startKittyQueryResponseDetection(() => {}, subscription);

    cancel();
    expect(stdin.listenerCount("data")).toBe(1);

    subscription.dispose();
    expect(stdin.listenerCount("data")).toBe(0);
    stdin.destroy();
  });

  test("keeps batched text and C0 controls as separate semantic facts", () => {
    const facts = collect(["a\x03\t\r"]);
    expect(facts.map((inputFact) => inputFact.kind)).toEqual(["text", "key", "key", "key"]);
    expect(facts[1]).toMatchObject({
      kind: "key",
      key: { name: "c", modifiers: { ctrl: true } },
    });
  });

  test("does not claim byte provenance after invalid UTF-8 replacement", () => {
    const invalidSource = collect([Uint8Array.from([0x80])]);
    const canonicalReplacement = collect([Uint8Array.from([0xef, 0xbf, 0xbd])]);

    expect(invalidSource).toEqual(canonicalReplacement);
    expect(invalidSource).toEqual([
      {
        kind: "text",
        sequence: "�",
        text: "�",
        protocol: "plain",
        phase: undefined,
        primaryCodepoint: undefined,
        textOrigin: undefined,
      },
    ]);
    // An external owner can honestly receive the normalized Unicode sequence,
    // but the fact alone cannot tell whether its original bytes were 80 or the
    // valid UTF-8 EF BF BD. Byte-exact forwarding needs ingress provenance.
    expect(Buffer.from(invalidSource[0]!.sequence)).toEqual(Buffer.from([0xef, 0xbf, 0xbd]));
  });

  test.each([
    {
      title: "Kitty key",
      whole: ["\x1b[97:65:99;6:2;65u"],
      split: ["\x1b[97:", "65:99;6:", "2;65u"],
    },
    {
      title: "bracketed paste",
      whole: ["\x1b[200~a\x03\x1b[A\x1b[201~"],
      split: ["\x1b[20", "0~a\x03", "\x1b[A\x1b[20", "1~"],
    },
    {
      title: "SGR pointer",
      whole: ["\x1b[<66;4;5M"],
      split: ["\x1b[<", "66;4;", "5M"],
    },
    {
      title: "UTF-8 scalar",
      whole: [Buffer.from("😀")],
      split: [Buffer.from([0xf0]), Buffer.from([0x9f, 0x98]), Buffer.from([0x80])],
    },
  ])("produces the same $title fact across chunk boundaries", ({ whole, split }) => {
    expect(collect(split)).toEqual(collect(whole));
  });
});
