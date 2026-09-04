import cliBoxes from "cli-boxes";
import { blankCell, type Cell } from "../frame/cell.ts";
import { Frame } from "../frame/frame.ts";
import {
  defaultColor,
  defaultStyle,
  noExtraSgr,
  StyleAttribute,
  type Style,
} from "../frame/style.ts";
import { cellsFromPlainText } from "../text/cell-style.ts";
import { styleContentRuns } from "../text/text-content.ts";
import { styleMeasuredTextLines } from "../text/text-measure.ts";
import {
  explicitTextStyleChannels,
  parseColorValue,
  textStyleContributions,
  type TextStyleContribution,
} from "../text/text-style.ts";
import type {
  TuiNode,
  TuiContainer,
  TextProps,
  TuiText,
  TuiTextChunk,
  TuiTextContent,
  TuiVirtualText,
  BoxProps,
} from "../host/nodes.ts";
import { isContainer } from "../host/nodes.ts";
import type {
  ComputedLayout,
  ComputedNodeLayout,
  StaticLayoutRegion,
} from "../layout/layout-transaction.ts";
import type { PaintGeometryFrame } from "./geometry.ts";
import { assertPaintSurfaceSize } from "./surface-limits.ts";

interface ClipRect {
  x1: number | undefined;
  x2: number | undefined;
  y1: number | undefined;
  y2: number | undefined;
}

function intersectClipRects(a: ClipRect | undefined, b: ClipRect): ClipRect {
  if (!a) return b;
  return {
    x1: a.x1 === undefined ? b.x1 : b.x1 === undefined ? a.x1 : Math.max(a.x1, b.x1),
    x2: a.x2 === undefined ? b.x2 : b.x2 === undefined ? a.x2 : Math.min(a.x2, b.x2),
    y1: a.y1 === undefined ? b.y1 : b.y1 === undefined ? a.y1 : Math.max(a.y1, b.y1),
    y2: a.y2 === undefined ? b.y2 : b.y2 === undefined ? a.y2 : Math.min(a.y2, b.y2),
  };
}

/** One structural row of a write: one cell per grapheme, wide cells not yet expanded. */
type CellRow = readonly Cell[];

/**
 * The grid columns one cell occupies. A grapheme that displays nothing still
 * gets a cell of its own, which is how `slice-ansi` numbers its slots and what
 * the frame's width has to account for.
 */
function gridColumns(cell: Cell): number {
  return cell.width === 0 ? 1 : cell.width;
}

/** The columns these cells display, which is what a clip edge is measured in. */
function displayedColumns(cells: CellRow): number {
  let total = 0;
  for (const cell of cells) total += cell.width;
  return total;
}

/**
 * The longest leading run of `cells` that fits `maxColumns`.
 *
 * A cell claims a column even when it displays nothing, while the fit is
 * measured in displayed columns, so both counts bound the result: a wide
 * grapheme straddling the edge is dropped whole rather than half-painted.
 */
function fittingCells(cells: CellRow, maxColumns: number): CellRow {
  if (maxColumns <= 0) return [];
  let claimed = 0;
  let displayed = 0;
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index]!;
    if (claimed >= maxColumns) return cells.slice(0, index);
    const next = displayed + cell.width;
    if (next > maxColumns) return cells.slice(0, index);
    claimed += gridColumns(cell);
    displayed = next;
  }
  return cells;
}

/**
 * One picture's cells, written by index and materialized once the frame's width
 * is known. Nothing here survives the call that built it.
 */
class CellGrid {
  private readonly height: number;
  private readonly rows: (Cell | undefined)[][];
  private readonly clips: ClipRect[] = [];
  private readonly hardClip: ClipRect | undefined;
  private readonly boundedWidth: number;
  private columns: number;

  constructor(width: number, height: number, clipToBounds = false) {
    assertPaintSurfaceSize(width, height);
    this.height = height;
    this.boundedWidth = width;
    this.columns = width;
    this.hardClip = clipToBounds ? { x1: 0, x2: width, y1: 0, y2: height } : undefined;
    this.rows = Array.from({ length: height }, () => []);
  }

  clip(rect: ClipRect): void {
    this.clips.push(rect);
  }

  unclip(): void {
    this.clips.pop();
  }

  write(x: number, y: number, rows: readonly CellRow[]): void {
    // Every overflow boundary remains authoritative. Intersect the complete
    // ancestor stack so a larger nested overflow box cannot reopen cells that
    // its narrower ancestor already excluded. The viewport is one additional
    // hard boundary over the same accumulated clip.
    const stackedClip = this.clips.reduce<ClipRect | undefined>(
      (current, next) => intersectClipRects(current, next),
      undefined,
    );
    const clip = this.hardClip ? intersectClipRects(stackedClip, this.hardClip) : stackedClip;

    let lines = rows;
    let top = y;
    if (clip && typeof clip.y1 === "number" && typeof clip.y2 === "number") {
      if (top + lines.length < clip.y1 || top > clip.y2) return;
      const from = top < clip.y1 ? clip.y1 - top : 0;
      const to = top + lines.length > clip.y2 ? clip.y2 - top : lines.length;
      lines = lines.slice(from, to);
      if (top < clip.y1) top = clip.y1;
    }

    const clipH =
      clip && typeof clip.x1 === "number" && typeof clip.x2 === "number"
        ? { x1: clip.x1, x2: clip.x2 }
        : null;

    // Safe early skip: entire write starts strictly PAST the right clip edge.
    // This must be strict `>` (not `>=`). The inner per-line clip below already
    // uses strict `>`, so x === clip.x2 clips to an empty write normally.
    if (clipH && x > clipH.x2) return;

    let offsetY = 0;
    for (const line of lines) {
      const row = top + offsetY;

      // A row can fall outside the picture when text is taller than the
      // computed layout. `offsetY` deliberately does not advance here: a write
      // that begins above the surface keeps every later row on that same
      // out-of-range index rather than sliding up into view.
      if (row < 0 || row >= this.height) continue;

      let cells = line;
      let lineX = x;
      if (clipH) {
        const displayedWidth = displayedColumns(cells);
        if (lineX + displayedWidth < clipH.x1 || lineX > clipH.x2) {
          offsetY++;
          continue;
        }
        const from = lineX < clipH.x1 ? clipH.x1 - lineX : 0;
        const to = lineX + displayedWidth > clipH.x2 ? clipH.x2 - lineX : displayedWidth;
        if (from > 0 || to < displayedWidth) {
          // A grapheme the left edge lands inside is dropped whole, and the
          // first retained one keeps its original surface column instead of
          // reflowing left over the dropped cells. For example, "中x" written
          // at x=-1 drops "中" but keeps "x" at x=1, leaving x=0 blank.
          let column = 0;
          let first = 0;
          while (first < cells.length && column < from) {
            column += gridColumns(cells[first]!);
            first++;
          }
          const start = column;
          let last = first;
          while (last < cells.length && column < to) {
            column += gridColumns(cells[last]!);
            last++;
          }
          lineX += start;
          cells = fittingCells(cells.slice(first, last), clipH.x2 - lineX);
        }
      }

      this.blit(cells, lineX, row);
      offsetY++;
    }
  }

  toFrame(): Frame {
    const frameWidth = Math.max(1, this.hardClip ? this.boundedWidth : this.columns);
    assertPaintSurfaceSize(frameWidth, this.height);
    const frame = new Frame(frameWidth, this.height);
    for (let row = 0; row < this.height; row++) {
      this.rows[row]!.forEach((cell, column) => {
        if (cell !== undefined && column < frameWidth) frame.set(column, row, cell);
      });
    }
    return frame;
  }

  private blit(cells: CellRow, lineX: number, row: number): void {
    // Nothing to write (e.g. the line was clipped away).
    if (cells.length === 0) return;

    let offsetX = lineX;

    // Wide characters (e.g. CJK) occupy two cells: a leading cell with the
    // character and a trailing placeholder with an empty grapheme. When an
    // overlapping write lands in the middle of a wide character, the boundary
    // cells need cleanup so the terminal never renders a half-visible wide
    // character.
    if (
      this.cellAt(offsetX, row)?.grapheme === "" &&
      offsetX > 0 &&
      (this.cellAt(offsetX - 1, row)?.width ?? 0) > 1
    ) {
      this.setCell(offsetX - 1, row, blankCell);
    }

    // Normal relative output has no x-bounds check here. A wide character whose
    // leading cell is in bounds but whose trailing cell exceeds the width still
    // renders its leading cell and overflows the row. A whole-glyph width guard
    // would drop the character, including its valid leading cell, when only its
    // trailing cell exceeds the edge. Box-level overflow:hidden clipping is
    // handled in `write`; this loop must not re-implement a second,
    // glyph-truncating clip. The one exception is the explicit fullscreen hard
    // boundary below: a glyph beyond the addressable viewport would make the
    // terminal wrap.
    for (const cell of cells) {
      const cellWidth = gridColumns(cell);

      // A wide glyph may straddle the final cell. Keep the viewport as a hard
      // cell boundary so the terminal cannot auto-wrap an extra glyph and
      // scroll the fullscreen surface.
      if (this.hardClip && (offsetX < 0 || offsetX + cellWidth > this.boundedWidth)) {
        offsetX += cellWidth;
        continue;
      }

      // A grapheme that displays nothing owns its cell in the grid, and the
      // encoder reads a zero width as the trailing half of a wide cell, so it
      // enters the frame claiming the one column it was given.
      this.setCell(offsetX, row, cell.width === 0 ? { ...cell, width: 1 } : cell);
      for (let index = 1; index < cellWidth; index++) {
        this.setCell(offsetX + index, row, {
          grapheme: "",
          width: 0,
          style: cell.style,
          link: cell.link,
        });
      }
      offsetX += cellWidth;
    }

    if (this.cellAt(offsetX, row)?.grapheme === "") {
      this.setCell(offsetX, row, blankCell);
    }
  }

  private cellAt(x: number, y: number): Cell | undefined {
    if (x < 0) return undefined;
    return this.rows[y]?.[x];
  }

  private setCell(x: number, y: number, cell: Cell): void {
    if (x < 0 || y < 0 || y >= this.height) return;
    if (this.hardClip && x >= this.boundedWidth) return;
    this.rows[y]![x] = cell;
    if (x + 1 > this.columns) this.columns = x + 1;
  }
}

// Compose a Text node by styling the runs its content parsed into. Parent
// modifiers remain active across nested Text boundaries, while a nested
// explicit channel value overrides that channel for its own subtree.
//
// The surrounding Box background is the outermost Text's base. From there,
// background follows the same structural channel cascade as foreground and
// modifiers: omission inherits the nearest Text value, an explicit color
// replaces it, and "default" actively resets the terminal channel. Unsupported
// raw-host non-string values are treated as absent.
function composeTextRuns(
  node: TuiText,
  content: TuiTextContent,
  inheritedBg: string | undefined,
): readonly Cell[] {
  const chunkStyles = content.chunks.map((chunk) =>
    textStyleContributionsForChunk(node, chunk, inheritedBg),
  );
  // Content that no enclosing Text styles is already its own composition.
  if (chunkStyles.every((list) => list.length === 0)) return content.runs;

  const composed: Cell[] = [];
  const blocked = content.chunks.map((chunk) =>
    chunk.nesting.reduce((mask, nested) => mask | explicitTextStyleChannels(nested.props), 0),
  );
  let start = 0;
  let groupStart = 0;
  for (let index = 0; index < content.chunks.length; index++) {
    const chunk = content.chunks[index]!;
    // One group covers every neighbouring chunk this node styles identically, so
    // a reset written in one of them keeps cancelling that style through the
    // rest of the group, exactly as one wrap around the joined text did.
    if (index === 0 || blocked[index] !== blocked[index - 1]) groupStart = start;
    const end = start + chunk.runs;
    styleContentRuns(
      content.runs,
      content.reset,
      start,
      end,
      groupStart,
      chunkStyles[index]!,
      composed,
    );
    start = end;
  }
  return composed;
}

/** The channels the enclosing Text hosts resolve around one chunk, outermost first. */
function textStyleContributionsForChunk(
  node: TuiText,
  chunk: TuiTextChunk,
  inheritedBg: string | undefined,
): TextStyleContribution[] {
  const levels: readonly (TuiText | TuiVirtualText)[] = [node, ...chunk.nesting];
  // Every explicit value resolves its channel for the complete subtree, so a
  // level skips the channels any level inside it sets.
  const blockedBelow: number[] = [];
  let inner = 0;
  for (let index = levels.length - 1; index >= 0; index--) {
    blockedBelow[index] = inner;
    inner |= explicitTextStyleChannels(levels[index]!.props);
  }

  const contributions: TextStyleContribution[] = [];
  for (let index = 0; index < levels.length; index++) {
    const props = levels[index]!.props;
    // A surrounding Box supplies only the outermost Text's base background.
    // Public Text background values are strings, including the active `default`
    // reset. Unsupported raw-host values do not replace the base.
    const ownBg = props.backgroundColor;
    const styleProps =
      index === 0 && typeof ownBg !== "string" ? { ...props, backgroundColor: inheritedBg } : props;
    contributions.push(...textStyleContributions(styleProps, blockedBelow[index]!));
  }
  return contributions;
}

type BoxStyle = (typeof cliBoxes)[keyof cliBoxes.Boxes];

function isBoxStyleName(style: string): style is keyof cliBoxes.Boxes {
  return Object.prototype.hasOwnProperty.call(cliBoxes, style);
}

/** The cell style one authored background color selects, ignoring what it cannot parse. */
function backgroundStyle(color: unknown): Style {
  const background = parseColorValue(color);
  return background === undefined
    ? defaultStyle
    : { foreground: defaultColor, background, attrs: 0, extraSgr: noExtraSgr };
}

function drawBorder(
  grid: CellGrid,
  x: number,
  y: number,
  w: number,
  h: number,
  props: BoxProps,
): void {
  const style = props["borderStyle"] as string | BoxStyle | undefined;
  if (!style) return;
  // A complete custom BoxStyle supplies its glyphs directly; a string selects a
  // named cli-boxes frame.
  const chars: BoxStyle | undefined =
    typeof style === "string" ? (isBoxStyleName(style) ? cliBoxes[style] : undefined) : style;
  // Defensive internal fallback: an unknown borderStyle name has no entry in
  // cliBoxes, so silently draw no border rather than throw. This is unreachable
  // via the public API — the Box component validates an unknown non-empty
  // borderStyle string during render and throws there (caught by vue-tui's error
  // boundary), so paint never sees an invalid name. A raw throw here would unwind
  // through Vue's post-flush commit and wedge its internal flush state.
  if (!chars) return;
  // Draw each visible edge independently. A one-cell-tall box with only side
  // rails still renders │X│, and a one-cell-wide box with only top/bottom still
  // renders those glyphs. Clamp individual repeat counts so a degenerate
  // dimension cannot throw.
  if (w < 1 || h < 1) return;

  const top = props["borderTop"] !== false;
  const bottom = props["borderBottom"] !== false;
  const left = props["borderLeft"] !== false;
  const right = props["borderRight"] !== false;

  const stringProp = (name: string): string | undefined => {
    const value = props[name];
    return typeof value === "string" ? value : undefined;
  };

  const borderColor = stringProp("borderColor");
  // Keep the raw (non-coerced) general dim value so per-edge overrides work correctly.
  const generalDim = props["borderDimColor"] as boolean | undefined;
  const borderBackgroundColor = stringProp("borderBackgroundColor");

  function edgeStyle(edge: "top" | "bottom" | "left" | "right"): Style {
    const capEdge = edge.charAt(0).toUpperCase() + edge.slice(1);
    const edgeColor = stringProp(`border${capEdge}Color`) ?? borderColor;
    // Use nullish coalescing (not ||) so an explicit per-edge `false` wins over
    // generalDim — only `undefined` falls back to the general value.
    const edgeDim = (props[`border${capEdge}DimColor`] as boolean | undefined) ?? generalDim;
    // An edge's background comes only from the per-edge or general border
    // background, never from the Box's content backgroundColor.
    const edgeBg = stringProp(`border${capEdge}BackgroundColor`) ?? borderBackgroundColor;
    const foreground = parseColorValue(edgeColor) ?? defaultColor;
    const background = parseColorValue(edgeBg) ?? defaultColor;
    const attrs = edgeDim ? StyleAttribute.dim : 0;
    return foreground === defaultColor && background === defaultColor && attrs === 0
      ? defaultStyle
      : { foreground, background, attrs, extraSgr: noExtraSgr };
  }

  if (top) {
    const style = edgeStyle("top");
    const tl = cellsFromPlainText(left ? chars.topLeft : chars.top, style);
    const tr = cellsFromPlainText(right ? chars.topRight : chars.top, style);
    const fill = Math.max(0, w - displayedColumns(tl) - displayedColumns(tr));
    const row = [...tl, ...cellsFromPlainText(chars.top.repeat(fill), style), ...tr];
    grid.write(x, y, [fittingCells(row, w)]);
  }
  if (bottom) {
    const style = edgeStyle("bottom");
    const bl = cellsFromPlainText(left ? chars.bottomLeft : chars.bottom, style);
    const br = cellsFromPlainText(right ? chars.bottomRight : chars.bottom, style);
    const fill = Math.max(0, w - displayedColumns(bl) - displayedColumns(br));
    const row = [...bl, ...cellsFromPlainText(chars.bottom.repeat(fill), style), ...br];
    grid.write(x, y + h - 1, [fittingCells(row, w)]);
  }

  // Vertical sides begin below a visible top edge, or at row zero when the top
  // edge is absent. Their run length excludes whichever horizontal edges exist.
  const offsetY = top ? 1 : 0;
  const verticalRun = Math.max(0, h - (top ? 1 : 0) - (bottom ? 1 : 0));
  const leftRow = left ? cellsFromPlainText(chars.left, edgeStyle("left")) : undefined;
  const rightRow = right ? cellsFromPlainText(chars.right, edgeStyle("right")) : undefined;
  for (let i = 0; i < verticalRun; i++) {
    if (leftRow) grid.write(x, y + offsetY + i, [leftRow]);
    if (rightRow) grid.write(x + w - 1, y + offsetY + i, [rightRow]);
  }
}

function getBoxContentMetrics(
  layout: ComputedNodeLayout,
  w: number,
  h: number,
): { width: number; height: number } {
  const left = layout.border.left + layout.padding.left;
  const right = layout.border.right + layout.padding.right;
  const top = layout.border.top + layout.padding.top;
  const bottom = layout.border.bottom + layout.padding.bottom;
  const frameWidth = left + right;
  const frameHeight = top + bottom;

  return {
    width: Math.max(0, Math.floor(w - frameWidth)),
    height: Math.max(0, Math.floor(h - frameHeight)),
  };
}

function spaceCells(count: number, style: Style): Cell[] {
  return Array.from({ length: count }, () => ({
    grapheme: " ",
    width: 1,
    style,
    link: undefined,
  }));
}

function fillBackground(
  grid: CellGrid,
  x: number,
  y: number,
  w: number,
  h: number,
  color: unknown,
): void {
  if (!color) return;
  const width = Math.max(0, Math.floor(w));
  const height = Math.max(0, Math.floor(h));
  if (width === 0 || height === 0) return;

  const row = spaceCells(width, backgroundStyle(color));
  for (let i = 0; i < height; i++) grid.write(x, y + i, [row]);
}

function alignTextLine(
  cells: CellRow,
  width: number,
  textAlign: NonNullable<TextProps["textAlign"]>,
  inheritedBg: string | undefined,
): CellRow {
  // Left-aligned text with no background behind it pads nothing, so the line
  // never has to be measured.
  if (textAlign === "left" && !inheritedBg) return cells;

  const remaining = Math.max(0, width - displayedColumns(cells));
  const leading =
    textAlign === "right" ? remaining : textAlign === "center" ? Math.floor(remaining / 2) : 0;
  const trailing = remaining - leading;

  if (!inheritedBg) {
    return leading === 0 ? cells : [...spaceCells(leading, defaultStyle), ...cells];
  }

  const padStyle = backgroundStyle(inheritedBg);
  return [...spaceCells(leading, padStyle), ...cells, ...spaceCells(trailing, padStyle)];
}

/** Style the node's runs, split them over the measured lines, and align each. */
function paintedTextLines(
  node: TuiText,
  content: TuiTextContent,
  inheritedBg: string | undefined,
  wrapWidth: number,
  wrappedLines: readonly string[],
): CellRow[] {
  const composed = composeTextRuns(node, content, inheritedBg);
  return styleMeasuredTextLines(composed, wrappedLines, node.props.wrap ?? "wrap", wrapWidth).map(
    (line) => alignTextLine(line, wrapWidth, node.props.textAlign ?? "left", inheritedBg),
  );
}

interface PaintRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PaintOptions {
  /** Immutable geometry from the layout transaction that precedes this paint. */
  readonly layout: ComputedLayout;
  /** Private frame-local geometry collector. Publication happens after paint succeeds. */
  readonly geometry?: PaintGeometryFrame;
  /**
   * Clip paint and semantic geometry to an app-owned viewport. Fullscreen
   * rendering uses this to keep off-screen layout from wrapping or scrolling
   * the alternate screen and to exclude cells outside the addressable surface.
   */
  readonly viewport?: { readonly width: number; readonly height: number };
}

function intersectPaintRect(rect: PaintRect, clip: PaintRect | undefined): PaintRect | undefined {
  if (!clip) return rect.width > 0 && rect.height > 0 ? rect : undefined;
  const x1 = Math.max(rect.x, clip.x);
  const y1 = Math.max(rect.y, clip.y);
  const x2 = Math.min(rect.x + rect.width, clip.x + clip.width);
  const y2 = Math.min(rect.y + rect.height, clip.y + clip.height);
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  return width > 0 && height > 0 ? { x: x1, y: y1, width, height } : undefined;
}

function recordZeroContentGeometry(
  node: TuiNode,
  layout: ComputedLayout,
  geometry: PaintGeometryFrame | undefined,
): void {
  if (!geometry?.hasObservedSubtree(node)) return;
  if (node.type === "tui-static") {
    geometry.recordSubtree(node, "unavailable");
    return;
  }
  const computed = layout.get(node);
  if (computed && !computed.isLaidOut && !computed.isContentLayoutGuarded) {
    geometry.recordSubtree(node, "hidden");
    return;
  }
  if (node.type === "tui-box" && computed) {
    geometry.record(node, 0, 0, Math.floor(computed.rect.left), Math.floor(computed.rect.top));
  }
  if (!isContainer(node)) return;
  for (const child of node.children) recordZeroContentGeometry(child, layout, geometry);
}

export function paint(root: TuiNode, options: PaintOptions): Frame {
  if (root.type !== "root") throw new Error("paint expects TuiRoot");
  const rootLayout = options.layout.get(root);
  if (!rootLayout) throw new Error("paint requires the root ComputedLayout");
  const width = Math.max(1, Math.floor(options.viewport?.width ?? rootLayout.rect.width));
  const height = Math.max(1, Math.floor(options.viewport?.height ?? rootLayout.rect.height));
  const grid = new CellGrid(width, height, options.viewport !== undefined);
  const viewportClip = options.viewport ? { x: 0, y: 0, width, height } : undefined;
  paintNode(root, options.layout, grid, 0, 0, undefined, viewportClip, options.geometry);
  return grid.toFrame();
}

function paintNode(
  node: TuiNode,
  computedLayout: ComputedLayout,
  grid: CellGrid,
  x0: number,
  y0: number,
  inheritedBg?: string,
  clip?: PaintRect,
  geometry?: PaintGeometryFrame,
): void {
  // Box-size collection is demand-driven. Once no observed target exists in
  // this subtree, keep ordinary paint on its pre-measurement path.
  if (geometry && !geometry.hasObservedSubtree(node)) geometry = undefined;

  // display:none collapses the node to zero size but still reports a layout;
  // skip the subtree so hidden content never leaks onto visible siblings.
  const computed = computedLayout.get(node);
  if (computed && !computed.isLaidOut) {
    if (node.type === "tui-static") geometry?.recordSubtree(node, "unavailable");
    else if (computed.isContentLayoutGuarded)
      recordZeroContentGeometry(node, computedLayout, geometry);
    else geometry?.recordSubtree(node, "hidden");
    return;
  }

  switch (node.type) {
    case "root": {
      for (const child of node.children) {
        paintNode(child, computedLayout, grid, x0, y0, undefined, clip, geometry);
      }
      return;
    }
    case "tui-box": {
      if (!computed) return;
      const x = x0 + computed.rect.left;
      const y = y0 + computed.rect.top;
      const w = Math.max(0, Math.floor(computed.rect.width));
      const h = Math.max(0, Math.floor(computed.rect.height));
      // Parent-relative outer layout offsets — not terminal or root coordinates.
      geometry?.record(node, w, h, Math.floor(computed.rect.left), Math.floor(computed.rect.top));
      // Split the Box's own background from the value threaded to children. An
      // empty string paints no fill and does not replace an inherited background,
      // so descendants continue to inherit from the nearest non-empty Box value.
      const rawBg = node.props["backgroundColor"];
      const ownBg = typeof rawBg === "string" ? rawBg : undefined;
      const childBg = ownBg ? ownBg : inheritedBg;
      if (node.props["borderStyle"]) {
        drawBorder(grid, x, y, w, h, node.props);
      }
      if (ownBg) {
        const hasBorder = !!node.props["borderStyle"];
        const bt = hasBorder && node.props["borderTop"] !== false ? 1 : 0;
        const bb = hasBorder && node.props["borderBottom"] !== false ? 1 : 0;
        const bl = hasBorder && node.props["borderLeft"] !== false ? 1 : 0;
        const br = hasBorder && node.props["borderRight"] !== false ? 1 : 0;
        fillBackground(grid, x + bl, y + bt, w - bl - br, h - bt - bb, ownBg);
      }

      // Overflow clipping limits children to the box content area (inside
      // borders) when overflow/overflowX/overflowY is "hidden". Apply it before
      // the zero-content decision so absolute children are still clipped.
      let clipped = false;
      const overflow = node.props["overflow"] as string | undefined;
      const overflowX = (node.props["overflowX"] as string | undefined) ?? overflow ?? "visible";
      const overflowY = (node.props["overflowY"] as string | undefined) ?? overflow ?? "visible";
      // Axis-specific values override the broad shorthand. Active ancestor
      // clips remain on the grid's stack, so a visible inner axis cannot reopen
      // a region hidden by an outer Box.
      const clipH = overflowX === "hidden";
      const clipV = overflowY === "hidden";
      const { left: bl, right: br, top: bt, bottom: bb } = computed.border;
      if (clipH || clipV) {
        grid.clip({
          x1: clipH ? x + bl : undefined,
          x2: clipH ? x + w - br : undefined,
          y1: clipV ? y + bt : undefined,
          y2: clipV ? y + h - bb : undefined,
        });
        clipped = true;
      }
      const childClip =
        clipH || clipV
          ? (intersectPaintRect(
              {
                x: clipH ? x + bl : (clip?.x ?? x - 1_000_000_000),
                y: clipV ? y + bt : (clip?.y ?? y - 1_000_000_000),
                width: clipH ? w - bl - br : (clip?.width ?? 2_000_000_000),
                height: clipV ? h - bt - bb : (clip?.height ?? 2_000_000_000),
              },
              clip,
            ) ?? { x: 0, y: 0, width: 0, height: 0 })
          : clip;

      const contentMetrics = getBoxContentMetrics(computed, w, h);
      // A Box with no inner content area has no legal paint region for FLOW
      // children. Absolutely-positioned children, though, are placed against
      // their containing block — the padding box (inside the borders) — not the
      // content rect; paint just those and keep flow children suppressed.
      if (contentMetrics.width === 0 || contentMetrics.height === 0) {
        for (const child of node.children) {
          if (computedLayout.get(child)?.isAbsolute) {
            paintNode(child, computedLayout, grid, x, y, childBg, childClip, geometry);
          } else {
            recordZeroContentGeometry(child, computedLayout, geometry);
          }
        }
        if (clipped) grid.unclip();
        return;
      }

      for (const child of node.children) {
        paintNode(child, computedLayout, grid, x, y, childBg, childClip, geometry);
      }

      if (clipped) grid.unclip();
      return;
    }
    case "tui-text": {
      if (!computed) return;
      // Text keeps its pre-pixel-grid fractional geometry so measurement and
      // paint can quantize the same width without a feedback layout. Terminal
      // writes still need integral cell coordinates; floor matches the
      // conservative start edge used for its complete-cell budget.
      const left = Math.floor(computed.rect.left);
      const top = Math.floor(computed.rect.top);
      const y = y0 + top;
      // This span is only an early-clip bound. Text geometry can retain a
      // positive fractional height, so round outward here; the grid remains the
      // authority for clipping the actual rows written below.
      const h = Math.max(0, Math.ceil(computed.rect.height));
      // A Text entirely above or below an authoritative clip cannot affect the
      // output grid. Skip composition and cell allocation as well. Limit this to
      // Text: a clipped Box may still contain an absolutely positioned or
      // overflow-visible descendant that re-enters the viewport.
      if (clip && (y + h <= clip.y || y >= clip.y + clip.height)) {
        return;
      }
      // Thread the INHERITED Box bg (NOT a pre-computed effective bg) into the
      // composition. The Text's own backgroundColor — including an explicit ""
      // opt-out — is resolved against this inherited bg while the enclosing
      // levels are collected, alongside its boolean styles.
      // Layout already chose the whole-cell budget and every physical line.
      // Paint only applies terminal styles and alignment to that immutable plan;
      // re-wrapping here would let a second budget diverge from Yoga's measure.
      const textLayout = computed.text;
      if (!textLayout) return;
      // The layout transaction parsed this node's content for the same commit,
      // so the runs are current for every Text it laid out.
      const content = node.content;
      // Empty text has no cells to write.
      if (!content || content.text === "") return;
      const { wrapWidth, wrappedLines } = textLayout;
      // Pad each line to the cell width with the INHERITED Box background only —
      // this fills the space behind the text with the Box's bg (the Box also fills
      // it via fillBackground), and is the reason a Box bg pads to full width while
      // a text-only bg does not. The padding uses `inheritedBg`, NOT the effective
      // bg: a Text that overrides or opts out (backgroundColor / "") only recolors
      // its OWN glyphs, never the surrounding Box fill. The already-styled cells
      // keep their effective bg, so a `backgroundColor=""` Text stays bare even
      // though we pad the trailing cells with the inherited bg.
      // Pad to wrapWidth (not a >=1-clamped width): at width 0 there is nothing to
      // pad. Clamping to 1 here would bg-pad the empty leading wrap line into a
      // stray 1-cell fill that collides with a row-sibling at the 0-width box origin.
      grid.write(
        x0 + left,
        y0 + top,
        paintedTextLines(node, content, inheritedBg, wrapWidth, wrappedLines),
      );
      return;
    }
    case "tui-static": {
      // Static is rendered through the static channel (written before frame), so
      // it does not contribute to the dynamic frame paint.
      geometry?.recordSubtree(node, "unavailable");
      return;
    }
    case "tui-virtual-text":
    case "text-leaf":
    case "comment":
      // virtual-text and text-leaf are painted through their enclosing Text.
      // Comments are invisible.
      return;
  }
}

export function paintContainer(container: TuiContainer, layout: ComputedLayout): Frame {
  // Used by Static channel and tests.
  if (container.type === "root") return paint(container, { layout });
  throw new Error("paintContainer currently only supports root");
}

export function paintStaticLayout(region: StaticLayoutRegion, layout: ComputedLayout): Frame {
  const grid = new CellGrid(region.width, region.height);
  for (const child of region.children) {
    paintNode(child, layout, grid, region.offsetX, region.offsetY);
  }
  return grid.toFrame();
}
