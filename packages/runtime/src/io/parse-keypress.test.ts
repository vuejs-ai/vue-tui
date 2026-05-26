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
});
