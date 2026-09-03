import { expect, test } from "vite-plus/test";
import { blankCell } from "../../src/frame/cell.ts";
import { Frame } from "../../src/frame/frame.ts";
import { StyleAttribute } from "../../src/frame/style.ts";
import { encodeFrame } from "../../src/surface/frame-encoder.ts";

test("reopens the remaining intensity after SGR 22 closes a sibling attribute", () => {
  const frame = new Frame(2, 1);
  frame.set(0, 0, {
    ...blankCell,
    grapheme: "A",
    style: { ...blankCell.style, attrs: StyleAttribute.bold | StyleAttribute.dim },
  });
  frame.set(1, 0, {
    ...blankCell,
    grapheme: "B",
    style: { ...blankCell.style, attrs: StyleAttribute.bold },
  });

  expect(encodeFrame(frame)).toBe("\x1b[1m\x1b[2mA\x1b[22m\x1b[1mB\x1b[22m");
});

test("reopens structured attributes after a fallback SGR resets them", () => {
  const frame = new Frame(2, 1);
  frame.set(0, 0, {
    ...blankCell,
    grapheme: "A",
    style: {
      ...blankCell.style,
      attrs: StyleAttribute.bold,
      extraSgr: [{ code: "\x1b[51m", endCode: "\x1b[0m" }],
    },
  });
  frame.set(1, 0, {
    ...blankCell,
    grapheme: "B",
    style: { ...blankCell.style, attrs: StyleAttribute.bold },
  });

  expect(encodeFrame(frame)).toBe("\x1b[1m\x1b[51mA\x1b[0m\x1b[1mB\x1b[22m");
});

test("uses the fallback pair's dedicated terminator", () => {
  const frame = new Frame(1, 1);
  frame.set(0, 0, {
    ...blankCell,
    grapheme: "A",
    style: {
      ...blankCell.style,
      extraSgr: [{ code: "\x1b[58:2::255:0:0m", endCode: "\x1b[59m" }],
    },
  });

  expect(encodeFrame(frame)).toBe("\x1b[58:2::255:0:0mA\x1b[59m");
});
