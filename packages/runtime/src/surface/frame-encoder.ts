import ansiStyles from "ansi-styles";
import { Frame } from "../frame/frame.ts";
import type { Hyperlink } from "../frame/cell.ts";
import type { ColorCapability, ColorLevel } from "../frame/color-profile.ts";
import {
  defaultColor,
  defaultStyle,
  StyleAttribute,
  type Color,
  type SgrPair,
  type Style,
} from "../frame/style.ts";

interface CellVisual {
  readonly style: Style;
  readonly link: Hyperlink | undefined;
}

const blankVisual: CellVisual = { style: defaultStyle, link: undefined };

const attributePairs = [
  [StyleAttribute.bold, "\x1b[1m", "\x1b[22m"],
  [StyleAttribute.dim, "\x1b[2m", "\x1b[22m"],
  [StyleAttribute.italic, "\x1b[3m", "\x1b[23m"],
  [StyleAttribute.underline, "\x1b[4m", "\x1b[24m"],
  [StyleAttribute.blink, "\x1b[5m", "\x1b[25m"],
  [StyleAttribute.rapidBlink, "\x1b[6m", "\x1b[25m"],
  [StyleAttribute.inverse, "\x1b[7m", "\x1b[27m"],
  [StyleAttribute.conceal, "\x1b[8m", "\x1b[28m"],
  [StyleAttribute.strikethrough, "\x1b[9m", "\x1b[29m"],
  [StyleAttribute.overline, "\x1b[53m", "\x1b[55m"],
] as const;

const resetCode = "\x1b[0m";
const boldCode = "\x1b[1m";
const dimCode = "\x1b[2m";

function sameLink(a: Hyperlink | undefined, b: Hyperlink | undefined): boolean {
  return (
    a === b ||
    (a !== undefined && b !== undefined && a.parameters === b.parameters && a.target === b.target)
  );
}

// Degradation from the color a cell holds to the color the host can show.
// `ansi-styles` carries 24-bit down to 256 through the 6x6x6 cube plus the
// grayscale ramp, and 256 down to 16 by brightness. An indexed color takes the
// same route through its palette entry, so one authored color reaches one
// output color whichever form it was written in.
const ansi16Palette = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
] as const;

function indexedColorToRgb(value: number): readonly [red: number, green: number, blue: number] {
  if (value < 16) return ansi16Palette[value]!;
  if (value >= 232) {
    const gray = 8 + (value - 232) * 10;
    return [gray, gray, gray];
  }
  const offset = value - 16;
  const component = (part: number): number => (part === 0 ? 0 : 55 + part * 40);
  return [
    component(Math.floor(offset / 36)),
    component(Math.floor((offset % 36) / 6)),
    component(offset % 6),
  ];
}

function rgbToAnsi16Index(red: number, green: number, blue: number): number {
  // `ansi256ToAnsi` answers with a foreground SGR code — 30-37 for the first
  // eight colors, 90-97 for the bright ones — while `Color` numbers them 0-15.
  const code = ansiStyles.ansi256ToAnsi(ansiStyles.rgbToAnsi256(red, green, blue));
  return code >= 90 ? code - 90 + 8 : code - 30;
}

/** Reduce one structured color to what `level` can encode. */
function degradeColor(color: Color, level: ColorLevel): Color {
  if (level === 0) return defaultColor;
  switch (color.kind) {
    case "default":
    case "ansi16":
      return color;
    case "ansi256":
      return level >= 2
        ? color
        : { kind: "ansi16", index: rgbToAnsi16Index(...indexedColorToRgb(color.index)) };
    case "rgb": {
      if (level === 3) return color;
      return level === 2
        ? { kind: "ansi256", index: ansiStyles.rgbToAnsi256(color.red, color.green, color.blue) }
        : { kind: "ansi16", index: rgbToAnsi16Index(color.red, color.green, color.blue) };
    }
  }
}

function colorCode(color: Color, background: boolean): string {
  switch (color.kind) {
    case "default":
      return background ? "\x1b[49m" : "\x1b[39m";
    case "ansi16":
      if (color.index < 8) return `\x1b[${(background ? 40 : 30) + color.index}m`;
      return `\x1b[${(background ? 100 : 90) + color.index - 8}m`;
    case "ansi256":
      return `\x1b[${background ? 48 : 38};5;${color.index}m`;
    case "rgb":
      return `\x1b[${background ? 48 : 38};2;${color.red};${color.green};${color.blue}m`;
  }
}

type ColorChannel = "foreground" | "background" | "underline";

function colorChannel(value: string): ColorChannel | undefined {
  if (value === "38") return "foreground";
  if (value === "48") return "background";
  if (value === "58") return "underline";
  return undefined;
}

function boundedByte(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  return Math.min(255, Number(value));
}

function channelColorCode(channel: ColorChannel, color: Color): string {
  if (channel !== "underline") return colorCode(color, channel === "background");
  // `Color` has no underline channel of its own, so write the foreground form
  // and swap its parameter. An ANSI 16 underline color has no SGR form at all,
  // so it takes the 256-color one.
  const code = color.kind === "ansi16" ? `\x1b[38;5;${color.index}m` : colorCode(color, false);
  return code.replace("[38;", "[58;");
}

/**
 * The color one unmodelled SGR sequence requests, in `Cell` terms.
 *
 * A sequence that names a color channel but does not carry a color Runtime
 * understands returns `undefined`, which drops it below truecolor rather than
 * leaking a capability the host may not have.
 */
function extendedColorOf(
  parameterString: string,
): { channel: ColorChannel; color: Color } | undefined {
  const colonParts = parameterString.split(":");
  const parts = colonParts.length > 1 ? colonParts : parameterString.split(";");
  const channel = colorChannel(parts[0] ?? "");
  if (channel === undefined) return undefined;

  if (parts[1] === "5") {
    const index = boundedByte(parts.at(-1) ?? "");
    return index === undefined ? undefined : { channel, color: { kind: "ansi256", index } };
  }
  if (parts[1] !== "2" || parts.length < 5) return undefined;
  const red = boundedByte(parts.at(-3) ?? "");
  const green = boundedByte(parts.at(-2) ?? "");
  const blue = boundedByte(parts.at(-1) ?? "");
  return red === undefined || green === undefined || blue === undefined
    ? undefined
    : { channel, color: { kind: "rgb", red, green, blue } };
}

function isBasicColorParameter(parameter: string): boolean {
  const value = Number(parameter);
  return (
    (value >= 30 && value <= 37) ||
    value === 39 ||
    (value >= 40 && value <= 47) ||
    value === 49 ||
    (value >= 90 && value <= 97) ||
    (value >= 100 && value <= 107) ||
    value === 59
  );
}

/** Reduce one unmodelled SGR pair to what `level` can encode, or drop it. */
function degradeSgrPair(pair: SgrPair, level: ColorLevel): SgrPair | undefined {
  if (level === 3) return pair;
  if (!pair.code.startsWith("\x1b[") || !pair.code.endsWith("m")) return pair;
  const parameterString = pair.code.slice(2, -1);

  if (colorChannel(parameterString.split(/[;:]/, 1)[0] ?? "") !== undefined) {
    const requested = extendedColorOf(parameterString);
    if (!requested || level === 0) return undefined;
    // The underline channel has no ANSI 16 form, so a constrained host drops it
    // rather than repainting the glyph itself.
    if (requested.channel === "underline" && level === 1) return undefined;
    return {
      code: channelColorCode(requested.channel, degradeColor(requested.color, level)),
      endCode: pair.endCode,
    };
  }

  if (level === 0 && isBasicColorParameter(parameterString)) return undefined;
  return pair;
}

function isIntensityPair(pair: SgrPair): boolean {
  return pair.code === boldCode || pair.code === dimCode;
}

function reduceSgrPairs(active: readonly SgrPair[], next: readonly SgrPair[]): SgrPair[] {
  let result = [...active];
  for (const pair of next) {
    if (pair.code === resetCode) {
      result = [];
    } else if (pair.code === pair.endCode) {
      result = result.filter((candidate) => candidate.endCode !== pair.code);
    } else if (isIntensityPair(pair) || pair.endCode === resetCode) {
      if (!result.some((candidate) => candidate.code === pair.code)) result.push(pair);
    } else {
      result = result.filter((candidate) => candidate.endCode !== pair.endCode);
      result.push(pair);
    }
  }
  return result;
}

function sameSgrPairs(left: readonly SgrPair[], right: readonly SgrPair[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (pair, index) => pair.code === right[index]!.code && pair.endCode === right[index]!.endCode,
    )
  );
}

function sgrDifference(from: readonly SgrPair[], to: readonly SgrPair[]): SgrPair[] {
  const endCodesInTarget = new Set(to.map((pair) => pair.endCode));
  const codesInTarget = new Set(to.map((pair) => pair.code));
  const codesInSource = new Set(from.map((pair) => pair.code));
  const closesBeforeReplacement = new Set([resetCode]);
  const removed = reduceSgrPairs(
    [],
    from.filter((pair) =>
      isIntensityPair(pair)
        ? !codesInTarget.has(pair.code)
        : !endCodesInTarget.has(pair.endCode) ||
          (closesBeforeReplacement.has(pair.endCode) && !codesInTarget.has(pair.code)),
    ),
  )
    .reverse()
    .map((pair) => ({ ...pair, code: pair.endCode }));
  return [...removed, ...to.filter((pair) => !codesInSource.has(pair.code))];
}

function sgrPairsForStyle(style: Style, color: ColorCapability): SgrPair[] {
  // A host that emits no SGR at all encodes every cell as an unstyled one.
  if (!color.attributes) return [];
  const pairs: SgrPair[] = [];
  for (const [attribute, code, endCode] of attributePairs) {
    if ((style.attrs & attribute) !== 0) pairs.push({ code, endCode });
  }
  const background = degradeColor(style.background, color.level);
  if (background.kind !== "default") {
    pairs.push({ code: colorCode(background, true), endCode: "\x1b[49m" });
  }
  const foreground = degradeColor(style.foreground, color.level);
  if (foreground.kind !== "default") {
    pairs.push({ code: colorCode(foreground, false), endCode: "\x1b[39m" });
  }
  for (const pair of style.extraSgr) {
    const degraded = degradeSgrPair(pair, color.level);
    if (degraded) pairs.push(degraded);
  }
  return reduceSgrPairs([], pairs);
}

function pairCodes(pairs: readonly SgrPair[]): string {
  return [...new Set(pairs.map((pair) => pair.code))].join("");
}

function encodeSgrTransition(from: Style, to: Style, color: ColorCapability): string {
  let current = sgrPairsForStyle(from, color);
  const target = sgrPairsForStyle(to, color);
  let output = "";
  const maxRepairs = current.length + target.length + 2;

  for (let attempt = 0; attempt < maxRepairs; attempt++) {
    if (sameSgrPairs(current, target)) return output;
    const difference = sgrDifference(current, target);
    if (difference.length === 0) break;
    output += pairCodes(difference);
    const next = reduceSgrPairs(current, difference);
    if (sameSgrPairs(current, next)) break;
    current = next;
  }

  return output + resetCode + pairCodes(target);
}

function encodeTransition(from: CellVisual, to: CellVisual, color: ColorCapability): string {
  let output = "";
  if (!sameLink(from.link, to.link) && from.link !== undefined) output += "\x1b]8;;\x07";
  output += encodeSgrTransition(from.style, to.style, color);
  if (!sameLink(from.link, to.link) && to.link !== undefined) {
    output += `\x1b]8;${to.link.parameters};${to.link.target}\x07`;
  }
  return output;
}

export function encodeFrameRow(frame: Frame, row: number, color: ColorCapability): string {
  let output = "";
  let previous = blankVisual;
  for (let column = 0; column < frame.width; column++) {
    const cell = frame.get(column, row);
    if (cell.width === 0) continue;
    const next = { style: cell.style, link: cell.link };
    output += encodeTransition(previous, next, color);
    output += cell.grapheme;
    previous = next;
  }
  output += encodeTransition(previous, blankVisual, color);
  return output.trimEnd();
}

/** Encode the requested leading rows of one logical terminal picture. */
export function encodeFrame(frame: Frame, color: ColorCapability, maxRows = frame.height): string {
  const rowCount = Math.max(0, Math.min(frame.height, maxRows));
  return Array.from({ length: rowCount }, (_, row) => encodeFrameRow(frame, row, color)).join("\n");
}

/** Encode complete history blocks with the physical line boundary each block requires. */
export function encodeFrameHistory(frames: readonly Frame[], color: ColorCapability): string {
  return frames.map((frame) => `${encodeFrame(frame, color)}\n`).join("");
}
