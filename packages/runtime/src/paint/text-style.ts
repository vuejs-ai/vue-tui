import { Chalk, type ChalkInstance } from "chalk";
import type { TextProps } from "../host/nodes.ts";
import type { TerminalStyle } from "./terminal-style.ts";

// Validation is grammar-only. It must not inherit the process's terminal or
// color environment just because Chalk was imported in this module.
const chalkGrammar = new Chalk({ level: 1 });

// Mirror Ink's colorize.ts (commit 40b3a75) EXACTLY for the accepted color
// forms and its "no match -> bare text (no codes)" fallback. The regexes below
// match Ink's `ansiRegex`/`rgbRegex` byte-for-byte so an unparseable or
// unsupported color string produces no SGR codes (returning the chalk instance
// unchanged) instead of emitting a NaN SGR. In particular Ink supports only
// `ansi256(N)` (validated by a numeric capture) — `ansi(...)` is NOT a form and
// must fall through to bare text.
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

export function applyColor(
  style: TerminalStyle,
  c: ChalkInstance,
  color: unknown,
  bg: boolean,
): ChalkInstance {
  if (style.colorLevel === 0) return c;
  if (typeof color !== "string") return c;
  // Named chalk color (validated by presence of the method, like Ink's
  // `color in chalk`): apply when known, otherwise fall through to bare text.
  const key = bg ? bgKey(color) : color;
  const named = chalkProperty(c, key);
  if (typeof named === "function") return named as ChalkInstance;
  if (color.startsWith("#")) return bg ? c.bgHex(color) : c.hex(color);
  if (color.startsWith("ansi256")) {
    const m = ansi256Regex.exec(color);
    if (!m) return c;
    const n = Number(m[1]);
    return bg ? c.bgAnsi256(n) : c.ansi256(n);
  }
  if (color.startsWith("rgb")) {
    const m = rgbRegex.exec(color);
    if (!m) return c;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return bg ? c.bgRgb(r, g, b) : c.rgb(r, g, b);
  }
  return c;
}

function bgKey(name: string): string {
  return "bg" + name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Detect a backgroundColor value that Ink's `colorize` would THROW on.
 *
 * Ink colorize.ts (commit 40b3a75): for a BACKGROUND it tests `isNamedColor` =
 * `color in chalk`; if so it builds `bg${Capitalize(color)}` and calls
 * `chalk[methodName]`. A chalk MODIFIER name (`bold`/`dim`/`italic`/`underline`/
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
 * Detect a foreground color value that Ink's `colorize` would THROW on.
 *
 * Ink's foreground path calls `chalk[color](str)` when `color in chalk`. That
 * works for real colors and modifiers (`red`, `bold`) but throws for non-method
 * chalk properties such as `level`.
 */
export function isInvalidForegroundColor(color: unknown): boolean {
  if (typeof color !== "string" || color.length === 0) return false;
  const method = chalkProperty(chalkGrammar, color);
  return color in chalkGrammar && typeof method !== "function";
}

/**
 * Throw (during component render) if `color` is a chalk-modifier-name
 * backgroundColor — the exact case Ink's colorize.ts throws on. No-op for every
 * valid background form. `label` names the offending prop in the message.
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
 * Throw during component render for foreground color names that Ink's paint path
 * would throw on. `label` names the offending prop in the message.
 */
export function assertValidForegroundColor(color: unknown, label = "color"): void {
  if (isInvalidForegroundColor(color)) {
    throw new Error(
      `Invalid ${label}: ${JSON.stringify(color)} (chalk has this key but it is not a color method)`,
    );
  }
}

export function applyChalk(style: TerminalStyle, text: string, props: TextProps): string {
  // Mirror Ink's Text.tsx `transform` (commit 40b3a75): apply each enabled
  // style as its OWN nested chalk call, in the exact order
  // dim -> color -> backgroundColor -> bold -> italic -> underline ->
  // strikethrough -> inverse. This produces individually-balanced open/close
  // pairs (e.g. dim+bold re-opens bold after dim's SGR-22 reset), which is
  // byte-identical to Ink. A single chained ChalkInstance would emit a
  // different, non-Ink byte sequence for any multi-style Text (G68).
  const chalk = style.chalk;
  let s = text;
  if (props.dimColor) s = chalk.dim(s);
  if (props.color) {
    s = isForegroundResetColor(props.color)
      ? resetForeground(s, style)
      : applyColor(style, chalk, props.color, false)(s);
  }
  if (props.backgroundColor) {
    s = isBackgroundResetColor(props.backgroundColor)
      ? resetBackground(s, style)
      : applyColor(style, chalk, props.backgroundColor, true)(s);
  }
  if (props.bold) s = chalk.bold(s);
  if (props.italic) s = chalk.italic(s);
  if (props.underline) s = chalk.underline(s);
  if (props.strikethrough) s = chalk.strikethrough(s);
  if (props.inverse) s = chalk.inverse(s);
  return s;
}
