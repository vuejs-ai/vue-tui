import { describe, test, expect } from "vite-plus/test";
import { sanitizeAnsi } from "./sanitize-ansi.ts";

// Minimal ANSI-stripping helper for test assertions (avoids strip-ansi dep).
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(
    /[][[()#;?]*(?:[0-9]{1,4}(?:[:;][0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|[]\].*?(?:|\\|)|[][\s\S]*?(?:|\\|)|[-]/g,
    "",
  );
}

describe("sanitize-ansi", () => {
  test("preserves SGR (color) sequences", () => {
    expect(sanitizeAnsi("[31mred[0m")).toBe("[31mred[0m");
  });

  test("preserve SGR sequences (colon-form 24-bit color)", () => {
    const output = sanitizeAnsi("A[38:2::255:100:0mcolor[0mB");

    expect(output).toContain("[38:2::255:100:0m");
    expect(stripAnsi(output)).toBe("AcolorB");
  });

  test("strips cursor movement", () => {
    expect(sanitizeAnsi("[2Ahello")).toBe("hello");
  });

  test("strips screen clearing", () => {
    expect(sanitizeAnsi("[2Jhello")).toBe("hello");
  });

  test("preserves OSC (hyperlinks)", () => {
    const link = "]8;;https://example.comclick]8;;";
    expect(sanitizeAnsi(link)).toBe(link);
  });

  test("preserve OSC hyperlinks (ESC-ST terminated)", () => {
    const output = sanitizeAnsi("]8;;https://example.com\\link]8;;\\");

    expect(output).toContain("]8;;https://example.com");
    expect(stripAnsi(output)).toBe("link");
  });

  test("passes through plain text unchanged", () => {
    expect(sanitizeAnsi("hello world")).toBe("hello world");
  });

  // --- Ink parity tests below ---

  test("preserve OSC hyperlinks terminated by C1 ST", () => {
    const output = sanitizeAnsi("]8;;https://example.comlink]8;;");

    expect(output).toContain("]8;;https://example.com");
    expect(stripAnsi(output)).toBe("link");
  });

  test("preserve C1 OSC hyperlinks terminated by C1 ST", () => {
    const input = "8;;https://example.comlink8;;";
    const output = sanitizeAnsi(input);

    expect(output).toContain("8;;https://example.com");
    expect(output).toBe(input);
  });

  test("preserve C1 OSC hyperlinks terminated by ESC ST", () => {
    const input = "8;;https://example.com\\link8;;\\";
    const output = sanitizeAnsi(input);

    expect(output).toContain("8;;https://example.com\\");
    expect(output).toBe(input);
  });

  test("preserve C1 OSC hyperlinks terminated by BEL", () => {
    const input = "8;;https://example.comlink8;;";
    const output = sanitizeAnsi(input);

    expect(output).toContain("8;;https://example.com");
    expect(output).toBe(input);
  });

  test("strip non-SGR CSI sequences as complete units", () => {
    const output = sanitizeAnsi("A[>4;2mB[2 qC");

    expect(output).not.toContain("4;2m");
    expect(output).not.toContain(" q");
    expect(stripAnsi(output)).toBe("ABC");
  });

  test("strip C1 non-SGR CSI sequences as complete units", () => {
    const output = sanitizeAnsi("A>4;2mB2 qC");

    expect(output).not.toContain("4;2m");
    expect(output).not.toContain(" q");
    expect(stripAnsi(output)).toBe("ABC");
  });

  test("preserve C1 SGR CSI sequences", () => {
    const output = sanitizeAnsi("A31mgreen0mB");

    expect(output).toContain("31m");
    expect(stripAnsi(output)).toBe("AgreenB");
  });

  test("strip private-parameter m-sequences that are not SGR", () => {
    const output = sanitizeAnsi("A[>4;2mB");

    expect(output).not.toContain("[>4;2m");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip tmux DCS passthrough wrappers with escaped ST payload terminators", () => {
    const wrappedHyperlinkStart = "Ptmux;]8;;https://example.com\\\\";
    const wrappedHyperlinkEnd = "Ptmux;]8;;\\\\";
    const output = sanitizeAnsi(`${wrappedHyperlinkStart}link${wrappedHyperlinkEnd}`);

    expect(output).not.toContain("tmux;");
    expect(output).not.toContain("P");
    expect(stripAnsi(output)).toBe("link");
  });

  test("strip incomplete DCS passthrough sequences to avoid payload leaks", () => {
    const output = sanitizeAnsi("APtmux;link");

    expect(output).not.toContain("tmux;");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip DCS control strings with BEL in payload until ST terminator", () => {
    const output = sanitizeAnsi("APpayloadstill-payload\\B");

    expect(output).not.toContain("payload");
    expect(output).not.toContain("still-payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip ESC SOS control strings as complete units", () => {
    const output = sanitizeAnsi("AXpayload\\B");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip ESC SOS control strings with C1 ST terminator", () => {
    const output = sanitizeAnsi("AXpayloadB");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip C1 SOS control strings as complete units with C1 ST terminator", () => {
    const output = sanitizeAnsi("ApayloadB");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip C1 SOS control strings as complete units with ESC ST terminator", () => {
    const output = sanitizeAnsi("Apayload\\B");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip ESC SOS with BEL terminator as malformed control string", () => {
    const output = sanitizeAnsi("AXpayloadB");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip C1 SOS with BEL terminator as malformed control string", () => {
    const output = sanitizeAnsi("ApayloadB");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip incomplete ESC SOS control strings to avoid payload leaks", () => {
    const output = sanitizeAnsi("AXpayload");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip incomplete C1 SOS control strings to avoid payload leaks", () => {
    const output = sanitizeAnsi("Apayload");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip SOS with escaped ESC in payload until final ST terminator", () => {
    const output = sanitizeAnsi("AXfoo\\bar\\B");

    expect(output).not.toContain("foo");
    expect(output).not.toContain("bar");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("preserve SGR around stripped SOS control strings", () => {
    const output = sanitizeAnsi("A[31mR[0mXpayload\\B");

    expect(output).toContain("[31m");
    expect(output).toContain("[0m");
    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("ARB");
  });

  test("strip ESC ST sequences", () => {
    const output = sanitizeAnsi("A\\B");

    expect(output).not.toContain("\\");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip malformed ESC control sequences with intermediates and non-final bytes", () => {
    const output = sanitizeAnsi("A#payload");

    expect(output).not.toContain("payload");
    expect(stripAnsi(output)).toBe("A");
  });

  test("strip incomplete CSI after preserving prior SGR content", () => {
    const output = sanitizeAnsi("A[31mB[");

    expect(output).toContain("[31m");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip standalone ST bytes", () => {
    const output = sanitizeAnsi("AB");

    expect(output).not.toContain("");
    expect(stripAnsi(output)).toBe("AB");
  });

  test("strip standalone C1 control characters", () => {
    const output = sanitizeAnsi("ABC");

    expect(output).not.toContain("");
    expect(output).not.toContain("");
    expect(stripAnsi(output)).toBe("ABC");
  });
});
