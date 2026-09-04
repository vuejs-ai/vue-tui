// Composition emits every authored color at full fidelity. The frame encoder
// owns degradation to the host's resolved color level, so nothing here reads a
// capability: an ANSI 16 terminal and a truecolor terminal receive the same
// cells and differ only in the bytes the encoder writes for them.

/** The Text prop subset that contributes visual cell style. */
export interface TextStyleProps {
  readonly color?: unknown;
  readonly backgroundColor?: unknown;
  readonly dimColor?: boolean;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly inverse?: boolean;
}

/** One authored style as the SGR that opens it and the SGR that ends it. */
export interface SgrSpan {
  readonly open: string;
  readonly close: string;
}

const namedColorIndex = new Map<string, number>([
  ["black", 0],
  ["red", 1],
  ["green", 2],
  ["yellow", 3],
  ["blue", 4],
  ["magenta", 5],
  ["cyan", 6],
  ["white", 7],
  ["blackBright", 8],
  ["gray", 8],
  ["grey", 8],
  ["redBright", 9],
  ["greenBright", 10],
  ["yellowBright", 11],
  ["blueBright", 12],
  ["magentaBright", 13],
  ["cyanBright", 14],
  ["whiteBright", 15],
]);

// Accepted functional colors are rgb(R,G,B) and ansi256(N). An unparseable or
// unsupported string leaves the text unchanged instead of emitting an invalid
// SGR sequence; ansi(N) is not an accepted form.
const rgbRegex = /^rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)$/;
const ansi256Regex = /^ansi256\(\s?(\d+)\s?\)$/;
// A hex color takes the first six- or three-digit run anywhere in the value and
// expands the short form, so `#f80` and `#ff8800` name the same color.
const hexDigitsRegex = /[a-f\d]{6}|[a-f\d]{3}/i;

const foregroundClose = "\x1b[39m";
const backgroundClose = "\x1b[49m";

export const dimSpan: SgrSpan = { open: "\x1b[2m", close: "\x1b[22m" };

const modifierSpans = {
  bold: { open: "\x1b[1m", close: "\x1b[22m" },
  italic: { open: "\x1b[3m", close: "\x1b[23m" },
  underline: { open: "\x1b[4m", close: "\x1b[24m" },
  strikethrough: { open: "\x1b[9m", close: "\x1b[29m" },
  inverse: { open: "\x1b[7m", close: "\x1b[27m" },
} as const satisfies Record<string, SgrSpan>;

function hexToRgb(value: string): readonly [number, number, number] {
  const match = hexDigitsRegex.exec(value);
  if (!match) return [0, 0, 0];
  // The short form doubles each digit: `#f80` and `#ff8800` are the same color.
  const digits = match[0].length === 3 ? match[0].replace(/./g, "$&$&") : match[0];
  const packed = Number.parseInt(digits, 16);
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

function span(open: string, background: boolean): SgrSpan {
  return { open, close: background ? backgroundClose : foregroundClose };
}

/** `default` actively selects the terminal's own color for one channel. */
function isTerminalDefaultColor(color: unknown): boolean {
  return color === "default";
}

/** Reset one channel around this run, without re-opening it after an inner close. */
function resetChannel(text: string, close: string): string {
  return `${close}${text}${close}`;
}

/** The SGR span one authored color value opens, or nothing for an unsupported value. */
export function colorSpan(color: unknown, background: boolean): SgrSpan | undefined {
  if (typeof color !== "string") return undefined;
  const offset = background ? 10 : 0;
  const named = namedColorIndex.get(color);
  if (named !== undefined) {
    const code = named < 8 ? 30 + named + offset : 90 + (named - 8) + offset;
    return span(`\x1b[${code}m`, background);
  }
  if (color.startsWith("#")) {
    const [red, green, blue] = hexToRgb(color);
    return span(`\x1b[${38 + offset};2;${red};${green};${blue}m`, background);
  }
  if (color.startsWith("ansi256")) {
    const match = ansi256Regex.exec(color);
    if (!match) return undefined;
    return span(`\x1b[${38 + offset};5;${Number(match[1])}m`, background);
  }
  if (color.startsWith("rgb")) {
    const match = rgbRegex.exec(color);
    if (!match) return undefined;
    const [red, green, blue] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return span(`\x1b[${38 + offset};2;${red};${green};${blue}m`, background);
  }
  return undefined;
}

function reopenAfterEveryClose(text: string, close: string, open: string): string {
  // Content the caller already styled may end this exact span in the middle of
  // the run. Re-open it after each such close, or only the leading part of the
  // run would carry the authored style. A function replacement keeps `$` in an
  // opening sequence literal.
  return text.replaceAll(close, () => close + open);
}

function encaseLineFeeds(text: string, close: string, open: string, firstIndex: number): string {
  // Physical lines are styled independently: paint splits this string on `\n`
  // and re-parses each line on its own, and leaving a span open across the
  // break also bleeds the style into the next row on some terminals.
  let endIndex = 0;
  let result = "";
  let index = firstIndex;
  do {
    const carriageReturn = text[index - 1] === "\r";
    result +=
      text.slice(endIndex, carriageReturn ? index - 1 : index) +
      close +
      (carriageReturn ? "\r\n" : "\n") +
      open;
    endIndex = index + 1;
    index = text.indexOf("\n", endIndex);
  } while (index !== -1);
  return result + text.slice(endIndex);
}

/** Wrap `text` in one balanced SGR span that survives inner closes and line feeds. */
export function applySgrSpan(text: string, style: SgrSpan): string {
  if (text === "") return text;
  let styled = text;
  if (styled.includes("\x1b")) styled = reopenAfterEveryClose(styled, style.close, style.open);
  const firstLineFeed = styled.indexOf("\n");
  if (firstLineFeed !== -1) {
    styled = encaseLineFeeds(styled, style.close, style.open, firstLineFeed);
  }
  return style.open + styled + style.close;
}

function applyColorValue(text: string, color: unknown, background: boolean): string {
  const style = colorSpan(color, background);
  return style === undefined ? text : applySgrSpan(text, style);
}

export function applyTextStyle(text: string, props: TextStyleProps): string {
  // Apply each enabled style as its own span, in the order dim -> color ->
  // backgroundColor -> bold -> italic -> underline -> strikethrough -> inverse.
  // This produces individually balanced open/close pairs (e.g. dim+bold re-opens
  // bold after dim's SGR-22 close) rather than one combined sequence.
  let styled = text;
  if (props.dimColor) styled = applySgrSpan(styled, dimSpan);
  if (props.color) {
    styled = isTerminalDefaultColor(props.color)
      ? resetChannel(styled, foregroundClose)
      : applyColorValue(styled, props.color, false);
  }
  if (props.backgroundColor) {
    styled = isTerminalDefaultColor(props.backgroundColor)
      ? resetChannel(styled, backgroundClose)
      : applyColorValue(styled, props.backgroundColor, true);
  }
  if (props.bold) styled = applySgrSpan(styled, modifierSpans.bold);
  if (props.italic) styled = applySgrSpan(styled, modifierSpans.italic);
  if (props.underline) styled = applySgrSpan(styled, modifierSpans.underline);
  if (props.strikethrough) styled = applySgrSpan(styled, modifierSpans.strikethrough);
  if (props.inverse) styled = applySgrSpan(styled, modifierSpans.inverse);
  return styled;
}
