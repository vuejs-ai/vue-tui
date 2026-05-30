import cliTruncate from "cli-truncate";
import sliceAnsi from "slice-ansi";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import type { TextProps, TuiNode, TuiText, TuiVirtualText } from "./nodes.ts";

export function flattenLeaves(node: TuiText | TuiVirtualText): string {
  if (!node.children || node.children.length === 0) return "";
  let out = "";
  // `transformIndex` advances only for children React would have produced as DOM
  // childNodes — matching Ink squash-text-nodes.ts:13 (the loop position over
  // node.childNodes). Vue materializes null/v-if/false renders as COMMENT host
  // nodes that occupy a positional slot in node.children, but React skips null
  // children, so comments must NOT advance the index. This is the measurement
  // twin of paint.ts renderTextWithInlineStyles and MUST use the SAME index
  // basis so a nested <Transform> receives the same second argument at measure
  // and paint time — keeping reserved width in sync (G52). Real-sibling
  // positional indexing (G21) is preserved.
  let transformIndex = 0;
  for (const child of node.children) {
    out += squashTransformChild(child, transformIndex);
    if (child.type !== "comment") transformIndex++;
  }
  return out;
}

// Squash a single child into measured text, recursing GENERICALLY into
// transform-typed children to ANY nesting depth — mirroring Ink's
// squash-text-nodes.ts:22-39 (the measure path dom.ts:227 uses the SAME
// squashTextNodes as paint). A <Transform> nested directly inside another
// <Transform> is itself a transform child and MUST be recursed into, or its
// content is dropped and the box measures 0 width (G32). This is the measurement
// twin of paint.ts squashTransformChild and MUST stay behaviourally identical so
// layout and paint agree: same positional `index` (G21) and the same
// `innerText.length > 0` guard (Ink squash-text-nodes.ts:34).
function squashTransformChild(child: TuiNode, index: number): string {
  if (child.type === "text-leaf") {
    return child.value;
  }
  if (child.type === "virtual-text" || child.type === "text") {
    return flattenLeaves(child);
  }
  if (child.type === "transform") {
    let innerText = "";
    // Recursive twin of the G52 fix in flattenLeaves: a grandchild's positional
    // index must skip Vue comment nodes (null/v-if/false renders) so a `{null}`
    // inside this OUTER <Transform> does not shift an INNER <Transform>'s index —
    // and so measure and paint agree on every nested transform's second argument
    // (keeping reserved width in sync). Advancing only for real children preserves
    // G32's transform-in-transform recursion to any depth.
    let grandIndex = 0;
    for (const grandchild of child.children) {
      innerText += squashTransformChild(grandchild, grandIndex);
      if (grandchild.type !== "comment") grandIndex++;
    }
    if (innerText.length > 0 && child.transform) innerText = child.transform(innerText, index);
    return innerText;
  }
  // Comments, boxes, etc. contribute nothing to measured text.
  return "";
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
