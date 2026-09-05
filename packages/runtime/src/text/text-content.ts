import type { Cell } from "../frame/cell.ts";
import { cellsFromStyledChars, cellVisualFromAnsiCodes, type SgrToken } from "./cell-style.ts";
import { sanitizeAnsiMultiline } from "./sanitize-ansi.ts";
import {
  reduceStyledCodes,
  styledGraphemesFromTokens,
  styledTokensFromAnsi,
} from "./text-measure.ts";
import type { TextStyleContribution, TextStyleLevel } from "./text-style.ts";

export interface ParsedTextContent {
  /** The sanitized source text, which measurement and wrapping work on. */
  readonly text: string;
  readonly runs: readonly Cell[];
  /** Runs contributed by each source chunk, in order. */
  readonly chunkRuns: readonly number[];
  /**
   * The SGR each chunk writes, in the order it writes it: entry `k` stands
   * between the chunk's run `k - 1` and its run `k`, so a chunk with `n` runs
   * has `n + 1` entries and the last one is what it leaves behind.
   */
  readonly chunkCodes: readonly (readonly (readonly SgrToken[])[])[];
}

/**
 * Parse one Text node's content into styled runs and the sequences around them.
 *
 * Each chunk is sanitized and tokenized on its own, so the runs and the SGR a
 * chunk contributes are both countable and a sequence written at the end of one
 * chunk stays in that chunk. The graphemes come from the joined stream: one
 * spanning a boundary is a single cell, belonging to the chunk its first code
 * point came from.
 */
export function parseTextContent(chunks: readonly string[]): ParsedTextContent {
  const sanitized = chunks.map((chunk) => sanitizeAnsiMultiline(chunk));
  const text = sanitized.join("");
  const chunkTokens = sanitized.map((chunk) => styledTokensFromAnsi(chunk));
  const { graphemes, leadingCharacters } = styledGraphemesFromTokens(chunkTokens.flat());
  const runs = cellsFromStyledChars(graphemes);

  const chunkRuns: number[] = [];
  const chunkCodes: SgrToken[][][] = [];
  let character = 0;
  let run = 0;
  for (const tokens of chunkTokens) {
    const codes: SgrToken[][] = [[]];
    for (const token of tokens) {
      if (token.type === "ansi") {
        codes[codes.length - 1]!.push(token);
        continue;
      }
      if (token.type !== "char") continue;
      // A sequence written between the code points of one grapheme lands after
      // it: the cell already took the style its leading code point carried.
      if (run < leadingCharacters.length && leadingCharacters[run] === character) {
        codes.push([]);
        run++;
      }
      character++;
    }
    chunkRuns.push(codes.length - 1);
    chunkCodes.push(codes);
  }

  return { text, runs, chunkRuns, chunkCodes };
}

/** What composition reads off a parsed content that a node is holding. */
export interface ContentRunSource {
  readonly runs: readonly Cell[];
  readonly chunks: readonly {
    readonly runs: number;
    readonly codes: readonly (readonly SgrToken[])[];
  }[];
}

/**
 * One item of the stream composition replays: a written SGR sequence, or the
 * index of a run.
 */
type StreamItem = SgrToken | number;

/**
 * One stretch of content that the levels outside it style as a unit.
 *
 * `resolved` is every channel the hosts inside this level have already settled
 * for the stretch. Two neighbouring stretches join when their `resolved` masks
 * agree, because then every level outside them writes the same sequences around
 * both, and one open and one close cover the pair.
 */
interface ContentSpan {
  items: StreamItem[];
  readonly resolved: number;
  /** A source chunk of the span, which carries the levels enclosing it. */
  readonly chunk: number;
}

const hardBreak = "\n";

/**
 * Style a Text's parsed runs with the sequences its enclosing hosts write.
 *
 * Composition replays one left-to-right stream: entering a host writes the open
 * sequences its props resolve, the chunk's own content writes what the author
 * wrote, and leaving the host writes its closes. A host repairs its span around
 * anything that would end it early — a close written inside it is followed by a
 * fresh open, and a hard newline closes the span and opens it again after the
 * break. The SGR state machine that reads content sequences reads this whole
 * stream, so a content colour outranks the props around it, a nested host's own
 * props outrank the content it inherits, a close written inside a host restores
 * that host's value, and a host's close also ends a content attribute that
 * shares its end code — all without a rule of composition's own.
 *
 * `chunkLevels` holds one entry per chunk in content order: the hosts enclosing
 * that chunk, outermost first, beginning with the Text node itself.
 */
export function composeContentRuns(
  content: ContentRunSource,
  chunkLevels: readonly (readonly TextStyleLevel[])[],
): readonly Cell[] {
  const firstRuns: number[] = [];
  let start = 0;
  for (const chunk of content.chunks) {
    firstRuns.push(start);
    start += chunk.runs;
  }

  const composed: Cell[] = [];
  let active: readonly SgrToken[] = [];
  let visual = cellVisualFromAnsiCodes(active);
  let stale = false;
  for (const span of replayLevel(content, chunkLevels, firstRuns, 0, content.chunks.length, 0)) {
    for (const item of span.items) {
      if (typeof item !== "number") {
        active = reduceStyledCodes(active, [item]);
        stale = true;
        continue;
      }
      if (stale) {
        visual = cellVisualFromAnsiCodes(active);
        stale = false;
      }
      const run = content.runs[item]!;
      composed.push(
        visual.style === run.style && visual.link === run.link
          ? run
          : { ...run, style: visual.style, link: visual.link },
      );
    }
  }
  return composed;
}

/**
 * The spans one level contributes for the chunks `[from, to)`, which every
 * chunk in that range is enclosed by at `depth`.
 *
 * The levels inside it produce their spans first, exactly as a nested host's
 * own composition finished before the host around it saw it.
 */
function replayLevel(
  content: ContentRunSource,
  chunkLevels: readonly (readonly TextStyleLevel[])[],
  firstRuns: readonly number[],
  from: number,
  to: number,
  depth: number,
): ContentSpan[] {
  const inner: ContentSpan[] = [];
  let index = from;
  while (index < to) {
    const nested = chunkLevels[index]?.[depth + 1];
    if (nested === undefined) {
      inner.push({ items: chunkItems(content, firstRuns, index), resolved: 0, chunk: index });
      index++;
      continue;
    }
    let end = index + 1;
    while (end < to && chunkLevels[end]?.[depth + 1]?.owner === nested.owner) end++;
    inner.push(...replayLevel(content, chunkLevels, firstRuns, index, end, depth + 1));
    index = end;
  }

  const joined = joinSpans(inner);
  const level = chunkLevels[from]?.[depth];
  if (level === undefined) return joined;
  return joinSpans(
    joined.map((span) => ({
      items: applyLevel(content.runs, span.items, chunkLevels[span.chunk]![depth]!.contributions),
      resolved: span.resolved | level.ownChannels,
      chunk: span.chunk,
    })),
  );
}

/** One chunk's own stream: what it wrote, and the runs it wrote it around. */
function chunkItems(
  content: ContentRunSource,
  firstRuns: readonly number[],
  index: number,
): StreamItem[] {
  const chunk = content.chunks[index]!;
  const first = firstRuns[index]!;
  const items: StreamItem[] = [];
  for (let position = 0; position <= chunk.runs; position++) {
    for (const code of chunk.codes[position] ?? []) items.push(code);
    if (position < chunk.runs) items.push(first + position);
  }
  return items;
}

/** Join neighbouring spans the levels outside them cannot tell apart. */
function joinSpans(spans: readonly ContentSpan[]): ContentSpan[] {
  const joined: ContentSpan[] = [];
  for (const span of spans) {
    // A chunk that sanitized away leaves nothing for a level to wrap, so it
    // never separates the spans on either side of it.
    if (span.items.length === 0) continue;
    const previous = joined.at(-1);
    if (previous?.resolved !== span.resolved) {
      joined.push({ ...span, items: [...span.items] });
      continue;
    }
    // One item at a time: a long Text holds more runs than a spread call may
    // pass as arguments.
    for (const item of span.items) previous.items.push(item);
  }
  return joined;
}

/**
 * Write one host's style around a span: innermost contribution first, which is
 * the order the props are resolved in.
 */
function applyLevel(
  runs: readonly Cell[],
  items: StreamItem[],
  contributions: readonly TextStyleContribution[],
): StreamItem[] {
  let result = items;
  for (let index = contributions.length - 1; index >= 0; index--) {
    result = applyContribution(runs, result, contributions[index]!);
  }
  return result;
}

function applyContribution(
  runs: readonly Cell[],
  items: readonly StreamItem[],
  contribution: TextStyleContribution,
): StreamItem[] {
  const { open, close, reopens } = contribution;
  const result: StreamItem[] = [open];
  for (const item of items) {
    if (typeof item !== "number") {
      result.push(item);
      // A close written inside the span would leave the rest of the content
      // bare, so the span opens itself again behind it.
      if (reopens && item.source === close.source) result.push(open);
      continue;
    }
    // A style left open across a hard break bleeds over the rest of the row on
    // some terminals, so the span closes before the break and opens after it.
    if (reopens && runs[item]!.grapheme === hardBreak) {
      result.push(close, item, open);
      continue;
    }
    result.push(item);
  }
  result.push(close);
  return result;
}
