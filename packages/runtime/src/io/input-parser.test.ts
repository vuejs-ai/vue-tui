import { describe, test, expect } from "vite-plus/test";
import { createInputParser } from "./input-parser.ts";

describe("input-parser", () => {
  test("splits plain text into single event", () => {
    const parser = createInputParser();
    expect(parser.push("hello")).toEqual(["hello"]);
  });

  test("parses CSI sequence (arrow up)", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[A")).toEqual(["\x1b[A"]);
  });

  test("handles incomplete CSI as pending", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.push("A")).toEqual(["\x1b[A"]);
  });

  test("parses bracketed paste", () => {
    const parser = createInputParser();
    const events = parser.push("\x1b[200~pasted text\x1b[201~");
    expect(events).toEqual([{ paste: "pasted text" }]);
  });

  test("splits backspace bytes", () => {
    const parser = createInputParser();
    const events = parser.push("ab\x7F\x7Fc");
    expect(events).toEqual(["ab", "\x7F", "\x7F", "c"]);
  });

  test("hasPendingEscape is false during paste assembly", () => {
    const parser = createInputParser();
    parser.push("\x1b[200");
    expect(parser.hasPendingEscape()).toBe(false);
  });

  test("flushPendingEscape returns pending sequence", () => {
    const parser = createInputParser();
    parser.push("\x1b");
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.flushPendingEscape()).toBe("\x1b");
  });

  test("parses SS3 sequence", () => {
    const parser = createInputParser();
    expect(parser.push("\x1bOP")).toEqual(["\x1bOP"]);
  });

  test("parses double-ESC prefix (meta+arrow)", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b\x1b[A")).toEqual(["\x1b\x1b[A"]);
  });

  test("reset clears pending state", () => {
    const parser = createInputParser();
    parser.push("\x1b[");
    expect(parser.hasPendingEscape()).toBe(true);
    parser.reset();
    expect(parser.hasPendingEscape()).toBe(false);
  });

  test("incomplete paste start does not trigger flush", () => {
    const parser = createInputParser();
    parser.push("\x1b[200");
    expect(parser.hasPendingEscape()).toBe(false);
  });

  test("text mixed with escape sequences", () => {
    const parser = createInputParser();
    const events = parser.push("a\x1b[Ab\x1b[B");
    expect(events).toEqual(["a", "\x1b[A", "b", "\x1b[B"]);
  });
});
