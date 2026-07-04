import { describe, expect, test } from "vite-plus/test";
import stringWidth from "string-width";
import { PRESETS, resolveSpinner } from "./spinners.ts";

describe("PRESETS", () => {
  test("ships exactly dots and line", () => {
    expect(Object.keys(PRESETS).sort()).toEqual(["dots", "line"]);
  });
  test("every preset frame is exactly one column wide", () => {
    for (const [name, set] of Object.entries(PRESETS)) {
      for (const frame of set.frames) {
        expect(stringWidth(frame), `${name} frame ${JSON.stringify(frame)}`).toBe(1);
      }
    }
  });
});

describe("resolveSpinner", () => {
  test("defaults to dots at 80ms", () => {
    expect(resolveSpinner({})).toEqual({ frames: PRESETS.dots.frames, interval: 80 });
  });
  test("selects a named preset with its own interval", () => {
    expect(resolveSpinner({ type: "line" })).toEqual({
      frames: PRESETS.line.frames,
      interval: 130,
    });
  });
  test("unknown type falls back to dots", () => {
    expect(resolveSpinner({ type: "bogus" })).toEqual({
      frames: PRESETS.dots.frames,
      interval: 80,
    });
  });
  test("custom frames override type", () => {
    expect(resolveSpinner({ type: "line", frames: ["a", "b"] })).toEqual({
      frames: ["a", "b"],
      interval: 80,
    });
  });
  test("empty frames fall back to dots", () => {
    expect(resolveSpinner({ frames: [] })).toEqual({ frames: PRESETS.dots.frames, interval: 80 });
  });
  test("interval applies in preset mode", () => {
    expect(resolveSpinner({ type: "dots", interval: 200 })).toEqual({
      frames: PRESETS.dots.frames,
      interval: 200,
    });
  });
  test("interval applies in frames mode", () => {
    expect(resolveSpinner({ frames: ["a"], interval: 50 })).toEqual({
      frames: ["a"],
      interval: 50,
    });
  });
});
