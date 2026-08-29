import cliTruncate from "cli-truncate";
import sliceAnsi from "slice-ansi";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import {
  ansiCodesToString,
  styledCharsFromTokens,
  tokenize as tokenizeStyledAnsi,
  type StyledChar,
} from "@alcalzone/ansi-tokenize";
import { tokenizeAnsi } from "../paint/ansi-tokenizer.ts";
import { sanitizeAnsiMultiline } from "../paint/sanitize-ansi.ts";
import type { TextProps, TuiNode, TuiText, TuiVirtualText } from "./nodes.ts";

export function flattenLeaves(node: TuiText | TuiVirtualText): string {
  if (node.style.display === "none") return "";
  if (!node.children || node.children.length === 0) return "";
  let out = "";
  for (const child of node.children) {
    out += squashInlineChild(child);
  }
  // Sanitize the measured string so measure and wrap operate on the same visible
  // text that paint emits. Without this, raw measurement can disagree with paint
  // in two distinct ways, depending on whether a stripped control sequence has a
  // visible width:
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
  // at every nesting level. sanitizeAnsi is idempotent, so the nested pass is
  // harmless. The sanitized output feeds measureTextNatural, bindTextMeasure,
  // and wrapText.
  // Geometry-safe sanitization preserves OSC 8 hyperlinks, which wrap-ansi
  // understands, and drops other OSC commands before measurement and wrapping.
  return sanitizeAnsiMultiline(out);
}

// Squash a single child into measured text. Text leaves contribute their raw
// value; nested text / virtual-text recurse via flattenLeaves. Comments, boxes,
// and other non-text nodes contribute nothing.
function squashInlineChild(child: TuiNode): string {
  if (child.type === "text-leaf") {
    return child.value;
  }
  if (child.type === "tui-virtual-text" || child.type === "tui-text") {
    return flattenLeaves(child);
  }
  return "";
}

export type WrapMode = NonNullable<TextProps["wrap"]>;

const boldOpen = "\u001B[1m";
const dimOpen = "\u001B[2m";

function isIntensityStyle(style: StyledChar["styles"][number]): boolean {
  return style.code === boldOpen || style.code === dimOpen;
}

function firstStyledCharacterInSlice(
  text: string,
  start: number,
  end: number,
): StyledChar | undefined {
  let column = 0;
  for (const character of styledCharsFromTokens(tokenizeStyledAnsi(text))) {
    const width = Math.max(1, stringWidth(character.value));
    if (column >= start && column < end) return character;
    column += width;
  }
  return undefined;
}

/**
 * Preserve the complete intensity state at the first retained grapheme.
 *
 * `slice-ansi` drops an initial bold or dim open when both are active and a
 * later SGR 22 closes only one logical channel. Prefix any missing intensity
 * from the source cell after the library has selected the requested graphemes.
 */
export function sliceAnsiPreservingIntensity(text: string, start: number, end: number): string {
  const sliced = sliceAnsi(text, start, end);
  const expected = firstStyledCharacterInSlice(text, start, end);
  if (!expected) return sliced;

  const actual = styledCharsFromTokens(tokenizeStyledAnsi(sliced))[0];
  const actualCodes = new Set(actual?.styles.map((style) => style.code) ?? []);
  const missing = expected.styles.filter(
    (style) => isIntensityStyle(style) && !actualCodes.has(style.code),
  );
  return missing.length === 0 ? sliced : ansiCodesToString(missing) + sliced;
}

/**
 * Slice `text` from the start so the result is at most `maxCols` columns wide.
 * `slice-ansi` can overshoot when a wide character straddles the boundary, so
 * we reduce the slice position until the result fits.
 */
export function safeSliceEnd(text: string, maxCols: number): string {
  if (maxCols <= 0) return "";
  let end = maxCols;
  let sliced = sliceAnsiPreservingIntensity(text, 0, end);
  let w = stringWidth(sliced);
  while (w > maxCols && end > 0) {
    end--;
    sliced = sliceAnsiPreservingIntensity(text, 0, end);
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
 * The output's line structure equals wrap-ansi's width-0 layout for the given
 * mode: `wrap` uses `{hard:true, trim:false}`, while `hard` also sets
 * `wordWrap:false`. At width 0 `wordWrap:false` makes wrap-ansi emit an extra blank row
 * before each interior word's first grapheme (wrapAnsi("a b c",0,…,wordWrap:false) =
 * ["","a"," ","","b"," ","","c"] vs `wrap`'s ["","a"," ","b"," ","c"]), so `hard` measures
 * taller than `wrap`. Threading `mode` here keeps measurement and paint on the
 * same line structure.
 *
 * wrap-ansi breaks BEFORE each grapheme it cannot fit, so an interior zero-width grapheme
 * (ZWSP/ZWNJ/ZWJ, combining mark, VS16, soft-hyphen, BOM) lands on its OWN row with the
 * surrounding `""` blanks — but a TRAILING zero-width run (nothing visible after it) stays glued
 * to the preceding grapheme's row (wrapAnsi("中​",0)=["","中​"], not ["","中","​"]). Deriving
 * structure from wrap-ansi preserves both cases. Column-stepping cannot distinguish these
 * boundaries: it can attach an interior zero-width grapheme to the next grapheme or stop after
 * a leading zero-width plus wide glyph.
 *
 * Styling is re-applied in lockstep: the plain and styled strings share an identical grapheme
 * sequence (SGR/OSC are zero-width), so each NON-EMPTY plain line maps to a contiguous run of
 * graphemes (USUALLY one, but a trailing zero-width run makes it several — e.g. "中​"). We slice
 * that run out of the STYLED text with slice-ansi via the same slot model wrap-ansi's plain
 * layout implies, so slice-ansi re-emits the active SGR span around it (e.g. "\x1b[41mA\x1b[49m")
 * and keeps a wide glyph whole. wrap-ansi receives only the plain string because it byte-splits
 * escapes at width<=0; it supplies line structure, while slice-ansi handles the styled string.
 */
function wrapZeroWidthAnsi(text: string, mode: "wrap" | "hard"): string[] {
  // NFC-normalize first: wrap-ansi (and therefore vue's NORMAL-width wrap path, which feeds
  // the styled string straight to wrapAnsi) composes combining sequences (e.g. "á" →
  // "á"). Deriving structure from wrapAnsi(stripAnsi(text)) yields composed rows, so the
  // styled slices must be composed too or they'd diverge (same glyph/width/line-count, but
  // different code points than the normal-width path). SGR/OSC bytes are ASCII → NFC-invariant.
  text = text.normalize("NFC");
  const result: string[] = [];
  // Process each hard-newline line independently so `\n` never enters the grapheme walk
  // (wrap-ansi joins line-blocks with `\n`, so each input line contributes its own block).
  const styledLines = text.split("\n");
  // Pick wrap-ansi's width-0 options per mode: `hard` adds `wordWrap:false`
  // (extra blank row at each interior word boundary), while `wrap` does not. Only the
  // structural line count changes; the re-styling loop below maps each NON-EMPTY row to one
  // grapheme run regardless of how many extra "" rows hard mode interleaves.
  const wrapOptions =
    mode === "hard" ? { hard: true, trim: false, wordWrap: false } : { hard: true, trim: false };
  for (const styledLine of styledLines) {
    const plainLine = stripAnsi(styledLine);
    const plainLines = wrapAnsi(plainLine, 0, wrapOptions).split("\n");

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
      result.push(sliceAnsiPreservingIntensity(styledLine, startSlot, endSlot));
    }
  }
  return result;
}

export function wrapText(text: string, width: number, mode: WrapMode = "wrap"): string[] {
  // A 0-width cell is an ordinary in-range value (flexBasis=0, width=0,
  // width="0%", or a negative parsed percent). It forces non-empty text onto a
  // second row so measurement reserves the row that paint will use. For plain text
  // wrap-ansi already does this; for styled text
  // it would byte-corrupt the SGR codes at width<=0, so the wrap/hard branches route through
  // wrapZeroWidthAnsi (ANSI-safe) instead. Empty/zero-width text is unaffected: the fast-path
  // below returns [""] for it (and the yoga measure func short-circuits raw==="" before ever
  // calling here), so no spurious blank row appears. Negative widths flow identically.

  if (mode === "wrap" || mode === "hard") {
    // Only invoke wrap-ansi when the text is wider than the cell.
    // wrap-ansi@10 cannot account for the visible width of NON-hyperlink OSC
    // sequences (its regex only recognises SGR and `]8;;` links), so it counts an
    // OSC payload like a set-title `ESC]0;…BEL` as visible columns and re-wraps —
    // mangling the following text. string-width DOES discount those bytes, so when
    // the text already fits we must pass it through verbatim rather than asking
    // wrap-ansi to "wrap" it. Splitting on `\n` preserves embedded hard newlines.
    if (measureTextNatural(text).width <= width) return text.split("\n");

    // ANSI-safe width<=0 wrap. We reach here only for NON-empty text wider than the
    // cell (the fast-path above already returned for empty/fitting text), so width<=0
    // means an undersized cell that forces every grapheme onto its own row. wrap-ansi@10
    // produces exactly that for PLAIN text — wrapAnsi("AB", 0) = "\nA\nB" (leading blank
    // line, one grapheme per line) — but it has a width<=0 bug: it cannot recognise the
    // SGR codes in a STYLED string and byte-splits them, so wrapAnsi("\x1b[41mA\x1b[49m", 0)
    // = "\x1b\n[\n4\n1\nm\nA\n…", scattering the escape bytes across rows and corrupting
    // the frame. Because styles are composed before wrapping, reproduce
    // wrap-ansi's plain-text layout ANSI-awarely. slice-ansi is grapheme-aware
    // and re-emits the active SGR span around each slice.
    if (width <= 0) return wrapZeroWidthAnsi(text, mode);

    if (mode === "wrap") {
      return wrapAnsi(text, width, { hard: true, trim: false }).split("\n");
    }

    // `wordWrap: false` makes hard mode break at the exact character boundary.
    return wrapAnsi(text, width, { hard: true, trim: false, wordWrap: false }).split("\n");
  }

  // Truncate each hard-newline segment independently. Passing the complete
  // multiline string to cli-truncate lets one over-wide line discard or merge
  // every later line. The per-line path keeps hard breaks, uses one budgeted
  // ellipsis only when that line is shortened, and inherits cli-truncate's
  // ANSI-, grapheme-, and terminal-cell-aware slicing.
  const lines = text.split("\n");
  const position =
    mode === "truncate-start" ? "start" : mode === "truncate-middle" ? "middle" : "end";
  const budget = Math.max(0, width);
  return lines.map((line) =>
    stringWidth(line) <= budget ? line : cliTruncate(line, budget, { position }),
  );
}

/**
 * Natural dimensions: width is the widest line and height is the number of
 * newline-separated lines.
 */
export function measureTextNatural(text: string): { width: number; height: number } {
  const lines = text.split("\n");
  let width = 0;
  for (const line of lines) width = Math.max(width, stringWidth(line));
  return { width, height: lines.length };
}
