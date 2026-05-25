import chalk, { type ChalkInstance } from "chalk";
import type { TextProps } from "../host/nodes.ts";

export function applyColor(
  c: ChalkInstance,
  color: string | [number, number, number],
  bg: boolean,
): ChalkInstance {
  if (Array.isArray(color)) {
    return bg ? c.bgRgb(color[0], color[1], color[2]) : c.rgb(color[0], color[1], color[2]);
  }
  if (typeof color !== "string") return c;
  if (color.startsWith("#")) return bg ? c.bgHex(color) : c.hex(color);
  if (color.startsWith("rgb(")) {
    const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (m) {
      const [r, g, b] = [+m[1]!, +m[2]!, +m[3]!];
      return bg ? c.bgRgb(r, g, b) : c.rgb(r, g, b);
    }
  }
  if (color.startsWith("ansi(")) {
    const n = +color.slice(5, -1);
    return bg ? c.bgAnsi256(n) : c.ansi256(n);
  }
  if (color.startsWith("ansi256(")) {
    const n = +color.slice(8, -1);
    return bg ? c.bgAnsi256(n) : c.ansi256(n);
  }
  const key = bg ? bgKey(color) : color;
  const fn = (c as never as Record<string, ChalkInstance>)[key];
  return fn ?? c;
}

function bgKey(name: string): string {
  return "bg" + name.charAt(0).toUpperCase() + name.slice(1);
}

export function applyChalk(text: string, props: TextProps): string {
  let style: ChalkInstance = chalk;
  if (props.color) style = applyColor(style, props.color as never, false);
  if (props.backgroundColor) style = applyColor(style, props.backgroundColor as never, true);
  if (props.dimColor) style = style.dim;
  if (props.bold) style = style.bold;
  if (props.italic) style = style.italic;
  if (props.underline) style = style.underline;
  if (props.strikethrough) style = style.strikethrough;
  if (props.inverse) style = style.inverse;
  return style(text);
}
