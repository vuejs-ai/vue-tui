import { Chalk, type ChalkInstance } from "chalk";
import type { TerminalStyle } from "./terminal-style.ts";

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

// Validation is grammar-only. It must not inherit the process's terminal or
// color environment just because Chalk was imported in this module.
const chalkGrammar = new Chalk({ level: 1 });

// Accepted functional colors are rgb(R,G,B) and ansi256(N). An unparseable or
// unsupported string leaves the text unchanged instead of emitting an invalid
// SGR sequence; ansi(N) is not an accepted form.
const rgbRegex = /^rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)$/;
const ansi256Regex = /^ansi256\(\s?(\d+)\s?\)$/;

function chalkProperty(instance: ChalkInstance, key: string): unknown {
  // Chalk is a callable proxy with dynamic named-color properties that its
  // public type cannot enumerate. Keep that dynamic lookup in one read-only
  // boundary and validate every result before use.
  const property: unknown = Reflect.get(instance, key);
  return property;
}

export function isForegroundResetColor(color: unknown): boolean {
  return color === "default";
}

export function isBackgroundResetColor(color: unknown): boolean {
  return color === "default";
}

function resetForeground(text: string, style: TerminalStyle): string {
  return style.colorLevel > 0 ? `\x1b[39m${text}\x1b[39m` : text;
}

function resetBackground(text: string, style: TerminalStyle): string {
  return style.colorLevel > 0 ? `\x1b[49m${text}\x1b[49m` : text;
}

export function applyColor(style: TerminalStyle, color: unknown, bg: boolean): ChalkInstance {
  const chalk = style.chalk;
  if (style.colorLevel === 0) return chalk;
  if (typeof color !== "string") return chalk;
  // Apply a named Chalk method when present; otherwise leave the text bare.
  const key = bg ? bgKey(color) : color;
  const named = chalkProperty(chalk, key);
  if (typeof named === "function") return named as ChalkInstance;
  if (color.startsWith("#")) return bg ? chalk.bgHex(color) : chalk.hex(color);
  if (color.startsWith("ansi256")) {
    const m = ansi256Regex.exec(color);
    if (!m) return chalk;
    const n = Number(m[1]);
    return bg ? chalk.bgAnsi256(n) : chalk.ansi256(n);
  }
  if (color.startsWith("rgb")) {
    const m = rgbRegex.exec(color);
    if (!m) return chalk;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return bg ? chalk.bgRgb(r, g, b) : chalk.rgb(r, g, b);
  }
  return chalk;
}

function bgKey(name: string): string {
  return "bg" + name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Detect a backgroundColor value that resolves to a Chalk property but has no
 * corresponding background method.
 *
 * A Chalk modifier name (`bold`/`dim`/`italic`/`underline`/
 * `inverse`/`hidden`/`strikethrough`/`reset`/`overline`/`visible`) is `in chalk`
 * but has NO `bg*` method, so the call is `chalk[undefined-method](str)` and throws
 * "chalk.bgBold is not a function". A chalk COLOR name resolves to a real `bg*`
 * method (works); a string NOT in chalk falls through to bare text (no throw).
 *
 * vue-tui mirrors that throw, but VALIDATES here at component-render time (not in
 * paint): a raw throw in the post-flush paint pass unwinds through Vue's
 * flushPostFlushCbs outside Vue's component error propagation (cf. the borderStyle
 * fix #124). Returning a flag lets the component throw during render so user
 * capture hooks and the app error handler receive it through Vue normally.
 *
 * Only the in-chalk-but-no-bg-method case is rejected; valid colors, hex,
 * ansi256, rgb strings, and unknown non-chalk strings all return false.
 */
export function isInvalidBackgroundColor(color: unknown): boolean {
  // Only a non-empty string can be a chalk name. Non-strings, undefined, null,
  // hex/ansi256/rgb strings (not `in chalk`) all fall through to `false`.
  if (typeof color !== "string" || color.length === 0) return false;
  const isInChalk = color in chalkGrammar;
  if (!isInChalk) return false;
  const bgMethod = chalkProperty(chalkGrammar, bgKey(color));
  return typeof bgMethod !== "function";
}

/**
 * Detect a foreground color value that resolves to a non-callable Chalk property.
 *
 * Real colors and modifiers (`red`, `bold`) are callable, while properties such
 * as `level` are not.
 */
export function isInvalidForegroundColor(color: unknown): boolean {
  if (typeof color !== "string" || color.length === 0) return false;
  const method = chalkProperty(chalkGrammar, color);
  return color in chalkGrammar && typeof method !== "function";
}

/**
 * Throw during component render if `color` is a Chalk modifier used as a
 * backgroundColor. `label` names the offending prop in the message.
 */
export function assertValidBackgroundColor(color: unknown, label = "backgroundColor"): void {
  if (isInvalidBackgroundColor(color)) {
    throw new Error(
      `Invalid ${label}: ${JSON.stringify(color)} (chalk has no bg method for it — ` +
        `it is a text modifier, not a background color)`,
    );
  }
}

/**
 * Throw during component render for foreground names that resolve to a
 * non-callable Chalk property. `label` names the offending prop.
 */
export function assertValidForegroundColor(color: unknown, label = "color"): void {
  if (isInvalidForegroundColor(color)) {
    throw new Error(
      `Invalid ${label}: ${JSON.stringify(color)} (chalk has this key but it is not a color method)`,
    );
  }
}

export function applyChalk(style: TerminalStyle, text: string, props: TextStyleProps): string {
  // Apply each enabled style as its own nested Chalk call, in the order
  // dim -> color -> backgroundColor -> bold -> italic -> underline ->
  // strikethrough -> inverse. This produces individually-balanced open/close
  // pairs (e.g. dim+bold re-opens bold after dim's SGR-22 reset). A single
  // chained ChalkInstance would produce different reset placement.
  const chalk = style.chalk;
  let s = text;
  if (props.dimColor) s = chalk.dim(s);
  if (props.color) {
    s = isForegroundResetColor(props.color)
      ? resetForeground(s, style)
      : applyColor(style, props.color, false)(s);
  }
  if (props.backgroundColor) {
    s = isBackgroundResetColor(props.backgroundColor)
      ? resetBackground(s, style)
      : applyColor(style, props.backgroundColor, true)(s);
  }
  if (props.bold) s = chalk.bold(s);
  if (props.italic) s = chalk.italic(s);
  if (props.underline) s = chalk.underline(s);
  if (props.strikethrough) s = chalk.strikethrough(s);
  if (props.inverse) s = chalk.inverse(s);
  return s;
}
