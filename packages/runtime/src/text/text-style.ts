// Authored style props resolved into the structured fields a cell holds. Every
// colour is carried at full fidelity; the frame encoder owns degradation to the
// host's resolved colour level, so nothing here reads a capability.
import ansiStyles from "ansi-styles";
import { StyleAttribute, type Color } from "../frame/style.ts";
import { backgroundEndCode, foregroundEndCode } from "./cell-style.ts";

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
 * One channel a Text's props resolve for its subtree.
 *
 * `close` is the SGR sequence that ends the channel. A colour prop selecting
 * the terminal's own colour writes exactly that sequence: an actively reset
 * channel has no structured field to carry it, so the pair it opens is its own
 * close.
 */
export type TextStyleContribution =
  | {
      readonly kind: "foreground" | "background";
      readonly close: string;
      readonly color: Color;
    }
  | { readonly kind: "attribute"; readonly close: string; readonly attribute: number };

/**
 * One contribution as it stands over a stretch of content: which host's props
 * opened it, and which channels the hosts inside that one resolve for the same
 * stretch.
 *
 * Both are identity, not style. Two neighbouring chunks continue one span only
 * when they name the same `owner` and the same `enclosed` channels — that is
 * exactly the stretch the string pipeline wrapped in one open and one close,
 * and content SGR left open at the end of the first chunk survives into the
 * second only there. `owner` is an opaque object because the hosts live in
 * `host/`, which `text/` may not import.
 */
export interface TextStyleSpan {
  readonly contribution: TextStyleContribution;
  /** The inline host whose props opened this span. */
  readonly owner: object;
  /** The channels the hosts inside `owner` resolve for this chunk. */
  readonly enclosed: number;
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

/** The colour a channel actively resets to the terminal's own. */
const terminalDefaultColor: Color = { kind: "default" };

const attributeContributions = {
  dimColor: { kind: "attribute", close: "\x1b[22m", attribute: StyleAttribute.dim },
  bold: { kind: "attribute", close: "\x1b[22m", attribute: StyleAttribute.bold },
  italic: { kind: "attribute", close: "\x1b[23m", attribute: StyleAttribute.italic },
  underline: { kind: "attribute", close: "\x1b[24m", attribute: StyleAttribute.underline },
  strikethrough: {
    kind: "attribute",
    close: "\x1b[29m",
    attribute: StyleAttribute.strikethrough,
  },
  inverse: { kind: "attribute", close: "\x1b[27m", attribute: StyleAttribute.inverse },
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
  const kind = background ? "background" : "foreground";
  const close = background ? backgroundEndCode : foregroundEndCode;
  if (isTerminalDefaultColor(color)) return { kind, close, color: terminalDefaultColor };
  const parsed = parseColorValue(color);
  return parsed === undefined ? undefined : { kind, close, color: parsed };
}
