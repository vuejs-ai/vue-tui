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

export function applyColor(
  c: ChalkInstance,
  color: string | [number, number, number],
  bg: boolean,
): ChalkInstance {
  if (Array.isArray(color)) {
    return bg ? c.bgRgb(color[0], color[1], color[2]) : c.rgb(color[0], color[1], color[2]);
  }
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
  if (props.color) s = applyColor(chalk, props.color as never, false)(s);
  if (props.backgroundColor) s = applyColor(chalk, props.backgroundColor as never, true)(s);
  if (props.bold) s = chalk.bold(s);
  if (props.italic) s = chalk.italic(s);
  if (props.underline) s = chalk.underline(s);
  if (props.strikethrough) s = chalk.strikethrough(s);
  if (props.inverse) s = chalk.inverse(s);
  return s;
}
