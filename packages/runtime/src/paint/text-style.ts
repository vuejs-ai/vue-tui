import chalk, { type ChalkInstance } from "chalk";
import type { TextProps } from "../host/nodes.ts";

// Mirror Ink's colorize.ts (commit 40b3a75) EXACTLY for the accepted color
// forms and its "no match -> bare text (no codes)" fallback. The regexes below
// match Ink's `ansiRegex`/`rgbRegex` byte-for-byte so an unparseable or
// unsupported color string produces no SGR codes (returning the chalk instance
// unchanged) instead of emitting a NaN SGR. In particular Ink supports only
// `ansi256(N)` (validated by a numeric capture) — `ansi(...)` is NOT a form and
// must fall through to bare text.
const rgbRegex = /^rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)$/;
const ansi256Regex = /^ansi256\(\s?(\d+)\s?\)$/;

export function applyColor(c: ChalkInstance, color: unknown, bg: boolean): ChalkInstance {
  if (typeof color !== "string") return c;
  // Named chalk color (validated by presence of the method, like Ink's
  // `color in chalk`): apply when known, otherwise fall through to bare text.
  const key = bg ? bgKey(color) : color;
  const named = (c as never as Record<string, ChalkInstance>)[key];
  if (typeof named === "function") return named;
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
 * flushPostFlushCbs and wedges the scheduler, where onErrorCaptured can't catch it
 * (cf. the borderStyle fix #124). Returning a flag lets the component throw during
 * render so vue-tui's error boundary (onErrorCaptured → ErrorOverview) handles it.
 *
 * Only the in-chalk-but-no-bg-method case is rejected; valid colors, hex,
 * ansi256, rgb strings, and unknown non-chalk strings all return false.
 */
export function isInvalidBackgroundColor(color: unknown): boolean {
  // Only a non-empty string can be a chalk name. Non-strings, undefined, null,
  // hex/ansi256/rgb strings (not `in chalk`) all fall through to `false`.
  if (typeof color !== "string" || color.length === 0) return false;
  const isInChalk = color in (chalk as unknown as Record<string, unknown>);
  if (!isInChalk) return false;
  const bgMethod = (chalk as unknown as Record<string, unknown>)[bgKey(color)];
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
  const method = (chalk as unknown as Record<string, unknown>)[color];
  return color in (chalk as unknown as Record<string, unknown>) && typeof method !== "function";
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

export function applyChalk(text: string, props: TextProps): string {
  // Mirror Ink's Text.tsx `transform` (commit 40b3a75): apply each enabled
  // style as its OWN nested chalk call, in the exact order
  // dim -> color -> backgroundColor -> bold -> italic -> underline ->
  // strikethrough -> inverse. This produces individually-balanced open/close
  // pairs (e.g. dim+bold re-opens bold after dim's SGR-22 reset), which is
  // byte-identical to Ink. A single chained ChalkInstance would emit a
  // different, non-Ink byte sequence for any multi-style Text (G68).
  let s = text;
  if (props.dimColor) s = chalk.dim(s);
  if (props.color) s = applyColor(chalk, props.color, false)(s);
  if (props.backgroundColor) s = applyColor(chalk, props.backgroundColor, true)(s);
  if (props.bold) s = chalk.bold(s);
  if (props.italic) s = chalk.italic(s);
  if (props.underline) s = chalk.underline(s);
  if (props.strikethrough) s = chalk.strikethrough(s);
  if (props.inverse) s = chalk.inverse(s);
  return s;
}
