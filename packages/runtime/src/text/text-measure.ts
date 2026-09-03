import cliTruncate from "cli-truncate";
import sliceAnsi from "slice-ansi";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import {
  ansiCodesToString,
  styledCharsFromTokens,
  tokenize as tokenizeStyledAnsi,
  type AnsiCode,
  type StyledChar,
  type Token,
} from "@alcalzone/ansi-tokenize";
import { hasAnsiControlCharacters, tokenizeAnsi } from "./ansi-tokenizer.ts";

export type WrapMode = "wrap" | "hard" | "truncate" | "truncate-middle" | "truncate-start";

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
  for (const character of styledGraphemesFromAnsi(text)) {
    const width = Math.max(1, stringWidth(character.value));
    if (column >= start && column < end) return character;
    column += width;
  }
  return undefined;
}

/**
 * Preserve the complete style state at the first retained grapheme.
 *
 * `slice-ansi` can omit a shared intensity channel or an SGR form it does not
 * parse. Prefix any missing active pair after it selects the requested graphemes.
 */
export function sliceAnsiPreservingIntensity(text: string, start: number, end: number): string {
  const sliced = sliceAnsi(text, start, end);
  const expected = firstStyledCharacterInSlice(text, start, end);
  if (!expected) return sliced;

  const actual = styledGraphemesFromAnsi(sliced)[0];
  const actualCodes = new Set(actual?.styles.map((style) => style.code) ?? []);
  const missing = expected.styles.filter((style) => !actualCodes.has(style.code));
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

// The SGR attribute each parameter switches off, for a sequence the tokenizer
// cannot parse. A colon sub-parameter form carries its own family's terminator,
// so a later `24m` or `39m` in the source closes the span it opened.
const sgrOffCodes = new Map<number, string>([
  [1, "\u001b[22m"],
  [2, "\u001b[22m"],
  [3, "\u001b[23m"],
  [4, "\u001b[24m"],
  [5, "\u001b[25m"],
  [6, "\u001b[25m"],
  [7, "\u001b[27m"],
  [8, "\u001b[28m"],
  [9, "\u001b[29m"],
  [21, "\u001b[24m"],
  [53, "\u001b[55m"],
  [38, "\u001b[39m"],
  [48, "\u001b[49m"],
  [58, "\u001b[59m"],
]);

function sgrOffCodeFor(sequence: string): string {
  const first = Number.parseInt(sequence.slice(2), 10);
  return sgrOffCodes.get(first) ?? "\u001b[0m";
}

function normalizeColonColorParameter(parameter: string): string {
  const parts = parameter.split(":");
  const channel = parts[0];
  const mode = parts[1];
  if ((channel !== "38" && channel !== "48") || (mode !== "2" && mode !== "5")) {
    return parameter;
  }

  if (mode === "5") {
    const index = parts.at(-1);
    return index !== undefined && /^\d+$/.test(index) ? `${channel};5;${index}` : parameter;
  }

  const [red, green, blue] = parts.slice(-3);
  return red !== undefined &&
    green !== undefined &&
    blue !== undefined &&
    /^\d+$/.test(red) &&
    /^\d+$/.test(green) &&
    /^\d+$/.test(blue)
    ? `${channel};2;${red};${green};${blue}`
    : parameter;
}

function sgrPair(code: string, endCode = sgrOffCodeFor(code)): AnsiCode {
  return { type: "ansi", code, endCode };
}

function tokenizeSgrParameters(parameterString: string): Token[] {
  if (parameterString === "") return tokenizeStyledAnsi("\x1b[0m");

  const parameters = parameterString.split(";");
  const tokens: Token[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index]!;
    const channel = parameter.split(":", 1)[0];
    const mode = parameters[index + 1];

    if (
      !parameter.includes(":") &&
      (channel === "38" || channel === "48" || channel === "58") &&
      (mode === "2" || mode === "5")
    ) {
      const count = mode === "2" ? 5 : 3;
      const grouped = parameters.slice(index, index + count).join(";");
      const code = `\x1b[${grouped}m`;
      if (channel === "58") tokens.push(sgrPair(code, "\x1b[59m"));
      else tokens.push(...tokenizeStyledAnsi(code));
      index += count - 1;
      continue;
    }

    if (parameter === "4:0") {
      tokens.push(sgrPair("\x1b[24m", "\x1b[24m"));
      continue;
    }
    if (parameter === "5" || parameter === "6") {
      tokens.push(sgrPair(`\x1b[${parameter}m`, "\x1b[25m"));
      continue;
    }
    if (parameter === "21") {
      tokens.push(sgrPair("\x1b[21m", "\x1b[24m"));
      continue;
    }
    if (parameter === "25") {
      tokens.push(sgrPair("\x1b[25m", "\x1b[25m"));
      continue;
    }
    if (parameter === "59") {
      tokens.push(sgrPair("\x1b[59m", "\x1b[59m"));
      continue;
    }
    if (parameter.startsWith("58:")) {
      tokens.push(sgrPair(`\x1b[${parameter}m`, "\x1b[59m"));
      continue;
    }

    const normalizedColor = normalizeColonColorParameter(parameter);
    if (normalizedColor !== parameter) {
      tokens.push(...tokenizeStyledAnsi(`\x1b[${normalizedColor}m`));
      continue;
    }
    if (parameter.includes(":")) {
      const code = `\x1b[${parameter}m`;
      tokens.push(sgrPair(code));
      continue;
    }
    tokens.push(...tokenizeStyledAnsi(`\x1b[${parameter}m`));
  }
  return tokens;
}

function reduceStyledCodes(active: readonly AnsiCode[], next: readonly AnsiCode[]): AnsiCode[] {
  let result = [...active];
  for (const pair of next) {
    if (pair.code === "\x1b[0m") {
      result = [];
    } else if (pair.code === pair.endCode) {
      result = result.filter((candidate) => candidate.endCode !== pair.code);
    } else if (isIntensityStyle(pair) || pair.endCode === "\x1b[0m") {
      if (!result.some((candidate) => candidate.code === pair.code)) result.push(pair);
    } else {
      result = result.filter((candidate) => candidate.endCode !== pair.endCode);
      result.push(pair);
    }
  }
  return result;
}

function styledCharactersFromTokens(tokens: readonly Token[]): StyledChar[] {
  let styles: AnsiCode[] = [];
  const characters: StyledChar[] = [];
  for (const token of tokens) {
    if (token.type === "ansi") styles = reduceStyledCodes(styles, [token]);
    else if (token.type === "char") characters.push({ ...token, styles: [...styles] });
  }
  return characters;
}

function sameStyledCodes(left: readonly AnsiCode[], right: readonly AnsiCode[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (pair, index) => pair.code === right[index]!.code && pair.endCode === right[index]!.endCode,
    )
  );
}

function styledCodeDifference(from: readonly AnsiCode[], to: readonly AnsiCode[]): AnsiCode[] {
  const endCodesInTarget = new Set(to.map((pair) => pair.endCode));
  const codesInTarget = new Set(to.map((pair) => pair.code));
  const codesInSource = new Set(from.map((pair) => pair.code));
  const closesBeforeReplacement = new Set(["\x1b[0m"]);
  const removed = reduceStyledCodes(
    [],
    from.filter((pair) =>
      isIntensityStyle(pair)
        ? !codesInTarget.has(pair.code)
        : !endCodesInTarget.has(pair.endCode) ||
          (closesBeforeReplacement.has(pair.endCode) && !codesInTarget.has(pair.code)),
    ),
  )
    .reverse()
    .map((pair) => ({ ...pair, code: pair.endCode }));
  return [...removed, ...to.filter((pair) => !codesInSource.has(pair.code))];
}

function styledTransition(from: readonly AnsiCode[], to: readonly AnsiCode[]): string {
  let current = reduceStyledCodes([], from);
  const target = reduceStyledCodes([], to);
  let output = "";
  const maxRepairs = current.length + target.length + 2;

  for (let attempt = 0; attempt < maxRepairs; attempt++) {
    if (sameStyledCodes(current, target)) return output;
    const difference = styledCodeDifference(current, target);
    if (difference.length === 0) break;
    output += ansiCodesToString(difference);
    const next = reduceStyledCodes(current, difference);
    if (sameStyledCodes(current, next)) break;
    current = next;
  }

  return output + "\x1b[0m" + ansiCodesToString(target);
}

function normalizeOscForStyledCharacters(value: string): string {
  const escaped = value.startsWith("\x9d") ? `\x1b]${value.slice(1)}` : value;
  if (escaped.endsWith("\x1b\\")) return `${escaped.slice(0, -2)}\x07`;
  return escaped.endsWith("\x9c") ? `${escaped.slice(0, -1)}\x07` : escaped;
}

/**
 * Normalize ANSI-tokenized code points into terminal paint graphemes once.
 *
 * Shared with painting: both must agree on how many graphemes a styled line
 * holds, or the line the layout planned and the cells drawn from it diverge.
 */
export function styledGraphemesFromAnsi(text: string): StyledChar[] {
  if (!hasAnsiControlCharacters(text)) return styledCharsFromTokens(tokenizeStyledAnsi(text));

  const tokens = tokenizeAnsi(text).flatMap((token) => {
    if (token.type === "text") return tokenizeStyledAnsi(token.value);
    if (token.type === "csi") {
      if (token.finalCharacter !== "m" || token.intermediateString !== "") return [];
      return tokenizeSgrParameters(token.parameterString);
    }
    if (token.type === "osc")
      return tokenizeStyledAnsi(normalizeOscForStyledCharacters(token.value));
    return [];
  });
  // The tokenizer pairs `21m` with the generic reset; `24m` ends both underline
  // forms, so double underline must leave with it rather than outlive it.
  const characters = styledCharactersFromTokens(
    tokens.map((token) =>
      token.type === "ansi" && token.code === "\u001b[21m"
        ? { ...token, endCode: "\u001b[24m" }
        : token,
    ),
  );
  if (characters.length < 2) return characters;

  const plain = characters.map((character) => character.value).join("");
  const graphemes = [...graphemeSegmenter.segment(plain)];
  if (
    graphemes.length === characters.length &&
    graphemes.every((part, index) => part.segment === characters[index]!.value)
  ) {
    return characters;
  }

  const result: StyledChar[] = [];
  let characterIndex = 0;
  let characterOffset = 0;
  for (const part of graphemes) {
    while (
      characterIndex < characters.length - 1 &&
      characterOffset + characters[characterIndex]!.value.length <= part.index
    ) {
      characterOffset += characters[characterIndex]!.value.length;
      characterIndex++;
    }
    const leading = characters[characterIndex]!;
    // A terminal cell cannot carry independent styles for code points inside
    // one grapheme. Preserve the leading code point's style for the whole cell.
    result.push({
      ...leading,
      value: part.segment,
      fullWidth: stringWidth(part.segment) > 1,
    });
  }
  return result;
}

/** Serialize styled graphemes while retaining independent bold and dim. */
export function styledGraphemesToString(characters: StyledChar[]): string {
  let result = "";
  let previousStyles: StyledChar["styles"] = [];

  for (const character of characters) {
    result += styledTransition(previousStyles, character.styles);
    result += character.value;
    previousStyles = character.styles;
  }

  return result + styledTransition(previousStyles, []);
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
 * Apply terminal styling to line structure which layout has already chosen.
 *
 * `wrappedLines` comes from `wrapText()` during the Yoga
 * measure pass. Paint must not call `wrapText` again: the layout result is the
 * one authoritative whole-cell budget for this frame. ANSI styling is added
 * after measuring, so project the styled source over that existing structure
 * instead of deciding where any line ends here.
 */
export function styleMeasuredTextLines(
  text: string,
  wrappedLines: readonly string[],
  mode: WrapMode,
  wrapWidth: number,
): string[] {
  if (wrappedLines.length === 0) {
    if (stripAnsi(text) !== "") {
      throw new Error("Measured text plan does not match styled source.");
    }
    return [];
  }

  if (mode === "truncate" || mode === "truncate-middle" || mode === "truncate-start") {
    return styleMeasuredTruncatedLines(text, wrappedLines, mode, wrapWidth);
  }

  return styleMeasuredWrappedLines(text, wrappedLines);
}

function styleMeasuredWrappedLines(text: string, wrappedLines: readonly string[]): string[] {
  const styledSourceLines = text.split("\n");
  const styledLines: string[] = [];
  let wrappedLineIndex = 0;

  for (const styledSourceLine of styledSourceLines) {
    const sourceGraphemes = styledGraphemesFromAnsi(styledSourceLine);
    const sourcePlainGraphemes = [...graphemeSegmenter.segment(stripAnsi(styledSourceLine))];
    if (sourcePlainGraphemes.length === 0) {
      // A hard newline contributes one empty physical line. Empty rows inserted
      // by width-zero wrapping are handled in the non-empty source branch below.
      const measuredLine = wrappedLines[wrappedLineIndex++];
      if (measuredLine === undefined || stripAnsi(measuredLine) !== "") {
        throw new Error("Measured text plan does not match styled source.");
      }
      styledLines.push("");
      continue;
    }

    let consumedGraphemes = 0;
    while (consumedGraphemes < sourcePlainGraphemes.length) {
      const measuredLine = wrappedLines[wrappedLineIndex++];
      if (measuredLine === undefined) {
        throw new Error("Measured text plan does not match styled source.");
      }
      const measuredGraphemes = [...graphemeSegmenter.segment(stripAnsi(measuredLine))];
      if (measuredGraphemes.length === 0) {
        styledLines.push("");
        continue;
      }

      const endGrapheme = consumedGraphemes + measuredGraphemes.length;
      if (endGrapheme > sourcePlainGraphemes.length || endGrapheme > sourceGraphemes.length) {
        throw new Error("Measured text plan does not match styled source.");
      }
      const projected = measuredGraphemes.map(({ segment }, index) => ({
        ...sourceGraphemes[consumedGraphemes + index]!,
        value: segment,
        fullWidth: stringWidth(segment) > 1,
      }));
      styledLines.push(styledGraphemesToString(projected));
      consumedGraphemes = endGrapheme;
    }
  }

  if (wrappedLineIndex !== wrappedLines.length) {
    throw new Error("Measured text plan does not match styled source.");
  }
  return styledLines;
}

function styleMeasuredTruncatedLines(
  text: string,
  wrappedLines: readonly string[],
  mode: Extract<WrapMode, "truncate" | "truncate-middle" | "truncate-start">,
  wrapWidth: number,
): string[] {
  const sourceLines = text.split("\n");
  if (sourceLines.length !== wrappedLines.length) {
    throw new Error("Measured text plan does not match styled source.");
  }
  const position =
    mode === "truncate-start" ? "start" : mode === "truncate-middle" ? "middle" : "end";
  return sourceLines.map((styledSourceLine, index) => {
    const measuredLine = wrappedLines[index]!;
    const measuredPlain = stripAnsi(measuredLine);
    if (measuredPlain === "") return "";
    if (measuredPlain === stripAnsi(styledSourceLine)) return styledSourceLine;

    const styled = cliTruncate(styledSourceLine, Math.max(0, wrapWidth), { position });
    if (stripAnsi(styled) !== measuredPlain) {
      throw new Error("Measured text plan does not match styled source.");
    }
    return styled;
  });
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
