import { describe, expect, test } from "vite-plus/test";
import stringWidth from "string-width";
import { PRESETS, resolveSpinner } from "../../src/spinner/spinners.ts";

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
  // Two shapes an inherited member can take: a function, and `__proto__`'s object.
  test.each(["toString", "__proto__"])("inherited object member %s falls back to dots", (type) => {
    expect(resolveSpinner({ type })).toEqual({
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
  test.each([0, -50, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    "rejects interval %p",
    (interval) => {
      expect(() => resolveSpinner({ interval })).toThrow(TypeError);
      expect(() => resolveSpinner({ frames: ["a"], interval })).toThrow(TypeError);
    },
  );
  test("names the received value without erasing its type", () => {
    // `<Spinner interval="80" />` — a static template attribute is a string, and
    // Vue does not coerce a `type: Number` prop.
    expect(() => resolveSpinner({ interval: "80" as unknown as number })).toThrow('received "80"');
    expect(() => resolveSpinner({ interval: Number.NaN })).toThrow("received NaN");
    expect(() => resolveSpinner({ interval: Number.POSITIVE_INFINITY })).toThrow(
      "received Infinity",
    );
  });
});
