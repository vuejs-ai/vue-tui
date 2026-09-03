import { describe, expect, test } from "vite-plus/test";
import { blankCell } from "../../src/frame/cell.ts";
import { Frame } from "../../src/frame/frame.ts";
import { StyleAttribute, type Style } from "../../src/frame/style.ts";

const styled: Style = {
  foreground: { kind: "rgb", red: 10, green: 20, blue: 30 },
  background: { kind: "ansi256", index: 194 },
  attrs: StyleAttribute.bold | StyleAttribute.overline,
  extraSgr: [{ code: "\x1b[51m", endCode: "\x1b[0m" }],
};

const link = { parameters: "id=frame", target: "https://example.com" };

describe("Frame", () => {
  test("stores inline cell style and hyperlink data", () => {
    const frame = new Frame(2, 1);
    frame.set(0, 0, {
      grapheme: "界",
      width: 2,
      style: styled,
      link,
    });
    frame.set(1, 0, { grapheme: "", width: 0, style: styled, link });

    expect(frame.get(0, 0)).toEqual({
      grapheme: "界",
      width: 2,
      style: styled,
      link,
    });
    expect(frame.get(1, 0)).toEqual({
      grapheme: "",
      width: 0,
      style: styled,
      link,
    });
  });

  test("starts with shared blank cells", () => {
    const frame = new Frame(2, 2);

    expect(frame.get(0, 0)).toEqual(blankCell);
    expect(frame.get(1, 1)).toEqual(blankCell);
  });

  test.each(["\u00a0", "\u2003"])(
    "treats trailing unstyled Unicode whitespace as output-free",
    (grapheme) => {
      const frame = new Frame(1, 1);
      frame.set(0, 0, { ...blankCell, grapheme });

      expect(frame.hasContent()).toBe(false);
    },
  );

  test("reports changed rows", () => {
    const previous = new Frame(4, 2);
    const next = new Frame(4, 2);
    next.set(1, 0, { ...blankCell, grapheme: "A" });
    next.set(3, 0, { ...blankCell, grapheme: "B" });
    next.set(2, 1, { ...blankCell, grapheme: "C" });

    expect(Frame.diff(previous, next)).toEqual({
      sizeChanged: false,
      rows: [0, 1],
    });
  });

  test("compares fallback SGR by value", () => {
    const previous = new Frame(1, 1);
    const equal = new Frame(1, 1);
    const changed = new Frame(1, 1);
    previous.set(0, 0, { ...blankCell, style: styled });
    equal.set(0, 0, {
      ...blankCell,
      style: {
        ...styled,
        extraSgr: styled.extraSgr.map((pair) => ({ ...pair })),
      },
    });
    changed.set(0, 0, {
      ...blankCell,
      style: {
        ...styled,
        extraSgr: [{ code: "\x1b[73m", endCode: "\x1b[0m" }],
      },
    });

    expect(Frame.diff(previous, equal).rows).toEqual([]);
    expect(Frame.diff(previous, changed).rows).toEqual([0]);
  });

  test("treats a different picture size as a complete next-frame change", () => {
    const previous = new Frame(2, 1);
    const next = new Frame(3, 2);

    expect(Frame.diff(previous, next)).toEqual({
      sizeChanged: true,
      rows: [0, 1],
    });
  });
});
