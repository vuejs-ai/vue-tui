import cliTruncate from "cli-truncate";
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
export function safeSliceEnd(text: string, maxCols: number): string {
  if (maxCols <= 0) return "";
  let end = maxCols;
  let sliced = sliceAnsi(text, 0, end);
  let w = stringWidth(sliced);
  while (w > maxCols && end > 0) {
    end--;
    sliced = sliceAnsi(text, 0, end);
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

  // truncate variants — delegate to cli-truncate (grapheme-aware, ellipsis
  // within budget, preserves \n). Matches Ink's wrapText truncate path.
  const position =
    mode === "truncate-start" ? "start" : mode === "truncate-middle" ? "middle" : "end";
  return cliTruncate(text, width, { position }).split("\n");
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
