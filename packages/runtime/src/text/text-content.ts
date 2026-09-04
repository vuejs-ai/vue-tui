import type { Cell } from "../frame/cell.ts";
import type { SgrPair, Style } from "../frame/style.ts";
import { tokenizeAnsi } from "./ansi-tokenizer.ts";
import { cellsFromStyledChars } from "./cell-style.ts";
import { sanitizeAnsiMultiline } from "./sanitize-ansi.ts";
import { styledGraphemesFromAnsi, visibleText } from "./text-measure.ts";
import type { TextStyleContribution } from "./text-style.ts";

/**
 * A full SGR reset written inside the content also cancels the spans an
 * enclosing Text opens around it: a reset closes them without the re-open that
 * each span's own end code triggers, and a physical line break re-opens them
 * all. `at[i]` is the run a reset last took effect at within the current line,
 * `-1` where none applies, and `rearmed[i]` the end codes written since.
 */
export interface TextContentReset {
  readonly at: readonly number[];
  readonly rearmed: readonly number[];
}

export interface ParsedTextContent {
  /** The sanitized source text, which measurement and wrapping work on. */
  readonly text: string;
  readonly runs: readonly Cell[];
  /** Runs contributed by each source chunk, in order. */
  readonly chunkRuns: readonly number[];
  readonly reset: TextContentReset | null;
}

/**
 * The end code of every span a Text's props can open. A reset cancels each of
 * them, and writing one of these codes in the content restores that span alone.
 */
const cancellableEndCodes = [
  "\x1b[39m",
  "\x1b[49m",
  "\x1b[22m",
  "\x1b[23m",
  "\x1b[24m",
  "\x1b[27m",
  "\x1b[29m",
];

function endCodeBit(endCode: string): number {
  const index = cancellableEndCodes.indexOf(endCode);
  return index === -1 ? 0 : 1 << index;
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

  return { text, runs, chunkRuns, reset: scanContentReset(text, runs) };
}

interface ResetEvent {
  readonly offset: number;
  readonly kind: "reset" | "rearm" | "break";
  readonly bit: number;
}

function scanContentReset(text: string, runs: readonly Cell[]): TextContentReset | null {
  if (!text.includes("\x1b")) return null;

  const events: ResetEvent[] = [];
  let offset = 0;
  let hasReset = false;
  for (const token of tokenizeAnsi(text)) {
    if (token.type === "text") {
      let index = token.value.indexOf("\n");
      while (index !== -1) {
        events.push({ offset: offset + index, kind: "break", bit: 0 });
        index = token.value.indexOf("\n", index + 1);
      }
      offset += token.value.length;
      continue;
    }
    if (token.type !== "csi" || token.finalCharacter !== "m" || token.intermediateString !== "") {
      continue;
    }
    const parameters = token.parameterString;
    if (parameters === "" || parameters.split(";").includes("0")) {
      events.push({ offset, kind: "reset", bit: 0 });
      hasReset = true;
    }
    // The re-open is a textual replacement of the exact end code, so only that
    // spelling restores the span.
    const bit = endCodeBit(token.value);
    if (bit !== 0) events.push({ offset, kind: "rearm", bit });
  }
  if (!hasReset) return null;

  const at: number[] = [];
  const rearmed: number[] = [];
  let currentAt = -1;
  let currentRearmed = 0;
  let eventIndex = 0;
  offset = 0;
  for (let index = 0; index < runs.length; index++) {
    while (eventIndex < events.length && events[eventIndex]!.offset <= offset) {
      const event = events[eventIndex]!;
      eventIndex++;
      if (event.kind === "reset") {
        currentAt = index;
        currentRearmed = 0;
      } else if (event.kind === "break") {
        currentAt = -1;
        currentRearmed = 0;
      } else {
        currentRearmed |= event.bit;
      }
    }
    at.push(currentAt);
    rearmed.push(currentRearmed);
    offset += runs[index]!.grapheme.length;
  }
  return { at, rearmed };
}

/**
 * Whether the content itself already resolved the channel a contribution would
 * set. An SGR pair the content opened replaces the enclosing span for its own
 * channel, which is what the pair reduction expressed as "same end code wins".
 */
function contentResolvesChannel(style: Style, contribution: TextStyleContribution): boolean {
  if (contribution.kind === "attribute") {
    // Bold and dim share one end code but coexist, so each is decided by its
    // own bit rather than by the code that would close both.
    return (
      (style.attrs & contribution.attribute) !== 0 ||
      style.extraSgr.some((pair) => pair.endCode === contribution.close)
    );
  }
  const channel = contribution.kind === "background" ? style.background : style.foreground;
  return (
    channel.kind !== "default" || style.extraSgr.some((pair) => pair.endCode === contribution.close)
  );
}

function withContributions(cell: Cell, contributions: readonly TextStyleContribution[]): Cell {
  const base = cell.style;
  let foreground = base.foreground;
  let background = base.background;
  let attrs = base.attrs;
  let resets: SgrPair[] | undefined;

  for (const contribution of contributions) {
    if (contentResolvesChannel(base, contribution)) continue;
    if (contribution.kind === "attribute") {
      attrs |= contribution.attribute;
      continue;
    }
    if (contribution.color.kind === "default") {
      // An actively reset channel has no structured field to carry it: the span
      // it opens is its own close, so it stays an exact SGR pair, ahead of every
      // pair the content itself opened.
      (resets ??= []).push({ code: contribution.close, endCode: contribution.close });
      continue;
    }
    if (contribution.kind === "background") background = contribution.color;
    else foreground = contribution.color;
  }

  if (
    resets === undefined &&
    foreground === base.foreground &&
    background === base.background &&
    attrs === base.attrs
  ) {
    return cell;
  }
  return {
    ...cell,
    style: {
      foreground,
      background,
      attrs,
      extraSgr: resets === undefined ? base.extraSgr : [...resets, ...base.extraSgr],
    },
  };
}

/**
 * Style one chunk's runs with the channels its enclosing Text hosts resolve,
 * from the outermost inwards, appending them to `styled`. `groupStart` is the
 * first run those hosts style as one span, because a content reset stops
 * cancelling them where that span restarts. The result is appended rather than
 * returned because one Text can hold more runs than a call's argument list takes.
 */
export function styleContentRuns(
  runs: readonly Cell[],
  reset: TextContentReset | null,
  from: number,
  to: number,
  groupStart: number,
  contributions: readonly TextStyleContribution[],
  styled: Cell[],
): void {
  for (let index = from; index < to; index++) {
    const run = runs[index]!;
    if (contributions.length === 0) {
      styled.push(run);
      continue;
    }
    const rearmed = reset !== null && reset.at[index]! >= groupStart ? reset.rearmed[index]! : null;
    const applicable =
      rearmed === null
        ? contributions
        : contributions.filter((contribution) => (rearmed & endCodeBit(contribution.close)) !== 0);
    styled.push(applicable.length === 0 ? run : withContributions(run, applicable));
  }
}
