import { expect, test } from "vite-plus/test";
import { blankCell, type Hyperlink } from "../../src/frame/cell.ts";
import { createColorCapability, type ColorCapability } from "../../src/frame/color-profile.ts";
import { Frame } from "../../src/frame/frame.ts";
import { StyleAttribute, type Style } from "../../src/frame/style.ts";
import { encodeFrame } from "../../src/surface/frame-encoder.ts";

const truecolor = createColorCapability(3);
const ansi256 = createColorCapability(2);
const ansi16 = createColorCapability(1);
const plain = createColorCapability(0);
/** A capable TTY with color suppressed, which is what `NO_COLOR` resolves to. */
const noColor: ColorCapability = { attributes: true, level: 0 };

function styled(style: Partial<Style>, link?: Hyperlink): Frame {
  const frame = new Frame(1, 1);
  frame.set(0, 0, { ...blankCell, grapheme: "A", style: { ...blankCell.style, ...style }, link });
  return frame;
}

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

  expect(encodeFrame(frame, truecolor)).toBe("\x1b[1m\x1b[2mA\x1b[22m\x1b[1mB\x1b[22m");
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

  expect(encodeFrame(frame, truecolor)).toBe("\x1b[1m\x1b[51mA\x1b[0m\x1b[1mB\x1b[22m");
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

  expect(encodeFrame(frame, truecolor)).toBe("\x1b[58:2::255:0:0mA\x1b[59m");
});

test("degrades a truecolor cell to the host's 256-color and ANSI 16 forms", () => {
  const frame = styled({ foreground: { kind: "rgb", red: 255, green: 0, blue: 128 } });

  expect(encodeFrame(frame, truecolor)).toBe("\x1b[38;2;255;0;128mA\x1b[39m");
  expect(encodeFrame(frame, ansi256)).toBe("\x1b[38;5;199mA\x1b[39m");
  expect(encodeFrame(frame, ansi16)).toBe("\x1b[95mA\x1b[39m");
});

test("degrades an indexed cell color only below 256 colors", () => {
  const frame = styled({ background: { kind: "ansi256", index: 201 } });

  expect(encodeFrame(frame, truecolor)).toBe("\x1b[48;5;201mA\x1b[49m");
  expect(encodeFrame(frame, ansi256)).toBe("\x1b[48;5;201mA\x1b[49m");
  expect(encodeFrame(frame, ansi16)).toBe("\x1b[105mA\x1b[49m");
});

test("keeps an ANSI 16 cell color at every capability that has color", () => {
  const frame = styled({ foreground: { kind: "ansi16", index: 9 } });

  for (const color of [truecolor, ansi256, ansi16]) {
    expect(encodeFrame(frame, color)).toBe("\x1b[91mA\x1b[39m");
  }
});

test("a suppressed-color host keeps the non-color attributes", () => {
  const frame = styled({
    attrs: StyleAttribute.bold,
    foreground: { kind: "ansi16", index: 1 },
    background: { kind: "rgb", red: 1, green: 2, blue: 3 },
    extraSgr: [{ code: "\x1b[51m", endCode: "\x1b[0m" }],
  });

  expect(encodeFrame(frame, noColor)).toBe("\x1b[1m\x1b[51mA\x1b[0m\x1b[22m");
});

test("a host without SGR emits none of it and still writes the hyperlink", () => {
  const link = { parameters: "", target: "https://example.com" };
  const frame = styled(
    { attrs: StyleAttribute.bold, foreground: { kind: "ansi16", index: 1 } },
    link,
  );

  expect(encodeFrame(frame, plain)).toBe("\x1b]8;;https://example.com\x07A\x1b]8;;\x07");
});

test("degrades an unmodelled underline color and drops it where it has no form", () => {
  const frame = styled({ extraSgr: [{ code: "\x1b[58;2;255;0;0m", endCode: "\x1b[59m" }] });

  expect(encodeFrame(frame, truecolor)).toBe("\x1b[58;2;255;0;0mA\x1b[59m");
  expect(encodeFrame(frame, ansi256)).toBe("\x1b[58;5;196mA\x1b[59m");
  expect(encodeFrame(frame, ansi16)).toBe("A");
  expect(encodeFrame(frame, noColor)).toBe("A");
});

test("drops an unmodelled color sequence it cannot read below truecolor", () => {
  const frame = styled({
    attrs: StyleAttribute.bold,
    extraSgr: [{ code: "\x1b[38m", endCode: "\x1b[39m" }],
  });

  expect(encodeFrame(frame, truecolor)).toBe("\x1b[1m\x1b[38mA\x1b[39m\x1b[22m");
  expect(encodeFrame(frame, ansi256)).toBe("\x1b[1mA\x1b[22m");
});
