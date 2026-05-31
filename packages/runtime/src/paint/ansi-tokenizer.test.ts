import { describe, expect, test } from "vite-plus/test";
import { hasAnsiControlCharacters, tokenizeAnsi } from "./ansi-tokenizer.ts";

describe("ansi-tokenizer", () => {
  test("detects ANSI control characters", () => {
    expect(hasAnsiControlCharacters("hello")).toBe(false);
    expect(hasAnsiControlCharacters("\u001B[31mhello\u001B[0m")).toBe(true);
    expect(hasAnsiControlCharacters("\u001B[2Ahello")).toBe(true);
  });

  test("tokenizes plain text", () => {
    const tokens = tokenizeAnsi("hello");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.type).toBe("text");
    expect(tokens[0]!.value).toBe("hello");
  });

  test("tokenizes SGR sequences", () => {
    const tokens = tokenizeAnsi("\u001B[31mhello\u001B[0m");
    expect(tokens[0]!.type).toBe("csi");
    expect(tokens[0]!.value).toBe("\u001B[31m");
    expect(tokens[1]!.type).toBe("text");
    expect(tokens[1]!.value).toBe("hello");
    expect(tokens[2]!.type).toBe("csi");
    expect(tokens[2]!.value).toBe("\u001B[0m");
  });

  test("tokenizes cursor movement (CSI with non-m final)", () => {
    const tokens = tokenizeAnsi("\u001B[2Ahello");
    expect(tokens[0]!.type).toBe("csi");
    expect((tokens[0] as any).finalCharacter).toBe("A");
    expect(tokens[1]!.type).toBe("text");
    expect(tokens[1]!.value).toBe("hello");
  });

  test("tokenizes OSC sequences", () => {
    const tokens = tokenizeAnsi("\u001B]8;;https://example.com\u0007click\u001B]8;;\u0007");
    const oscTokens = tokens.filter((t) => t.type === "osc");
    expect(oscTokens.length).toBe(2);
  });

  test("handles C1 control characters", () => {
    const tokens = tokenizeAnsi("\u009B31mhello"); // C1 CSI
    expect(tokens[0]!.type).toBe("csi");
  });

  test("empty string returns a single empty text token (Ink parity)", () => {
    // Ink's tokenizeAnsi('') falls through to the no-control-chars branch and
    // returns [{type:'text', value:''}] — it has no empty-string early return.
    const tokens = tokenizeAnsi("");
    expect(tokens).toEqual([{ type: "text", value: "" }]);
  });

  // --- Ink parity tests ---

  test("tokenize plain text", () => {
    expect(tokenizeAnsi("hello")).toEqual([{ type: "text", value: "hello" }]);
  });

  test("tokenize ESC CSI SGR sequence", () => {
    const tokens = tokenizeAnsi("A\u001B[31mB");

    expect(tokens.map((token) => token.type)).toEqual(["text", "csi", "text"]);
    expect(tokens[0]).toEqual({ type: "text", value: "A" });
    expect(tokens[2]).toEqual({ type: "text", value: "B" });

    const csiToken = tokens[1]!;
    expect(csiToken.type).toBe("csi");
    if (csiToken.type !== "csi") return;

    expect(csiToken.value).toBe("\u001B[31m");
    expect(csiToken.parameterString).toBe("31");
    expect(csiToken.intermediateString).toBe("");
    expect(csiToken.finalCharacter).toBe("m");
  });

  test("tokenize C1 CSI sequence", () => {
    const tokens = tokenizeAnsi("A\u009B2 qB");
    const csiToken = tokens[1]!;

    expect(csiToken.type).toBe("csi");
    if (csiToken.type !== "csi") return;

    expect(csiToken.value).toBe("\u009B2 q");
    expect(csiToken.parameterString).toBe("2");
    expect(csiToken.intermediateString).toBe(" ");
    expect(csiToken.finalCharacter).toBe("q");
  });

  test("tokenize OSC control string with ST terminator", () => {
    const tokens = tokenizeAnsi("A\u001B]8;;https://example.com\u001B\\B");
    const oscToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "osc", "text"]);
    expect(oscToken.type).toBe("osc");
    if (oscToken.type !== "osc") return;

    expect(oscToken.value).toBe("\u001B]8;;https://example.com\u001B\\");
  });

  test("tokenize tmux DCS passthrough as one control string token", () => {
    const tokens = tokenizeAnsi(
      "A\u001BPtmux;\u001B\u001B]8;;https://example.com\u001B\u001B\\\u001B\\B",
    );
    const dcsToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "dcs", "text"]);
    expect(dcsToken.type).toBe("dcs");
    if (dcsToken.type !== "dcs") return;

    expect(dcsToken.value.startsWith("\u001BPtmux;")).toBe(true);
    expect(dcsToken.value.endsWith("\u001B\\")).toBe(true);
  });

  test("tokenize incomplete CSI as invalid and stop", () => {
    const tokens = tokenizeAnsi("A\u001B[");

    expect(tokens).toEqual([
      { type: "text", value: "A" },
      { type: "invalid", value: "\u001B[" },
    ]);
  });

  test("tokenize incomplete ESC intermediate sequence as invalid and stop", () => {
    const tokens = tokenizeAnsi("A\u001B#");

    expect(tokens).toEqual([
      { type: "text", value: "A" },
      { type: "invalid", value: "\u001B#" },
    ]);
  });

  test("ignore lone ESC before non-final byte", () => {
    const tokens = tokenizeAnsi("A\u001B\u0007B");

    expect(tokens).toEqual([
      { type: "text", value: "A" },
      { type: "text", value: "\u0007B" },
    ]);
  });

  test("tokenize ESC ST sequence as ESC token", () => {
    const tokens = tokenizeAnsi("A\u001B\\B");
    const escToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "esc", "text"]);
    expect(escToken.type).toBe("esc");
    if (escToken.type !== "esc") return;

    expect(escToken.value).toBe("\u001B\\");
    expect(escToken.intermediateString).toBe("");
    expect(escToken.finalCharacter).toBe("\\");
  });

  test("tokenize C1 OSC with C1 ST terminator", () => {
    const tokens = tokenizeAnsi("A\u009D8;;https://example.com\u009CB");
    const oscToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "osc", "text"]);
    expect(oscToken.type).toBe("osc");
    if (oscToken.type !== "osc") return;

    expect(oscToken.value).toBe("\u009D8;;https://example.com\u009C");
  });

  test("tokenize C1 OSC with ESC ST terminator", () => {
    const tokens = tokenizeAnsi("A\u009D8;;https://example.com\u001B\\B");
    const oscToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "osc", "text"]);
    expect(oscToken.type).toBe("osc");
    if (oscToken.type !== "osc") return;

    expect(oscToken.value).toBe("\u009D8;;https://example.com\u001B\\");
  });

  test("tokenize C1 SGR CSI sequence", () => {
    const tokens = tokenizeAnsi("A\u009B31mB");
    const csiToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "csi", "text"]);
    expect(csiToken.type).toBe("csi");
    if (csiToken.type !== "csi") return;

    expect(csiToken.value).toBe("\u009B31m");
    expect(csiToken.parameterString).toBe("31");
    expect(csiToken.intermediateString).toBe("");
    expect(csiToken.finalCharacter).toBe("m");
  });

  test("tokenize incomplete C1 CSI as invalid and stop", () => {
    const tokens = tokenizeAnsi("A\u009B31");

    expect(tokens).toEqual([
      { type: "text", value: "A" },
      { type: "invalid", value: "\u009B31" },
    ]);
  });

  test("tokenize incomplete C1 OSC as invalid and stop", () => {
    const tokens = tokenizeAnsi("A\u009D8;;https://example.com");

    expect(tokens).toEqual([
      { type: "text", value: "A" },
      { type: "invalid", value: "\u009D8;;https://example.com" },
    ]);
  });

  test("tokenize DCS with BEL in payload until ST terminator", () => {
    const tokens = tokenizeAnsi("A\u001BPpayload\u0007still-payload\u001B\\B");
    const dcsToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "dcs", "text"]);
    expect(dcsToken.type).toBe("dcs");
    if (dcsToken.type !== "dcs") return;

    expect(dcsToken.value.includes("\u0007")).toBe(true);
    expect(dcsToken.value.endsWith("\u001B\\")).toBe(true);
  });

  test("tokenize C1 OSC control string with BEL terminator", () => {
    const tokens = tokenizeAnsi("A\u009D8;;https://example.com\u0007B");
    const oscToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "osc", "text"]);
    expect(oscToken.type).toBe("osc");
    if (oscToken.type !== "osc") return;

    expect(oscToken.value).toBe("\u009D8;;https://example.com\u0007");
  });

  test("tokenize ESC SOS control string with ST terminator", () => {
    const tokens = tokenizeAnsi("A\u001BXpayload\u001B\\B");
    const sosToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "sos", "text"]);
    expect(sosToken.type).toBe("sos");
    if (sosToken.type !== "sos") return;

    expect(sosToken.value).toBe("\u001BXpayload\u001B\\");
  });

  test("tokenize ESC SOS control string with C1 ST terminator", () => {
    const tokens = tokenizeAnsi("A\u001BXpayload\u009CB");
    const sosToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "sos", "text"]);
    expect(sosToken.type).toBe("sos");
    if (sosToken.type !== "sos") return;

    expect(sosToken.value).toBe("\u001BXpayload\u009C");
  });

  test("tokenize C1 SOS control string with C1 ST terminator", () => {
    const tokens = tokenizeAnsi("A\u0098payload\u009CB");
    const sosToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "sos", "text"]);
    expect(sosToken.type).toBe("sos");
    if (sosToken.type !== "sos") return;

    expect(sosToken.value).toBe("\u0098payload\u009C");
  });

  test("tokenize C1 SOS control string with ESC ST terminator", () => {
    const tokens = tokenizeAnsi("A\u0098payload\u001B\\B");
    const sosToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "sos", "text"]);
    expect(sosToken.type).toBe("sos");
    if (sosToken.type !== "sos") return;

    expect(sosToken.value).toBe("\u0098payload\u001B\\");
  });

  test("tokenize ESC SOS with BEL terminator as invalid and stop", () => {
    const tokens = tokenizeAnsi("A\u001BXpayload\u0007B");

    expect(tokens).toEqual([
      { type: "text", value: "A" },
      { type: "invalid", value: "\u001BXpayload\u0007B" },
    ]);
  });

  test("tokenize C1 SOS with BEL terminator as invalid and stop", () => {
    const tokens = tokenizeAnsi("A\u0098payload\u0007B");

    expect(tokens).toEqual([
      { type: "text", value: "A" },
      { type: "invalid", value: "\u0098payload\u0007B" },
    ]);
  });

  test("tokenize incomplete C1 SOS as invalid and stop", () => {
    const tokens = tokenizeAnsi("A\u0098payload");

    expect(tokens).toEqual([
      { type: "text", value: "A" },
      { type: "invalid", value: "\u0098payload" },
    ]);
  });

  test("tokenize incomplete ESC SOS as invalid and stop", () => {
    const tokens = tokenizeAnsi("A\u001BXpayload");

    expect(tokens).toEqual([
      { type: "text", value: "A" },
      { type: "invalid", value: "\u001BXpayload" },
    ]);
  });

  test("tokenize SOS with escaped ESC in payload until final ST terminator", () => {
    const tokens = tokenizeAnsi("A\u001BXfoo\u001B\u001B\\bar\u001B\\B");
    const sosToken = tokens[1]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "sos", "text"]);
    expect(sosToken.type).toBe("sos");
    if (sosToken.type !== "sos") return;

    expect(sosToken.value.includes("\u001B\u001B\\")).toBe(true);
    expect(sosToken.value.endsWith("\u001B\\")).toBe(true);
  });

  test("tokenize standalone C1 controls as c1 tokens", () => {
    const tokens = tokenizeAnsi("A\u0085B\u008EC");
    const c1Token1 = tokens[1]!;
    const c1Token2 = tokens[3]!;

    expect(tokens.map((token) => token.type)).toEqual(["text", "c1", "text", "c1", "text"]);

    expect(c1Token1.type).toBe("c1");
    if (c1Token1.type !== "c1") return;

    expect(c1Token2.type).toBe("c1");
    if (c1Token2.type !== "c1") return;

    expect(c1Token1.value).toBe("\u0085");
    expect(c1Token2.value).toBe("\u008E");
  });
});
