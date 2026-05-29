import cliTruncate from "cli-truncate";
import sliceAnsi from "slice-ansi";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import type { TextProps, TuiText, TuiVirtualText } from "./nodes.ts";

export function flattenLeaves(node: TuiText | TuiVirtualText): string {
  if (!node.children || node.children.length === 0) return "";
  let out = "";
  // `index` is the child's POSITIONAL index among ALL siblings — the plain loop
  // counter over node.children, matching Ink squash-text-nodes.ts:13,38 (index
  // is the loop position over node.childNodes). Must use the SAME index basis as
  // paint.ts renderTextWithInlineStyles so measurement and paint agree on what a
  // nested <Transform> receives as its second argument.
  node.children.forEach((child, index) => {
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
      // Only apply the transform when there is actual text content — matches
      // paint.ts `innerText.length > 0` guard and Ink squash-text-nodes.ts:34
      // (`nodeText.length > 0`). Without this guard, a transform that adds chars
      // to empty text inflates measured width relative to what paint renders.
      if (innerText.length > 0 && child.transform) innerText = child.transform(innerText, index);
      out += innerText;
    }
    // Skip comments inserted by Vue for null/undefined renders
  });
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
  //
  // Optimisation: if every line already fits within `width`, return lines
  // as-is. This avoids cliTruncate treating the whole multi-line string as
  // a single run when no truncation is actually needed (which would collapse
  // perfectly-fitting multi-line text to one truncated line).
  const lines = text.split("\n");
  if (lines.every((l) => stringWidth(l) <= width)) return lines;
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

/**
 * Natural (unwrapped) dimensions of `text`, mode-independent. Mirrors Ink's
 * measure-text.js: width = widest line, height = number of \n-separated lines.
 */
export function measureTextNatural(text: string): { width: number; height: number } {
  const lines = text.split("\n");
  let width = 0;
  for (const line of lines) width = Math.max(width, stringWidth(line));
  return { width, height: lines.length };
}
