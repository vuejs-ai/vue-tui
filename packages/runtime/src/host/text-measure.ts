import sliceAnsi from "slice-ansi";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import type { TextProps, TuiText, TuiVirtualText } from "./nodes.ts";

export function flattenLeaves(node: TuiText | TuiVirtualText): string {
  if (!node.children || node.children.length === 0) return "";
  let out = "";
  for (const child of node.children) {
    if (child.type === "text-leaf") {
      out += child.value;
    } else if (child.type === "virtual-text") {
      out += flattenLeaves(child);
    }
    // Skip comments inserted by Vue for null/undefined renders
  }
  return out;
}

export type WrapMode = NonNullable<TextProps["wrap"]>;

export function wrapText(text: string, width: number, mode: WrapMode = "wrap"): string[] {
  if (width <= 0) return [""];

  if (mode === "wrap") {
    return wrapAnsi(text, width, { hard: true, trim: false }).split("\n");
  }

  if (mode === "hard") {
    // `wordWrap: false` ensures breaks happen at the exact character boundary,
    // not at word boundaries. This is what Ink's "hard" wrap mode does.
    return wrapAnsi(text, width, { hard: true, trim: false, wordWrap: false }).split("\n");
  }

  // truncate variants: collapse newlines, then slice from the appropriate side.
  const single = text.replace(/\n/g, " ");
  if (stringWidth(single) <= width) return [single];

  const ellipsis = "…";
  const room = Math.max(0, width - stringWidth(ellipsis));
  switch (mode) {
    case "truncate":
    case "truncate-end":
      return [sliceAnsi(single, 0, room) + ellipsis];
    case "truncate-start":
      return [ellipsis + sliceAnsi(single, stringWidth(single) - room)];
    case "truncate-middle": {
      const half = Math.floor(room / 2);
      const left = sliceAnsi(single, 0, half);
      const right = sliceAnsi(single, stringWidth(single) - (room - half));
      return [left + ellipsis + right];
    }
  }
}

export function measureText(
  text: string,
  width: number,
  mode: WrapMode = "wrap",
): { width: number; height: number } {
  const wrapped = wrapText(text, width, mode);
  return {
    width: wrapped.reduce((max, line) => Math.max(max, stringWidth(line)), 0),
    height: wrapped.length,
  };
}
