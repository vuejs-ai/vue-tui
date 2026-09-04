// Where authored SGR becomes structured cell style. Content enters the system
// as a string, so exactly one place turns the sequences it carries into the
// `Style` a cell holds; paint downstream of here never reads an SGR code.
import type { AnsiCode, StyledChar } from "@alcalzone/ansi-tokenize";
import stringWidth from "string-width";
import type { Cell, Hyperlink } from "../frame/cell.ts";
import {
  defaultColor,
  defaultStyle,
  StyleAttribute,
  type Color,
  type SgrPair,
  type Style,
} from "../frame/style.ts";

/** The structured attribute each SGR parameter switches on, and the code that ends it. */
const attributeCodes = [
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
] as const satisfies readonly (readonly [number, string, string])[];

const attributeBySgrCode = new Map<number, number>([
  [1, StyleAttribute.bold],
  [2, StyleAttribute.dim],
  [3, StyleAttribute.italic],
  [4, StyleAttribute.underline],
  [5, StyleAttribute.blink],
  [6, StyleAttribute.rapidBlink],
  [7, StyleAttribute.inverse],
  [8, StyleAttribute.conceal],
  [9, StyleAttribute.strikethrough],
  [53, StyleAttribute.overline],
]);

// Grapheme segmenter shared across calls (constructing one is non-trivial).
// Locale-independent: we only segment, never collate, so the default locale's
// segmentation rules suffice.
export const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export const foregroundEndCode = "\x1b[39m";
export const backgroundEndCode = "\x1b[49m";

function osc8Link(code: string): Hyperlink | undefined {
  if (!code.startsWith("\x1b]8;")) return undefined;
  const parametersEnd = code.indexOf(";", 4);
  if (parametersEnd === -1) return undefined;
  const parameters = code.slice(4, parametersEnd);
  let target = code.slice(parametersEnd + 1);
  if (target.endsWith("\x1b\\")) target = target.slice(0, -2);
  else if (target.endsWith("\x07") || target.endsWith("\x9c")) target = target.slice(0, -1);
  return target === "" ? undefined : { parameters, target };
}

function sgrByte(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > 255) return undefined;
  return value;
}

function sgrColor(
  code: string,
): { readonly channel: "foreground" | "background"; readonly color: Color } | undefined {
  if (!code.startsWith("\x1b[") || !code.endsWith("m")) return undefined;
  const parameters = code.slice(2, -1).split(";").map(Number);
  const first = parameters[0];
  if (first === undefined) return undefined;
  if (first >= 30 && first <= 37) {
    return { channel: "foreground", color: { kind: "ansi16", index: first - 30 } };
  }
  if (first >= 90 && first <= 97) {
    return { channel: "foreground", color: { kind: "ansi16", index: first - 90 + 8 } };
  }
  if (first >= 40 && first <= 47) {
    return { channel: "background", color: { kind: "ansi16", index: first - 40 } };
  }
  if (first >= 100 && first <= 107) {
    return { channel: "background", color: { kind: "ansi16", index: first - 100 + 8 } };
  }
  if ((first !== 38 && first !== 48) || parameters.length < 3) return undefined;
  const channel = first === 38 ? "foreground" : "background";
  if (parameters[1] === 5) {
    const index = sgrByte(parameters[2]);
    return index === undefined ? undefined : { channel, color: { kind: "ansi256", index } };
  }
  if (parameters[1] === 2) {
    const red = sgrByte(parameters[2]);
    const green = sgrByte(parameters[3]);
    const blue = sgrByte(parameters[4]);
    if (red === undefined || green === undefined || blue === undefined) return undefined;
    return { channel, color: { kind: "rgb", red, green, blue } };
  }
  return undefined;
}

/** The visual state one run's active SGR pairs resolve to. */
export function cellVisualFromAnsiCodes(codes: readonly AnsiCode[]): {
  readonly style: Style;
  readonly link: Hyperlink | undefined;
} {
  let foreground = defaultColor;
  let background = defaultColor;
  let attrs = 0;
  const extraSgr: SgrPair[] = [];
  let link: Hyperlink | undefined;

  for (const { code, endCode } of codes) {
    const nextLink = osc8Link(code);
    if (nextLink !== undefined) {
      link = nextLink;
      continue;
    }
    const color = sgrColor(code);
    if (color) {
      if (color.channel === "foreground") foreground = color.color;
      else background = color.color;
      continue;
    }
    if (!code.startsWith("\x1b[") || !code.endsWith("m")) continue;
    const attribute = attributeBySgrCode.get(Number(code.slice(2, -1)));
    if (attribute !== undefined) attrs |= attribute;
    else extraSgr.push({ code, endCode });
  }

  const style =
    foreground === defaultColor &&
    background === defaultColor &&
    attrs === 0 &&
    extraSgr.length === 0
      ? defaultStyle
      : { foreground, background, attrs, extraSgr };
  return { style, link };
}

/** One parsed grapheme as the cell it will be painted as. */
export function cellFromStyledChar(character: StyledChar): Cell {
  const { style, link } = cellVisualFromAnsiCodes(character.styles);
  return { grapheme: character.value, width: stringWidth(character.value), style, link };
}

export function cellsFromStyledChars(characters: readonly StyledChar[]): Cell[] {
  return characters.map((character) => cellFromStyledChar(character));
}

/** The cells one unstyled string occupies, all carrying `style`. */
export function cellsFromPlainText(text: string, style: Style): Cell[] {
  const cells: Cell[] = [];
  for (const { segment } of graphemeSegmenter.segment(text)) {
    cells.push({ grapheme: segment, width: stringWidth(segment), style, link: undefined });
  }
  return cells;
}

function colorCode(color: Color, background: boolean): string {
  switch (color.kind) {
    case "default":
      return background ? backgroundEndCode : foregroundEndCode;
    case "ansi16":
      return color.index < 8
        ? `\x1b[${(background ? 40 : 30) + color.index}m`
        : `\x1b[${(background ? 100 : 90) + color.index - 8}m`;
    case "ansi256":
      return `\x1b[${background ? 48 : 38};5;${color.index}m`;
    case "rgb":
      return `\x1b[${background ? 48 : 38};2;${color.red};${color.green};${color.blue}m`;
  }
}

/**
 * The SGR pairs one cell's style holds, for the string form `cli-truncate`
 * needs. This is the inverse of {@link cellVisualFromAnsiCodes} up to the order
 * the codes were originally written in, which no longer exists once the style
 * is structured; re-parsing the result reproduces the same `Style`.
 */
export function ansiCodesFromCell(cell: Cell): AnsiCode[] {
  const codes: AnsiCode[] = [];
  if (cell.link) {
    codes.push({
      type: "ansi",
      code: `\x1b]8;${cell.link.parameters};${cell.link.target}\x07`,
      endCode: "\x1b]8;;\x07",
    });
  }
  for (const [attribute, code, endCode] of attributeCodes) {
    if ((cell.style.attrs & attribute) !== 0) codes.push({ type: "ansi", code, endCode });
  }
  if (cell.style.background.kind !== "default") {
    codes.push({
      type: "ansi",
      code: colorCode(cell.style.background, true),
      endCode: backgroundEndCode,
    });
  }
  if (cell.style.foreground.kind !== "default") {
    codes.push({
      type: "ansi",
      code: colorCode(cell.style.foreground, false),
      endCode: foregroundEndCode,
    });
  }
  for (const pair of cell.style.extraSgr) {
    codes.push({ type: "ansi", code: pair.code, endCode: pair.endCode });
  }
  return codes;
}

export function styledCharFromCell(cell: Cell): StyledChar {
  return {
    type: "char",
    value: cell.grapheme,
    fullWidth: cell.width > 1,
    styles: ansiCodesFromCell(cell),
  };
}
