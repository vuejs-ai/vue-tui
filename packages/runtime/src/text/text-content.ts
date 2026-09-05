import type { Cell } from "../frame/cell.ts";
import type { SgrPair, Style } from "../frame/style.ts";
import { cellsFromStyledChars } from "./cell-style.ts";
import { sanitizeAnsiMultiline } from "./sanitize-ansi.ts";
import { styledGraphemesFromAnsi, visibleText } from "./text-measure.ts";
import type { TextStyleContribution } from "./text-style.ts";

export interface ParsedTextContent {
  /** The sanitized source text, which measurement and wrapping work on. */
  readonly text: string;
  readonly runs: readonly Cell[];
  /** Runs contributed by each source chunk, in order. */
  readonly chunkRuns: readonly number[];
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

  return { text, runs, chunkRuns };
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
 * from the outermost inwards, appending them to `styled`. The result is appended
 * rather than returned because one Text can hold more runs than a call's
 * argument list takes.
 */
export function styleContentRuns(
  runs: readonly Cell[],
  from: number,
  to: number,
  contributions: readonly TextStyleContribution[],
  styled: Cell[],
): void {
  for (let index = from; index < to; index++) {
    const run = runs[index]!;
    styled.push(contributions.length === 0 ? run : withContributions(run, contributions));
  }
}
