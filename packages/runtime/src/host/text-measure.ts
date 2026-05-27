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
    } else if (child.type === "transform") {
      // Recurse into transform's children for measurement (transforms are
      // applied at paint time, not measurement time).
      let innerText = "";
      for (const grandchild of child.children) {
        if (grandchild.type === "text-leaf") {
          innerText += grandchild.value;
        } else if (grandchild.type === "virtual-text" || grandchild.type === "text") {
          innerText += flattenLeaves(grandchild);
        }
      }
      if (child.transform) innerText = child.transform(innerText, 0);
      out += innerText;
    }
    // Skip comments inserted by Vue for null/undefined renders
  }
  return out;
}

export type WrapMode = NonNullable<TextProps["wrap"]>;

/**
 * Slice `text` from the start so the result is at most `maxCols` columns wide.
 * `slice-ansi` can overshoot when a wide character straddles the boundary, so
 * we reduce the slice position until the result fits.
 */
function safeSliceEnd(text: string, maxCols: number): string {
  if (maxCols <= 0) return "";
  let sliced = sliceAnsi(text, 0, maxCols);
  let w = stringWidth(sliced);
  while (w > maxCols && maxCols > 0) {
    maxCols--;
    sliced = sliceAnsi(text, 0, maxCols);
    w = stringWidth(sliced);
  }
  return sliced;
}

/**
 * Slice `text` from the end so the result is at most `maxCols` columns wide.
 */
function safeSliceStart(text: string, maxCols: number): string {
  if (maxCols <= 0) return "";
  const totalWidth = stringWidth(text);
  let start = totalWidth - maxCols;
  let sliced = sliceAnsi(text, start);
  let w = stringWidth(sliced);
  while (w > maxCols && start < totalWidth) {
    start++;
    sliced = sliceAnsi(text, start);
    w = stringWidth(sliced);
  }
  return sliced;
}

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
      return [safeSliceEnd(single, room) + ellipsis];
    case "truncate-start":
      return [ellipsis + safeSliceStart(single, room)];
    case "truncate-middle": {
      const half = Math.floor(room / 2);
      const left = safeSliceEnd(single, half);
      const rightCols = room - stringWidth(left);
      const right = safeSliceStart(single, rightCols);
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
