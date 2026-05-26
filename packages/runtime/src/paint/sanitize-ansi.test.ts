import { describe, test, expect } from "vite-plus/test";
import { sanitizeAnsi } from "./sanitize-ansi.ts";

describe("sanitize-ansi", () => {
  test("preserves SGR (color) sequences", () => {
    expect(sanitizeAnsi("\x1b[31mred\x1b[0m")).toBe("\x1b[31mred\x1b[0m");
  });

  test("strips cursor movement", () => {
    expect(sanitizeAnsi("\x1b[2Ahello")).toBe("hello");
  });

  test("strips screen clearing", () => {
    expect(sanitizeAnsi("\x1b[2Jhello")).toBe("hello");
  });

  test("preserves OSC (hyperlinks)", () => {
    const link = "\x1b]8;;https://example.com\x07click\x1b]8;;\x07";
    expect(sanitizeAnsi(link)).toBe(link);
  });

  test("passes through plain text unchanged", () => {
    expect(sanitizeAnsi("hello world")).toBe("hello world");
  });
});
