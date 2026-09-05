// Authored style props resolved into the structured fields a cell holds. Every
// colour is carried at full fidelity; the frame encoder owns degradation to the
// host's resolved colour level, so nothing here reads a capability.
import ansiStyles from "ansi-styles";
import type { Color } from "../frame/style.ts";
import {
  backgroundEndCode,
  foregroundEndCode,
  sgrCodeForColor,
  type SgrToken,
} from "./cell-style.ts";

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

/**
 * One channel a Text's props resolve for its subtree, as the two sequences that
 * open and end it.
 *
 * `reopens` says whether the span repairs itself around content that would end
 * it early: a written close is followed by a fresh open, and a hard newline
 * closes the span before the break and opens it again after. Every styled
 * channel does both. A colour prop set to `default` does neither: it selects
 * the terminal's own colour by writing that channel's end sequence at each edge
 * of the content, and a bare pair has nothing to repair.
 */
export interface TextStyleContribution {
  readonly open: SgrToken;
  readonly close: SgrToken;
  readonly reopens: boolean;
}

/**
 * One inline host as it stands over one chunk of content: which host it is,
 * which channels its own props set, and the style it opens around this chunk.
 *
 * `owner` is identity, not style, and is an opaque object because the hosts
 * live in `host/`, which `text/` may not import. Composition reads it to tell
 * which neighbouring chunks the same host encloses. `ownChannels` is every
 * channel the props set, whatever they set it to, which decides where one host
 * ends a stretch of content and the next begins.
 */
export interface TextStyleLevel {
  readonly owner: object;
  readonly ownChannels: number;
  readonly contributions: readonly TextStyleContribution[];
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
// unsupported string leaves the channel unset instead of inventing a colour;
// ansi(N) is not an accepted form.
const rgbRegex = /^rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)$/;
const ansi256Regex = /^ansi256\(\s?(\d+)\s?\)$/;

/** A pair whose written form is the sequence itself, which is every pair here. */
function sgrToken(code: string, endCode: string): SgrToken {
  return { code, endCode, source: code };
}

function attributeContribution(open: string, close: string): TextStyleContribution {
  return { open: sgrToken(open, close), close: sgrToken(close, close), reopens: true };
}

const attributeContributions = {
  dimColor: attributeContribution("\x1b[2m", "\x1b[22m"),
  bold: attributeContribution("\x1b[1m", "\x1b[22m"),
  italic: attributeContribution("\x1b[3m", "\x1b[23m"),
  underline: attributeContribution("\x1b[4m", "\x1b[24m"),
  strikethrough: attributeContribution("\x1b[9m", "\x1b[29m"),
  inverse: attributeContribution("\x1b[7m", "\x1b[27m"),
} as const satisfies Record<string, TextStyleContribution>;

/** `default` actively selects the terminal's own color for one channel. */
function isTerminalDefaultColor(color: unknown): boolean {
  return color === "default";
}

/** The structured colour one authored value names, or nothing for an unsupported value. */
export function parseColorValue(color: unknown): Color | undefined {
  if (typeof color !== "string") return undefined;
  const named = namedColorIndex.get(color);
  if (named !== undefined) return { kind: "ansi16", index: named };
  if (color.startsWith("#")) {
    // `hexToRgb` takes the first six- or three-digit run anywhere in the value
    // and doubles each digit of the short form, so `#f80` and `#ff8800` name
    // the same color.
    const [red, green, blue] = ansiStyles.hexToRgb(color);
    return { kind: "rgb", red, green, blue };
  }
  if (color.startsWith("ansi256")) {
    const match = ansi256Regex.exec(color);
    return match ? { kind: "ansi256", index: Number(match[1]) } : undefined;
  }
  if (color.startsWith("rgb")) {
    const match = rgbRegex.exec(color);
    if (!match) return undefined;
    return { kind: "rgb", red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]) };
  }
  return undefined;
}

/**
 * The style channels a Text's props carry. A nested Text that sets a channel
 * resolves it for its own subtree, so an enclosing Text must not open that
 * channel again: the mask represents terminal-default colors and all three
 * modifier states without sentinel characters in user text.
 */
export const TextStyleChannel = {
  foreground: 1 << 0,
  background: 1 << 1,
  dimColor: 1 << 2,
  bold: 1 << 3,
  italic: 1 << 4,
  underline: 1 << 5,
  strikethrough: 1 << 6,
  inverse: 1 << 7,
} as const;

/** The channels these props set explicitly, whatever value they set them to. */
export function explicitTextStyleChannels(props: TextStyleProps): number {
  let mask = 0;
  if (props.color !== undefined) mask |= TextStyleChannel.foreground;
  if (props.backgroundColor !== undefined) mask |= TextStyleChannel.background;
  if (props.dimColor !== undefined) mask |= TextStyleChannel.dimColor;
  if (props.bold !== undefined) mask |= TextStyleChannel.bold;
  if (props.italic !== undefined) mask |= TextStyleChannel.italic;
  if (props.underline !== undefined) mask |= TextStyleChannel.underline;
  if (props.strikethrough !== undefined) mask |= TextStyleChannel.strikethrough;
  if (props.inverse !== undefined) mask |= TextStyleChannel.inverse;
  return mask;
}

/**
 * The channels these props resolve, outermost first, skipping every `blocked`
 * one. The order is the nesting order the styles were written in — inverse
 * outermost, dim innermost — which is the order an unmodelled channel reset
 * takes its place in a cell's `extraSgr`.
 */
export function textStyleContributions(
  props: TextStyleProps,
  blocked: number,
): TextStyleContribution[] {
  const contributions: TextStyleContribution[] = [];
  const add = (channel: number, contribution: TextStyleContribution | undefined): void => {
    if (contribution !== undefined && (blocked & channel) === 0) contributions.push(contribution);
  };
  add(TextStyleChannel.inverse, props.inverse ? attributeContributions.inverse : undefined);
  add(
    TextStyleChannel.strikethrough,
    props.strikethrough ? attributeContributions.strikethrough : undefined,
  );
  add(TextStyleChannel.underline, props.underline ? attributeContributions.underline : undefined);
  add(TextStyleChannel.italic, props.italic ? attributeContributions.italic : undefined);
  add(TextStyleChannel.bold, props.bold ? attributeContributions.bold : undefined);
  add(TextStyleChannel.background, colorContribution(props.backgroundColor, true));
  add(TextStyleChannel.foreground, colorContribution(props.color, false));
  add(TextStyleChannel.dimColor, props.dimColor ? attributeContributions.dimColor : undefined);
  return contributions;
}

/** One colour channel's contribution, with `default` selecting the terminal's own. */
export function colorContribution(
  color: unknown,
  background: boolean,
): TextStyleContribution | undefined {
  if (!color) return undefined;
  const end = background ? backgroundEndCode : foregroundEndCode;
  const close = sgrToken(end, end);
  if (isTerminalDefaultColor(color)) return { open: close, close, reopens: false };
  const parsed = parseColorValue(color);
  if (parsed === undefined) return undefined;
  return { open: sgrToken(sgrCodeForColor(parsed, background), end), close, reopens: true };
}
