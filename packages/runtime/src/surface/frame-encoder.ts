import { Frame } from "../frame/frame.ts";
import type { Hyperlink } from "../frame/cell.ts";
import {
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

function sgrPairsForStyle(style: Style): SgrPair[] {
  const pairs: SgrPair[] = [];
  for (const [attribute, code, endCode] of attributePairs) {
    if ((style.attrs & attribute) !== 0) pairs.push({ code, endCode });
  }
  if (style.background.kind !== "default") {
    pairs.push({ code: colorCode(style.background, true), endCode: "\x1b[49m" });
  }
  if (style.foreground.kind !== "default") {
    pairs.push({ code: colorCode(style.foreground, false), endCode: "\x1b[39m" });
  }
  pairs.push(...style.extraSgr);
  return reduceSgrPairs([], pairs);
}

function pairCodes(pairs: readonly SgrPair[]): string {
  return [...new Set(pairs.map((pair) => pair.code))].join("");
}

function encodeSgrTransition(from: Style, to: Style): string {
  let current = sgrPairsForStyle(from);
  const target = sgrPairsForStyle(to);
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

function encodeTransition(from: CellVisual, to: CellVisual): string {
  let output = "";
  if (!sameLink(from.link, to.link) && from.link !== undefined) output += "\x1b]8;;\x07";
  output += encodeSgrTransition(from.style, to.style);
  if (!sameLink(from.link, to.link) && to.link !== undefined) {
    output += `\x1b]8;${to.link.parameters};${to.link.target}\x07`;
  }
  return output;
}

export function encodeFrameRow(frame: Frame, row: number): string {
  let output = "";
  let previous = blankVisual;
  for (let column = 0; column < frame.width; column++) {
    const cell = frame.get(column, row);
    if (cell.width === 0) continue;
    const next = { style: cell.style, link: cell.link };
    output += encodeTransition(previous, next);
    output += cell.grapheme;
    previous = next;
  }
  output += encodeTransition(previous, blankVisual);
  return output.trimEnd();
}

/** Encode the requested leading rows of one logical terminal picture. */
export function encodeFrame(frame: Frame, maxRows = frame.height): string {
  const rowCount = Math.max(0, Math.min(frame.height, maxRows));
  return Array.from({ length: rowCount }, (_, row) => encodeFrameRow(frame, row)).join("\n");
}

/** Encode complete history blocks with the physical line boundary each block requires. */
export function encodeFrameHistory(frames: readonly Frame[]): string {
  return frames.map((frame) => `${encodeFrame(frame)}\n`).join("");
}
