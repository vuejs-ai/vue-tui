import { describe, expect, test } from "vite-plus/test";
import { hasAnsiControlCharacters, tokenizeAnsi } from "./ansi-tokenizer.ts";

describe("ansi-tokenizer", () => {
  test("detects ANSI control characters", () => {
    expect(hasAnsiControlCharacters("hello")).toBe(false);
    expect(hasAnsiControlCharacters("\x1b[31mhello\x1b[0m")).toBe(true);
    expect(hasAnsiControlCharacters("\x1b[2Ahello")).toBe(true);
  });

  test("tokenizes plain text", () => {
    const tokens = tokenizeAnsi("hello");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.type).toBe("text");
    expect(tokens[0]!.value).toBe("hello");
  });

  test("tokenizes SGR sequences", () => {
    const tokens = tokenizeAnsi("\x1b[31mhello\x1b[0m");
    expect(tokens[0]!.type).toBe("csi");
    expect(tokens[0]!.value).toBe("\x1b[31m");
    expect(tokens[1]!.type).toBe("text");
    expect(tokens[1]!.value).toBe("hello");
    expect(tokens[2]!.type).toBe("csi");
    expect(tokens[2]!.value).toBe("\x1b[0m");
  });

  test("tokenizes cursor movement (CSI with non-m final)", () => {
    const tokens = tokenizeAnsi("\x1b[2Ahello");
    expect(tokens[0]!.type).toBe("csi");
    expect((tokens[0] as any).finalCharacter).toBe("A");
    expect(tokens[1]!.type).toBe("text");
    expect(tokens[1]!.value).toBe("hello");
  });

  test("tokenizes OSC sequences", () => {
    const tokens = tokenizeAnsi("\x1b]8;;https://example.com\x07click\x1b]8;;\x07");
    const oscTokens = tokens.filter((t) => t.type === "osc");
    expect(oscTokens.length).toBe(2);
  });

  test("handles C1 control characters", () => {
    const tokens = tokenizeAnsi("\x9b31mhello"); // C1 CSI
    expect(tokens[0]!.type).toBe("csi");
  });

  test("returns empty for empty string", () => {
    const tokens = tokenizeAnsi("");
    expect(tokens).toHaveLength(0);
  });
});
