import { describe, test, expect } from "vite-plus/test";
import { sanitizeAnsi } from "./sanitize-ansi.ts";

// Minimal ANSI-stripping helper for test assertions (avoids strip-ansi dep).
function stripAnsi(s: string): string {
  return s.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:[:;][0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|[\u001b\u009d]\].*?(?:\u0007|\u001b\\|\u009c)|[\u001b\u0098][\s\S]*?(?:\u0007|\u001b\\|\u009c)|[\u0080-\u009f]/g,
    "",
  );
}

describe("sanitize-ansi", () => {
  test("preserves SGR (color) sequences", () => {
    expect(sanitizeAnsi("\u001b[31mred\u001b[0m")).toBe("\u001b[31mred\u001b[0m");
  });

  test("preserve SGR sequences (colon-form 24-bit color)", () => {
    const output = sanitizeAnsi("A\u001b[38:2::255:100:0mcolor\u001b[0mB");

    expect(output).toContain("\u001b[38:2::255:100:0m");
    expect(stripAnsi(output)).toBe("AcolorB");
  });

  test("strips cursor movement", () => {
    expect(sanitizeAnsi("\u001b[2Ahello")).toBe("hello");
  });

  test("strips screen clearing", () => {
    expect(sanitizeAnsi("\u001b[2Jhello")).toBe("hello");
  });

  test("preserves OSC (hyperlinks)", () => {
    const link = "\u001b]8;;https://example.com\u0007click\u001b]8;;\u0007";
    expect(sanitizeAnsi(link)).toBe(link);
  });

  test("preserve OSC hyperlinks (ESC-ST terminated)", () => {
    const output = sanitizeAnsi("\u001b]8;;https://example.com\u001b\\link\u001b]8;;\u001b\\");

    expect(output).toContain("\u001b]8;;https://example.com");
    expect(stripAnsi(output)).toBe("link");
  });

  test("passes through plain text unchanged", () => {
    expect(sanitizeAnsi("hello world")).toBe("hello world");
  });

  // --- Ink parity tests below ---

  test("preserve OSC hyperlinks terminated by C1 ST", () => {
    const output = sanitizeAnsi("\u001b]8;;https://example.com\u009clink\u001b]8;;\u009c");

    expect(output).toContain("\u001b]8;;https://example.com\u009c");
    expect(stripAnsi(output)).toBe("link");
  });

  test("preserve C1 OSC hyperlinks terminated by C1 ST", () => {
    const input = "\u009d8;;https://example.com\u009clink\u009d8;;\u009c";
    const output = sanitizeAnsi(input);

    expect(output).toContain("\u009d8;;https://example.com\u009c");
    expect(output).toBe(input);
  });

  test("preserve C1 OSC hyperlinks terminated by ESC ST", () => {
    const input = "\u009d8;;https://example.com\u001b\\link\u009d8;;\u001b\\";
    const output = sanitizeAnsi(input);

    expect(output).toContain("\u009d8;;https://example.com\u001b\\");
    expect(output).toBe(input);
  });

  test("preserve C1 OSC hyperlinks terminated by BEL", () => {
    const input = "\u009d8;;https://example.com\u0007link\u009d8;;\u0007";
    const output = sanitizeAnsi(input);

    expect(output).toContain("\u009d8;;https://example.com\u0007");
    expect(output).toBe(input);
  });

  test("strip non-SGR CSI sequences as complete units", () => {
    const output = sanitizeAnsi("A\u001b[>4;2mB\u001b[2 qC");

    expect(output).not.toContain("4;2m");
    expect(output).not.toContain(" q");
    expect(stripAnsi(output)).toBe("ABC");
  });

  test("strip C1 non-SGR CSI sequences as complete units", () => {
    const output = sanitizeAnsi("A\u009b>4;2mB\u009b2 qC");

    expect(output).not.toContain("4;2m");
    expect(output).not.toContain(" q");
    expect(stripAnsi(output)).toBe("ABC");
  });

  test("preserve C1 SGR CSI sequences", () => {
    const output = sanitizeAnsi("A\u009b31mgreen\u009b0mB");

    expect(output).toContain("\u009b31m");
    expect(stripAnsi(output)).toBe("AgreenB");
  });

  test("strip private-parameter m-sequences that are not SGR", () => {
    const output = sanitizeAnsi("A\u001b[>4;2mB");

    expect(output).not.toContain("\u001b[>4;2m");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip tmux DCS passthrough wrappers with escaped ST payload terminators", () => {
    const wrappedHyperlinkStart =
      "\u001bPtmux;\u001b\u001b]8;;https://example.com\u001b\u001b\\\u001b\\";
    const wrappedHyperlinkEnd = "\u001bPtmux;\u001b\u001b]8;;\u001b\u001b\\\u001b\\";
    const output = sanitizeAnsi(`${wrappedHyperlinkStart}link${wrappedHyperlinkEnd}`);

    expect(output).not.toContain("tmux;");
    expect(output).not.toContain("\u001bP");
    expect(stripAnsi(output)).toBe("link");
  });

  test("strip incomplete DCS passthrough sequences to avoid payload leaks", () => {
    const output = sanitizeAnsi("A\u001bPtmux;\u001blink");

    expect(output).not.toContain("tmux;");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip DCS control strings with BEL in payload until ST terminator", () => {
    const output = sanitizeAnsi("A\u001bPpayload\u0007still-payload\u001b\\B");

    expect(output).not.toContain("payload");
    expect(output).not.toContain("still-payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip ESC SOS control strings as complete units", () => {
    const output = sanitizeAnsi("A\u001bXpayload\u001b\\B");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip ESC SOS control strings with C1 ST terminator", () => {
    const output = sanitizeAnsi("A\u001bXpayload\u009cB");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip C1 SOS control strings as complete units with C1 ST terminator", () => {
    const output = sanitizeAnsi("A\u0098payload\u009cB");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip C1 SOS control strings as complete units with ESC ST terminator", () => {
    const output = sanitizeAnsi("A\u0098payload\u001b\\B");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip ESC SOS with BEL terminator as malformed control string", () => {
    const output = sanitizeAnsi("A\u001bXpayload\u0007B");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip C1 SOS with BEL terminator as malformed control string", () => {
    const output = sanitizeAnsi("A\u0098payload\u0007B");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip incomplete ESC SOS control strings to avoid payload leaks", () => {
    const output = sanitizeAnsi("A\u001bXpayload");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip incomplete C1 SOS control strings to avoid payload leaks", () => {
    const output = sanitizeAnsi("A\u0098payload");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip SOS with escaped ESC in payload until final ST terminator", () => {
    const output = sanitizeAnsi("A\u001bXfoo\u001b\u001b\\bar\u001b\\B");

    expect(output).not.toContain("foo");
    expect(output).not.toContain("bar");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("preserve SGR around stripped SOS control strings", () => {
    const output = sanitizeAnsi("A\u001b[31mR\u001b[0m\u001bXpayload\u001b\\B");

    expect(output).toContain("\u001b[31m");
    expect(output).toContain("\u001b[0m");
    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("ARB");
  });

  test("strip ESC ST sequences", () => {
    const output = sanitizeAnsi("A\u001b\\B");

    expect(output).not.toContain("\u001b\\");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip malformed ESC control sequences with intermediates and non-final bytes", () => {
    const output = sanitizeAnsi("A\u001b#\u0007payload");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip incomplete CSI after preserving prior SGR content", () => {
    const output = sanitizeAnsi("A\u001b[31mB\u001b[");

    expect(output).toContain("\u001b[31m");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip standalone ST bytes", () => {
    const output = sanitizeAnsi("A\u009cB");

    expect(output).not.toContain("\u009c");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip standalone C1 control characters", () => {
    const output = sanitizeAnsi("A\u0085B\u008eC");

    expect(output).not.toContain("\u0085");
    expect(output).not.toContain("\u008e");
    expect(stripAnsi(output)).toBe("ABC");
  });
});
