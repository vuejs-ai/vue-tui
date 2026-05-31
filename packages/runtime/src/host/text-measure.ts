import cliTruncate from "cli-truncate";
import sliceAnsi from "slice-ansi";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import { tokenizeAnsi } from "../paint/ansi-tokenizer.ts";
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

// Grapheme segmenter shared across calls (constructing one is non-trivial). Locale-independent:
// we only segment, never collate, so the default locale's segmentation rules suffice.
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Strip ALL ANSI from `text`, returning only its visible code points. Reuses the paint
 * tokenizer (the same one sanitizeAnsi uses) rather than a strip-ansi regex dep: every
 * non-`text` token — SGR, OSC hyperlinks, control strings — is dropped, so the result is the
 * exact visible string wrap-ansi must lay out. (wrap-ansi recognises SGR/OSC8 and would
 * byte-split SGR at width<=0; feeding it the plain string sidesteps that bug entirely.)
 */
function stripAnsi(text: string): string {
  let out = "";
  for (const token of tokenizeAnsi(text)) {
    if (token.type === "text") out += token.value;
  }
  return out;
}

/**
 * Replicate wrap-ansi's width<=0 layout for a (possibly STYLED) string, ANSI-awarely.
 *
 * The output's LINE STRUCTURE exactly equals `wrapAnsi(stripAnsi(text), 0, {hard, trim:false})
 * .split("\n")` — wrap-ansi's authoritative width-0 layout. wrap-ansi breaks BEFORE each
 * grapheme it cannot fit, so an interior zero-width grapheme (ZWSP/ZWNJ/ZWJ, combining mark,
 * VS16, soft-hyphen, BOM) lands on its OWN row with the surrounding `""` blanks — but a
 * TRAILING zero-width run (nothing visible after it) stays glued to the preceding grapheme's
 * row (wrapAnsi("中​",0)=["","中​"], not ["","中","​"]). Deriving structure from wrap-ansi on
 * the plain string reproduces both cases for free; the old column-stepping `slice(col,col+1)`
 * could not (it glued an interior zero-width onto the next grapheme → line-count too low, and
 * `break`-ed on a leading zero-width + wide glyph → dropped the rest of the line).
 *
 * Styling is re-applied in lockstep: the plain and styled strings share an identical grapheme
 * sequence (SGR/OSC are zero-width), so each NON-EMPTY plain line maps to a contiguous run of
 * graphemes (USUALLY one, but a trailing zero-width run makes it several — e.g. "中​"). We slice
 * that run out of the STYLED text with slice-ansi via the same slot model wrap-ansi's plain
 * layout implies, so slice-ansi re-emits the active SGR span around it (e.g. "\x1b[41mA\x1b[49m")
 * and keeps a wide glyph whole — matching Ink's per-grapheme colored output. We never let
 * wrap-ansi touch the styled string (it byte-splits the escapes at width<=0); we only ask it
 * for structure.
 */
function wrapZeroWidthAnsi(text: string): string[] {
  // NFC-normalize first: wrap-ansi (and therefore vue's NORMAL-width wrap path, which feeds
  // the styled string straight to wrapAnsi) composes combining sequences (e.g. "á" →
  // "á"). Deriving structure from wrapAnsi(stripAnsi(text)) yields composed rows, so the
  // styled slices must be composed too or they'd diverge (same glyph/width/line-count, but
  // different code points than the normal-width path + Ink). SGR/OSC bytes are ASCII → NFC-invariant.
  text = text.normalize("NFC");
  const result: string[] = [];
  // Process each hard-newline line independently so `\n` never enters the grapheme walk
  // (wrap-ansi joins line-blocks with `\n`, so each input line contributes its own block).
  const styledLines = text.split("\n");
  for (const styledLine of styledLines) {
    const plainLine = stripAnsi(styledLine);
    const plainLines = wrapAnsi(plainLine, 0, { hard: true, trim: false }).split("\n");

    // Assign each grapheme of the plain line a slice-ansi slot range: a grapheme occupies
    // max(1, visibleWidth) slots (a zero-width grapheme gets 1 slot of its own; a wide glyph 2).
    // We re-style by mapping each non-empty plain line to the slot range covering its graphemes
    // and slicing the STYLED text there (slice-ansi re-emits the active SGR span around it).
    const slotEnds: number[] = []; // slotEnds[i] = end slot of the i-th grapheme
    let slot = 0;
    for (const { segment } of graphemeSegmenter.segment(plainLine)) {
      slot += Math.max(1, stringWidth(segment));
      slotEnds.push(slot);
    }

    // Walk wrap-ansi's plain layout. An empty row passes through verbatim; a non-empty row
    // consumes as many graphemes as it contains (one, or several for a trailing zero-width run),
    // and we emit the styled slice over that grapheme run's slot range.
    let graphemeIndex = 0;
    for (const line of plainLines) {
      if (line === "") {
        result.push("");
        continue;
      }
      const startSlot = graphemeIndex === 0 ? 0 : slotEnds[graphemeIndex - 1]!;
      const graphemeCount = [...graphemeSegmenter.segment(line)].length;
      graphemeIndex += graphemeCount;
      const endSlot = slotEnds[graphemeIndex - 1] ?? startSlot;
      result.push(sliceAnsi(styledLine, startSlot, endSlot));
    }
  }
  return result;
}

export function wrapText(text: string, width: number, mode: WrapMode = "wrap"): string[] {
  // NO `width <= 0` short-circuit — Ink's wrapText (wrap-text.ts) has none either, and
  // a 0-width cell is an ordinary in-range value (flexBasis=0, width=0, width="0%", a
  // negative parsed percent). A 0-width cell forces non-empty text onto its OWN second
  // row (height 2) — that is exactly what makes Ink render "B\nA" beside a sibling instead
  // of DROPPING the text (vue's old `[""]` collapsed it to height 1, then paint overwrote
  // it with the sibling → "B"). For PLAIN text wrap-ansi already does this; for STYLED text
  // it would byte-corrupt the SGR codes at width<=0, so the wrap/hard branches route through
  // wrapZeroWidthAnsi (ANSI-safe) instead. Empty/zero-width text is unaffected: the fast-path
  // below returns [""] for it (and the yoga measure func short-circuits raw==="" before ever
  // calling here), so no spurious blank row appears. Negative widths flow identically.

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

    // ANSI-safe width<=0 wrap. We reach here only for NON-empty text wider than the
    // cell (the fast-path above already returned for empty/fitting text), so width<=0
    // means an undersized cell that forces every grapheme onto its own row. wrap-ansi@10
    // produces exactly that for PLAIN text — wrapAnsi("AB", 0) = "\nA\nB" (leading blank
    // line, one grapheme per line) — but it has a width<=0 bug: it cannot recognise the
    // SGR codes in a STYLED string and byte-splits them, so wrapAnsi("\x1b[41mA\x1b[49m", 0)
    // = "\x1b\n[\n4\n1\nm\nA\n…", scattering the escape bytes across rows and corrupting
    // the frame. Ink never hits this because it wraps the PLAIN squashed text and applies
    // color via a per-line transform AFTER wrapping; vue bakes color into the string before
    // wrapping, so we must reproduce wrap-ansi's plain-text layout ANSI-awarely. slice-ansi
    // is grapheme-aware and re-emits the active SGR span around each slice, matching Ink's
    // per-grapheme colored output (e.g. "B\n\x1b[41mA\x1b[49m" for a 0-width bg Box).
    if (width <= 0) return wrapZeroWidthAnsi(text);

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
