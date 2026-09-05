import type { Cell } from "../frame/cell.ts";
import {
  defaultColor,
  defaultStyle,
  type Color,
  type SgrPair,
  type Style,
} from "../frame/style.ts";
import { cellsFromStyledChars } from "./cell-style.ts";
import { sanitizeAnsiMultiline } from "./sanitize-ansi.ts";
import { chunkBoundaryStyles, styledGraphemesFromAnsi, visibleText } from "./text-measure.ts";
import type { TextStyleSpan } from "./text-style.ts";

export interface ParsedTextContent {
  /** The sanitized source text, which measurement and wrapping work on. */
  readonly text: string;
  readonly runs: readonly Cell[];
  /** Runs contributed by each source chunk, in order. */
  readonly chunkRuns: readonly number[];
  /**
   * The content's own SGR state at each chunk boundary: entry `i` is what the
   * content has open entering chunk `i`, and the final entry is what it leaves
   * open at the end. Composition reads them to tell a channel a chunk's own
   * content resolved from one it merely inherited from the text before it.
   */
  readonly chunkBoundaryStyles: readonly Style[];
}

/**
 * Parse one Text node's content into styled runs.
 *
 * Each chunk is sanitized on its own so the runs a chunk contributes are
 * countable, then the joined text is parsed once: SGR spans opened in one chunk
 * stay active over the ones that follow.
 */
export function parseTextContent(chunks: readonly string[]): ParsedTextContent {
  const sanitized = chunks.map((chunk) => sanitizeAnsiMultiline(chunk));
  const text = sanitized.join("");
  const runs = cellsFromStyledChars(styledGraphemesFromAnsi(text));

  const chunkRuns: number[] = [];
  let index = 0;
  let consumed = 0;
  let boundary = 0;
  for (const chunk of sanitized) {
    boundary += visibleText(chunk).length;
    const start = index;
    // A grapheme that spans a boundary belongs to the chunk its first code
    // point came from, which is how the parse assigns its style too.
    while (index < runs.length && consumed < boundary) {
      consumed += runs[index]!.grapheme.length;
      index++;
    }
    chunkRuns.push(index - start);
  }
  if (index < runs.length && chunkRuns.length > 0) {
    chunkRuns[chunkRuns.length - 1] += runs.length - index;
  }

  return { text, runs, chunkRuns, chunkBoundaryStyles: chunkBoundaryStyles(sanitized) };
}

/** What composition reads off a parsed content that a node is holding. */
export interface ContentRunSource {
  readonly runs: readonly Cell[];
  readonly chunks: readonly { readonly runs: number }[];
  readonly chunkBoundaryStyles: readonly Style[];
}

function sameColor(left: Color, right: Color): boolean {
  if (left === right) return true;
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "default":
      return true;
    case "ansi16":
    case "ansi256":
      return left.index === (right as { readonly index: number }).index;
    case "rgb": {
      const other = right as {
        readonly red: number;
        readonly green: number;
        readonly blue: number;
      };
      return left.red === other.red && left.green === other.green && left.blue === other.blue;
    }
  }
}

function sameSgrPairs(left: readonly SgrPair[], right: readonly SgrPair[]): boolean {
  if (left === right) return true;
  return (
    left.length === right.length &&
    left.every(
      (pair, index) => pair.code === right[index]!.code && pair.endCode === right[index]!.endCode,
    )
  );
}

/** The channels one chunk's enclosing hosts resolve, and what they resolve them to. */
interface ChunkStyle {
  /** What every run of the chunk starts from, before the chunk's own content SGR. */
  readonly base: Style;
  /** Whether the enclosing props, rather than the text before the chunk, decided each colour. */
  readonly foregroundFromProps: boolean;
  readonly backgroundFromProps: boolean;
  /** Attribute bits the enclosing props open over this chunk. */
  readonly attrsFromProps: number;
  /** The pair a colour prop that actively resets writes, ahead of the content's own pairs. */
  readonly backgroundReset: SgrPair | undefined;
  readonly foregroundReset: SgrPair | undefined;
}

const noSpans: readonly TextStyleSpan[] = [];

function continuesSpan(other: readonly TextStyleSpan[], span: TextStyleSpan): boolean {
  return other.some(
    (candidate) =>
      candidate.owner === span.owner &&
      candidate.enclosed === span.enclosed &&
      candidate.contribution.kind === span.contribution.kind &&
      (span.contribution.kind !== "attribute" ||
        candidate.contribution.kind !== "attribute" ||
        candidate.contribution.attribute === span.contribution.attribute),
  );
}

/**
 * The state one chunk begins from: what the content before it left open, with
 * the spans that ended closed and the spans that begin here opened over it.
 *
 * Entering a host resolves the channels its props set, so a nested value wins
 * over content state inherited from outside it; leaving one closes those
 * channels again, which is why content colour set before a styled child does
 * not resume after it. A span that both chunks hold — same host, same channels
 * resolved inside it — never closed in between, so the content state carries
 * through instead.
 */
function chunkStyleFor(
  carried: Style,
  spans: readonly TextStyleSpan[],
  previous: readonly TextStyleSpan[],
): ChunkStyle {
  let foreground = carried.foreground;
  let background = carried.background;
  let attrs = carried.attrs;
  let foregroundFromProps = false;
  let backgroundFromProps = false;
  let attrsFromProps = 0;
  let foregroundReset: SgrPair | undefined;
  let backgroundReset: SgrPair | undefined;

  for (const span of previous) {
    if (continuesSpan(spans, span)) continue;
    const { contribution } = span;
    if (contribution.kind === "attribute") attrs &= ~contribution.attribute;
    else if (contribution.kind === "background") background = defaultColor;
    else foreground = defaultColor;
  }

  for (const span of spans) {
    if (continuesSpan(previous, span)) continue;
    const { contribution } = span;
    if (contribution.kind === "attribute") {
      attrs |= contribution.attribute;
      attrsFromProps |= contribution.attribute;
      continue;
    }
    const reset =
      contribution.color.kind === "default"
        ? { code: contribution.close, endCode: contribution.close }
        : undefined;
    if (contribution.kind === "background") {
      background = contribution.color;
      backgroundFromProps = true;
      backgroundReset = reset;
    } else {
      foreground = contribution.color;
      foregroundFromProps = true;
      foregroundReset = reset;
    }
  }

  return {
    base: { foreground, background, attrs, extraSgr: carried.extraSgr },
    foregroundFromProps,
    backgroundFromProps,
    attrsFromProps,
    backgroundReset,
    foregroundReset,
  };
}

/**
 * The colour one channel holds where the content around it left `entry` and
 * this run carries `source`.
 *
 * Content SGR inside the chunk resolves the channel from where it appears, so
 * a value this chunk's content set wins over the props. The one exception is a
 * close: the string pipeline replaced a close written inside a host that sets
 * the channel with that host's own opening sequence, so the prop comes back
 * rather than the terminal default.
 */
function takesBaseColor(source: Color, entry: Color, fromProps: boolean): boolean {
  return sameColor(source, entry) || (source.kind === "default" && fromProps);
}

function withChunkStyle(cell: Cell, entry: Style, chunk: ChunkStyle): Cell {
  const source = cell.style;
  const { base } = chunk;
  const baseForeground = takesBaseColor(
    source.foreground,
    entry.foreground,
    chunk.foregroundFromProps,
  );
  const baseBackground = takesBaseColor(
    source.background,
    entry.background,
    chunk.backgroundFromProps,
  );
  const foreground = baseForeground ? base.foreground : source.foreground;
  const background = baseBackground ? base.background : source.background;
  // A bit this chunk's content switched carries the content's value, except one
  // it cleared inside a host whose props open it, which the close reopened.
  const changed = source.attrs ^ entry.attrs;
  const attrs =
    (base.attrs & ~changed) |
    (source.attrs & changed) |
    (changed & ~source.attrs & chunk.attrsFromProps);
  const content = sameSgrPairs(source.extraSgr, entry.extraSgr) ? base.extraSgr : source.extraSgr;

  const resets: SgrPair[] = [];
  if (chunk.backgroundReset && baseBackground) resets.push(chunk.backgroundReset);
  if (chunk.foregroundReset && baseForeground) resets.push(chunk.foregroundReset);
  const extraSgr = resets.length === 0 ? content : [...resets, ...content];

  if (
    sameColor(foreground, source.foreground) &&
    sameColor(background, source.background) &&
    attrs === source.attrs &&
    sameSgrPairs(extraSgr, source.extraSgr)
  ) {
    return cell;
  }
  return { ...cell, style: { foreground, background, attrs, extraSgr } };
}

/** What the content leaves open at the end of a chunk, over the chunk's own base. */
function chunkExitStyle(entry: Style, exit: Style, chunk: ChunkStyle): Style {
  const { base } = chunk;
  const changed = exit.attrs ^ entry.attrs;
  return {
    foreground: takesBaseColor(exit.foreground, entry.foreground, chunk.foregroundFromProps)
      ? base.foreground
      : exit.foreground,
    background: takesBaseColor(exit.background, entry.background, chunk.backgroundFromProps)
      ? base.background
      : exit.background,
    attrs:
      (base.attrs & ~changed) |
      (exit.attrs & changed) |
      (changed & ~exit.attrs & chunk.attrsFromProps),
    extraSgr: sameSgrPairs(exit.extraSgr, entry.extraSgr) ? base.extraSgr : exit.extraSgr,
  };
}

/**
 * Style a Text's parsed runs with the channels its enclosing hosts resolve.
 *
 * The content is one left-to-right state machine, chunk by chunk: a chunk
 * starts from what the content before it left open, with its hosts' spans
 * closed and opened over that, and each run then takes back every channel its
 * own chunk's content resolved. `chunkSpans` holds one entry per chunk, in
 * content order.
 */
export function composeContentRuns(
  content: ContentRunSource,
  chunkSpans: readonly (readonly TextStyleSpan[])[],
): readonly Cell[] {
  const composed: Cell[] = [];
  let carried = defaultStyle;
  let start = 0;
  for (let index = 0; index < content.chunks.length; index++) {
    const spans = chunkSpans[index] ?? noSpans;
    const previous = index === 0 ? noSpans : (chunkSpans[index - 1] ?? noSpans);
    const chunk = chunkStyleFor(carried, spans, previous);
    const entry = content.chunkBoundaryStyles[index] ?? defaultStyle;
    const end = start + content.chunks[index]!.runs;
    for (let run = start; run < end; run++) {
      composed.push(withChunkStyle(content.runs[run]!, entry, chunk));
    }
    start = end;
    carried = chunkExitStyle(entry, content.chunkBoundaryStyles[index + 1] ?? entry, chunk);
  }
  for (let run = start; run < content.runs.length; run++) composed.push(content.runs[run]!);
  return composed;
}
