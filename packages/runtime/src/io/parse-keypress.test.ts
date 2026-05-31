import { describe, test, expect } from "vite-plus/test";
import { parseKeypress } from "./parse-keypress.ts";

describe("parse-keypress", () => {
  test("parses regular character", () => {
    const key = parseKeypress("a");
    expect(key.name).toBe("a");
    expect(key.ctrl).toBe(false);
    expect(key.shift).toBe(false);
    expect(key.meta).toBe(false);
  });

  test("parses ctrl+c", () => {
    const key = parseKeypress("\x03");
    expect(key.name).toBe("c");
    expect(key.ctrl).toBe(true);
  });

  test("parses arrow up", () => {
    const key = parseKeypress("\x1b[A");
    expect(key.name).toBe("up");
  });

  test("parses arrow down", () => {
    const key = parseKeypress("\x1b[B");
    expect(key.name).toBe("down");
  });

  test("parses meta+a", () => {
    const key = parseKeypress("\x1ba");
    expect(key.name).toBe("a");
    expect(key.meta).toBe(true);
  });

  test("parses backspace", () => {
    const key = parseKeypress("\x7F");
    expect(key.name).toBe("backspace");
  });

  test("parses return", () => {
    const key = parseKeypress("\r");
    expect(key.name).toBe("return");
  });

  test("parses tab", () => {
    const key = parseKeypress("\t");
    expect(key.name).toBe("tab");
  });

  test("parses shift+tab", () => {
    const key = parseKeypress("\x1b[Z");
    expect(key.name).toBe("tab");
    expect(key.shift).toBe(true);
  });

  test("parses escape", () => {
    const key = parseKeypress("\x1b");
    expect(key.name).toBe("escape");
  });

  test("parses F1", () => {
    const key = parseKeypress("\x1bOP");
    expect(key.name).toBe("f1");
  });

  test("parses home", () => {
    const key = parseKeypress("\x1b[H");
    expect(key.name).toBe("home");
  });

  test("parses end", () => {
    const key = parseKeypress("\x1b[F");
    expect(key.name).toBe("end");
  });

  test("parses delete", () => {
    const key = parseKeypress("\x1b[3~");
    expect(key.name).toBe("delete");
  });

  test("parses page up", () => {
    const key = parseKeypress("\x1b[5~");
    expect(key.name).toBe("pageup");
  });

  test("uppercase letter sets shift", () => {
    const key = parseKeypress("A");
    expect(key.name).toBe("a");
    expect(key.shift).toBe(true);
  });

  // --- vt220-style Ctrl+F1–F4 (ESC [ 1 ; 5 P/Q/R/S) ---
  // Mirrors Ink test/parse-keypress.ts:5-29. These come through the fnKeyRe
  // path (modifier 5 → ctrl) against the "[P".."[S" → f1..f4 keyName map.

  test("Ctrl+F1 resolves to name f1", () => {
    const key = parseKeypress("\x1b[1;5P");
    expect(key.name).toBe("f1");
    expect(key.ctrl).toBe(true);
    expect(key.shift).toBe(false);
    expect(key.meta).toBe(false);
  });

  test("Ctrl+F2 resolves to name f2", () => {
    const key = parseKeypress("\x1b[1;5Q");
    expect(key.name).toBe("f2");
    expect(key.ctrl).toBe(true);
  });

  test("Ctrl+F3 resolves to name f3", () => {
    const key = parseKeypress("\x1b[1;5R");
    expect(key.name).toBe("f3");
    expect(key.ctrl).toBe(true);
  });

  test("Ctrl+F4 resolves to name f4", () => {
    const key = parseKeypress("\x1b[1;5S");
    expect(key.name).toBe("f4");
    expect(key.ctrl).toBe(true);
  });

  // --- Unmapped ctrl-modifier sequences fall back to empty name ---
  // Mirrors Ink test/parse-keypress.ts:32-42. The fnKeyRe matches but the code
  // (e.g. "[I", "[X") has no keyName entry, so name is "" while ctrl stays true.

  test("unmapped ctrl sequence returns empty name", () => {
    const key = parseKeypress("\x1b[1;5I");
    expect(key.name).toBe("");
    expect(key.ctrl).toBe(true);
  });

  test("another unmapped ctrl sequence returns empty name", () => {
    const key = parseKeypress("\x1b[1;5X");
    expect(key.name).toBe("");
    expect(key.ctrl).toBe(true);
  });

  // --- Shift+F1 (modifier 2) uses the same [P mapping ---
  // Mirrors Ink test/parse-keypress.ts:45-50.

  test("Shift+F1 resolves to name f1 with shift", () => {
    const key = parseKeypress("\x1b[1;2P");
    expect(key.name).toBe("f1");
    expect(key.shift).toBe(true);
    expect(key.ctrl).toBe(false);
  });
});
