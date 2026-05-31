import cliTruncate from "cli-truncate";
import sliceAnsi from "slice-ansi";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import { sanitizeAnsi } from "../paint/sanitize-ansi.ts";
import type { TextProps, TuiNode, TuiText, TuiTransform, TuiVirtualText } from "./nodes.ts";

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
  // Sanitize the measured string so MEASURE+WRAP operate on the SAME bytes PAINT
  // emits — parity gap #9. Ink's squashTextNodes returns sanitizeAnsi(text)
  // (squash-text-nodes.ts:45); dom.ts:227 measures that squash and
  // render-node-to-output.ts:141-150 wraps it, so a control sequence sanitizeAnsi
  // STRIPS at paint never reaches string-width OR wrap-ansi in Ink. Without this
  // sanitize, our raw measure/wrap diverges from paint in one of two distinct ways,
  // depending on whether the control sequence has a visible width:
  //
  //   * WIDTH mis-measure (e.g. ESC#8/DECALN): string-width("A\x1b#8BC") is 2, but
  //     paint strips ESC#8 and emits the 3-column "ABC". A raw measure UNDER-sizes
  //     the yoga cell, so at a tight width the trailing visible char is clipped
  //     (vue rendered "AB" for "A\x1b#8BC" at width 3).
  //   * WRAP-step break (e.g. erase-line CSI \x1b[2K): here raw and sanitized
  //     string-width are EQUAL (both count \x1b[2K as zero), so width is fine — but
  //     wrap-ansi doesn't recognise the \x1b[2K CSI and returns "abCD\x1b[2Kef"
  //     un-wrapped on one line, so at width 4 the trailing "ef" overflows the
  //     single-line cell and is clipped. Feeding the sanitized "abCDef" instead
  //     wraps correctly to "abCD" / "ef".
  //
  // Sanitizing the squash output here fixes BOTH for the same reason: measure and
  // wrap then see the identical stripped string paint emits. This is the measure
  // twin of paint's renderTextWithInlineStyles (which also ends in sanitizeAnsi);
  // because flattenLeaves recurses into nested <Text> children, the sanitize runs
  // at EVERY nesting level, exactly like Ink's recursive squashTextNodes, and
  // sanitizeAnsi is idempotent so the nested re-sanitization is harmless. This
  // single output feeds measureTextNatural, bindTextMeasure, and wrapText.
  // (Note: sanitizeAnsi PRESERVES OSC sequences, so this does NOT fix the
  // non-hyperlink-OSC overflow-wrap case — that is a separate Output-grid-clip
  // gap; see the skipped test in text.test.tsx.)
  return sanitizeAnsi(out);
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

// Squash the direct inline children of a STANDALONE <Transform> into measured
// text (G58). In Ink a <Transform> is an ink-text host whose measure func uses
// squashTextNodes — which squashes child text and applies CHILD transforms, but
// NEVER the node's own internal_transform (that runs only at Output paint time).
// We therefore reuse the same per-child squash as flattenLeaves and deliberately
// do NOT apply `node.transform`, so the reserved width matches Ink's measure.
export function flattenTransformLeaves(node: TuiTransform): string {
  if (!node.children || node.children.length === 0) return "";
  let out = "";
  let transformIndex = 0;
  for (const child of node.children) {
    out += squashTransformChild(child, transformIndex);
    if (child.type !== "comment") transformIndex++;
  }
  // Sanitize for the same reason as flattenLeaves (parity gap #9; see that comment
  // for the two distinct width/wrap mechanisms): the standalone <Transform> measure
  // func feeds this into measureTextNatural/wrapText, and the paint twin
  // renderTransformAsText also ends in sanitizeAnsi — so measure+wrap must see the
  // same sanitized string paint produces.
  return sanitizeAnsi(out);
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

  if (mode === "wrap" || mode === "hard") {
    // Mirror Ink's render-node-to-output.ts:144-150: only invoke wrap-ansi when
    // the text is actually wider than the cell (`currentWidth > maxWidth`).
    // wrap-ansi@10 cannot account for the visible width of NON-hyperlink OSC
    // sequences (its regex only recognises SGR and `]8;;` links), so it counts an
    // OSC payload like a set-title `ESC]0;…BEL` as visible columns and re-wraps —
    // mangling the following text. string-width DOES discount those bytes, so when
    // the text already fits we must pass it through verbatim rather than asking
    // wrap-ansi to "wrap" it. This also matches Ink, which skips wrapText entirely
    // for fitting text. Splitting on `\n` preserves any embedded hard newlines,
    // exactly as Ink's `output.write` does for the unwrapped string.
    if (measureTextNatural(text).width <= width) return text.split("\n");

    if (mode === "wrap") {
      return wrapAnsi(text, width, { hard: true, trim: false }).split("\n");
    }

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
