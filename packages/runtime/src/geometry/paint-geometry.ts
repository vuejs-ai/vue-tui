import stringWidth from "string-width";
import type { TextProps, TuiNode, TuiText, TuiVirtualText } from "../host/nodes.ts";
import { sanitizeAnsiMultiline } from "../paint/sanitize-ansi.ts";
import { tokenizeAnsi } from "../paint/ansi-tokenizer.ts";
import type {
  InternalCaretSlot,
  InternalCellPoint,
  InternalCellRect,
  InternalElementGeometry,
  InternalGeometryFragment,
} from "./geometry-service.ts";
import type {
  InternalSelectionPaintTarget,
  InternalTextSelectionTrace,
} from "../selection/selection-paint.ts";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function stripAnsi(text: string): string {
  let plain = "";
  for (const token of tokenizeAnsi(text)) {
    if (token.type === "text") plain += token.value;
  }
  return plain;
}

export function intersectGeometryRect(
  rect: InternalCellRect,
  clip: InternalCellRect | undefined,
): InternalCellRect | null {
  if (!clip) return rect.width > 0 && rect.height > 0 ? rect : null;
  const x = Math.max(rect.x, clip.x);
  const y = Math.max(rect.y, clip.y);
  const right = Math.min(rect.x + rect.width, clip.x + clip.width);
  const bottom = Math.min(rect.y + rect.height, clip.y + clip.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

export function createRectGeometry(input: {
  readonly parent: InternalCellRect;
  readonly surface: InternalCellRect;
  readonly clip?: InternalCellRect;
  readonly caretSlots?: readonly InternalCaretSlot[] | null;
}): InternalElementGeometry {
  const { parent, surface, clip } = input;
  const local = { x: 0, y: 0, width: surface.width, height: surface.height };
  const visibleSurface = intersectGeometryRect(surface, clip);
  const fragment: InternalGeometryFragment = { local, parent, surface, visibleSurface };
  const resolved = {
    parent,
    surface,
    fragments: surface.width > 0 && surface.height > 0 ? [fragment] : [],
    caretSlots: input.caretSlots === undefined ? [] : input.caretSlots,
  };
  if (surface.width === 0 || surface.height === 0) {
    return { status: "zero-size", ...resolved };
  }
  return visibleSurface
    ? { status: "visible", ...resolved }
    : { status: "fully-clipped", ...resolved };
}

interface TextSegment {
  readonly text: string;
  readonly owners: readonly number[];
  readonly start: number;
  readonly end: number;
}

interface OwnerMeta {
  readonly id: number;
  readonly node: TuiText | TuiVirtualText;
  readonly parentOwner: TuiText | TuiVirtualText | null;
  start: number;
  end: number;
}

interface SourceGrapheme {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly width: number;
  readonly owners: readonly number[];
}

interface TraceCell {
  readonly surfaceX: number;
  readonly surfaceY: number;
  readonly width: number;
}

interface LocalTraceCell extends TraceCell {
  readonly localX: number;
  readonly localY: number;
}

interface ProjectedLocalTraceCell extends LocalTraceCell {
  readonly visible: boolean;
}

interface OwnerTrace {
  readonly meta: OwnerMeta;
  readonly rows: Map<number, TraceCell[]>;
  readonly origins: Map<number, number>;
  readonly localBySurface: Map<string, InternalCellPoint>;
  readonly localRows: Map<number, LocalTraceCell[]>;
  readonly surfaceRowByLocal: Map<number, number>;
}

function collectVirtualTexts(node: TuiNode, out: TuiVirtualText[] = []): TuiVirtualText[] {
  if (node.type === "text-leaf" || node.type === "comment") return out;
  for (const child of node.children) {
    if (child.type === "tui-virtual-text") out.push(child);
    collectVirtualTexts(child, out);
  }
  return out;
}

function containsTransform(node: TuiNode): boolean {
  if (node.type === "tui-transform") return true;
  if (node.type === "text-leaf" || node.type === "comment") return false;
  return node.children.some(containsTransform);
}

function buildPlainSegments(
  node: TuiText | TuiVirtualText,
  ids: ReadonlyMap<TuiText | TuiVirtualText, number>,
  owners: readonly number[],
  segments: TextSegment[],
  offset: { value: number },
  metas: ReadonlyMap<number, OwnerMeta>,
): void {
  const id = ids.get(node)!;
  const ownOwners = [...owners, id];
  const meta = metas.get(id)!;
  meta.start = offset.value;
  for (const child of node.children) {
    if (child.type === "text-leaf") {
      const text = stripAnsi(sanitizeAnsiMultiline(child.value));
      const start = offset.value;
      offset.value += text.length;
      segments.push({ text, owners: ownOwners, start, end: offset.value });
    } else if (child.type === "tui-virtual-text") {
      buildPlainSegments(child, ids, ownOwners, segments, offset, metas);
    }
  }
  meta.end = offset.value;
}

function intersection(values: readonly (readonly number[])[]): number[] {
  const first = values[0];
  if (!first) return [];
  return first.filter((owner) => values.every((candidate) => candidate.includes(owner)));
}

function sourceGraphemes(
  plain: string,
  segments: readonly TextSegment[],
): { readonly graphemes: SourceGrapheme[]; readonly partialOwners: ReadonlySet<number> } {
  const graphemes: SourceGrapheme[] = [];
  const partialOwners = new Set<number>();
  for (const part of graphemeSegmenter.segment(plain)) {
    const start = part.index;
    const end = start + part.segment.length;
    const overlapping = segments.filter(
      (segment) => segment.end > start && segment.start < end && segment.text !== "",
    );
    const sharedOwners = intersection(overlapping.map((segment) => segment.owners));
    const allOwners = new Set(overlapping.flatMap((segment) => segment.owners));
    for (const owner of allOwners) {
      if (!sharedOwners.includes(owner)) partialOwners.add(owner);
    }
    graphemes.push({
      text: part.segment,
      start,
      end,
      width: stringWidth(part.segment),
      owners: sharedOwners,
    });
  }
  return { graphemes, partialOwners };
}

function pointVisible(point: InternalCellPoint, clip: InternalCellRect | undefined): boolean {
  return (
    !clip ||
    (point.x >= clip.x &&
      point.y >= clip.y &&
      point.x < clip.x + clip.width &&
      point.y < clip.y + clip.height)
  );
}

function glyphVisible(cell: TraceCell, clip: InternalCellRect | undefined): boolean {
  return (
    !clip ||
    (cell.surfaceX >= clip.x &&
      cell.surfaceY >= clip.y &&
      cell.surfaceX + cell.width <= clip.x + clip.width &&
      cell.surfaceY < clip.y + clip.height)
  );
}

function surfaceKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function bounds(rects: readonly InternalCellRect[]): InternalCellRect {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

function directCaretSlots(
  rows: readonly string[],
  origin: InternalCellPoint,
  clip: InternalCellRect | undefined,
): InternalCaretSlot[] {
  const slots = new Map<string, InternalCaretSlot>();
  for (const [localY, row] of rows.entries()) {
    let x = 0;
    for (const part of graphemeSegmenter.segment(stripAnsi(row))) {
      const width = stringWidth(part.segment);
      if (width <= 0) continue;
      const start = { x: origin.x + x, y: origin.y + localY };
      const end = { x: start.x + width, y: start.y };
      const retained = glyphVisible({ surfaceX: start.x, surfaceY: start.y, width }, clip);
      slots.set(`${x}:${localY}`, {
        local: { x, y: localY },
        surface: start,
        visible: retained && pointVisible(start, clip),
      });
      x += width;
      slots.set(`${x}:${localY}`, {
        local: { x, y: localY },
        surface: end,
        visible: retained && pointVisible(end, clip),
      });
    }
    if (row === "" && rows.length === 1) {
      const surface = { x: origin.x, y: origin.y };
      slots.set(`0:${localY}`, {
        local: { x: 0, y: localY },
        surface,
        visible: pointVisible(surface, clip),
      });
    }
  }
  return [...slots.values()];
}

export interface TextGeometryResult {
  readonly topCaretSlots: readonly InternalCaretSlot[] | null;
  readonly topFragments: readonly InternalGeometryFragment[] | null;
  readonly virtual: ReadonlyMap<TuiVirtualText, InternalElementGeometry>;
  readonly selection: ReadonlyMap<object, InternalTextSelectionTrace | null>;
}

/** Trace complete graphemes through one authoritative wrapped Text generation. */
export interface DeriveTextGeometryInput {
  readonly node: TuiText;
  readonly renderedText: string;
  readonly wrapped: readonly string[];
  readonly wrapWidth: number;
  readonly wrapMode: TextProps["wrap"];
  readonly surfaceOrigin: InternalCellPoint;
  readonly clip?: InternalCellRect;
  readonly provenanceAvailable?: boolean;
  readonly selectionTargets?: readonly InternalSelectionPaintTarget[];
  /** False lets selection-only frames reuse the local document mapping across origins. */
  readonly geometryRequested?: boolean;
}

type PrepareTextLayoutInput = Omit<
  DeriveTextGeometryInput,
  "surfaceOrigin" | "clip" | "geometryRequested"
>;

interface TextLayoutBase {
  readonly virtualTargets: readonly TuiVirtualText[];
  readonly selectionKeys: readonly object[];
}

interface UnavailableTextLayout extends TextLayoutBase {
  readonly kind: "unavailable";
}

interface TruncatedTextLayout extends TextLayoutBase {
  readonly kind: "truncated";
  readonly actualRows: readonly string[];
}

interface MappedTextLayout extends TextLayoutBase {
  readonly kind: "mapped";
  readonly ids: ReadonlyMap<TuiText | TuiVirtualText, number>;
  readonly metas: ReadonlyMap<number, OwnerMeta>;
  readonly traces: ReadonlyMap<number, OwnerTrace>;
  readonly boundary: ReadonlyMap<number, InternalCellPoint>;
  readonly unavailableOwners: ReadonlySet<number>;
  readonly localSelection: ReadonlyMap<object, InternalTextSelectionTrace | null>;
}

type PreparedTextLayout = UnavailableTextLayout | TruncatedTextLayout | MappedTextLayout;

function prepareTextLayout(input: PrepareTextLayoutInput): PreparedTextLayout {
  const virtualTargets = collectVirtualTexts(input.node);
  const selectionKeys = (input.selectionTargets ?? []).map((target) => target.key);
  const unavailable = (): UnavailableTextLayout => ({
    kind: "unavailable",
    virtualTargets,
    selectionKeys,
  });
  if (input.provenanceAvailable === false || containsTransform(input.node)) {
    return unavailable();
  }

  const owners: Array<TuiText | TuiVirtualText> = [input.node, ...virtualTargets];
  const ids = new Map(owners.map((owner, index) => [owner, index] as const));
  const metas = new Map<number, OwnerMeta>();
  for (const [id, node] of owners.entries()) {
    metas.set(id, {
      id,
      node,
      parentOwner:
        node.type === "tui-virtual-text" &&
        (node.parent?.type === "tui-text" || node.parent?.type === "tui-virtual-text")
          ? node.parent
          : null,
      start: 0,
      end: 0,
    });
  }
  const segments: TextSegment[] = [];
  const offset = { value: 0 };
  buildPlainSegments(input.node, ids, [], segments, offset, metas);
  const plain = segments.map((segment) => segment.text).join("");
  const actualRows = input.wrapped.map(stripAnsi);
  if (plain !== stripAnsi(input.renderedText)) {
    return unavailable();
  }

  const truncating =
    input.wrapMode === "truncate" ||
    input.wrapMode === "truncate-start" ||
    input.wrapMode === "truncate-middle" ||
    input.wrapMode === "truncate-end";
  if (truncating) {
    return {
      kind: "truncated",
      virtualTargets,
      selectionKeys,
      actualRows,
    };
  }

  const source = sourceGraphemes(plain, segments);
  const unavailableOwners = new Set(source.partialOwners);
  const legalSourceBoundaries = new Set<number>([0]);
  for (const grapheme of source.graphemes) legalSourceBoundaries.add(grapheme.end);
  for (const meta of metas.values()) {
    if (meta.start === meta.end && !legalSourceBoundaries.has(meta.start)) {
      unavailableOwners.add(meta.id);
    }
  }
  // A child whose parent has no independent grapheme provenance cannot expose a
  // meaningful parent-relative mapping either.
  for (const meta of metas.values()) {
    let parent = meta.parentOwner;
    while (parent) {
      const parentId = ids.get(parent)!;
      if (unavailableOwners.has(parentId)) unavailableOwners.add(meta.id);
      parent =
        parent.type === "tui-virtual-text" &&
        (parent.parent?.type === "tui-text" || parent.parent?.type === "tui-virtual-text")
          ? parent.parent
          : null;
    }
  }

  const traces = new Map<number, OwnerTrace>();
  for (const meta of metas.values()) {
    traces.set(meta.id, {
      meta,
      rows: new Map(),
      origins: new Map(),
      localBySurface: new Map(),
      localRows: new Map(),
      surfaceRowByLocal: new Map(),
    });
  }
  const boundary = new Map<number, InternalCellPoint>();
  const selectionStops = new Map<number, InternalCellPoint[]>();
  const recordSelectionStop = (offset: number, point: InternalCellPoint): void => {
    let points = selectionStops.get(offset);
    if (!points) selectionStops.set(offset, (points = []));
    if (!points.some((candidate) => candidate.x === point.x && candidate.y === point.y)) {
      points.push(point);
    }
  };
  const mappedSourceCells = new Map<number, TraceCell>();
  boundary.set(0, { x: 0, y: 0 });
  recordSelectionStop(0, { x: 0, y: 0 });
  let sourceIndex = 0;
  let mismatch = false;
  for (const [rowIndex, row] of actualRows.entries()) {
    let column = 0;
    const actualGraphemes = [...graphemeSegmenter.segment(row)];
    for (const actual of actualGraphemes) {
      const candidate = source.graphemes[sourceIndex];
      if (
        !candidate ||
        candidate.text === "\n" ||
        candidate.text.normalize("NFC") !== actual.segment.normalize("NFC")
      ) {
        mismatch = true;
        break;
      }
      const start = { x: column, y: rowIndex };
      if (!boundary.has(candidate.start)) boundary.set(candidate.start, start);
      recordSelectionStop(candidate.start, start);
      if (candidate.width > 0) {
        mappedSourceCells.set(candidate.start, {
          surfaceX: start.x,
          surfaceY: start.y,
          width: candidate.width,
        });
        for (const owner of candidate.owners) {
          if (unavailableOwners.has(owner)) continue;
          const trace = traces.get(owner)!;
          let cells = trace.rows.get(rowIndex);
          if (!cells) trace.rows.set(rowIndex, (cells = []));
          cells.push({ surfaceX: start.x, surfaceY: start.y, width: candidate.width });
        }
        column += candidate.width;
      }
      const end = { x: column, y: rowIndex };
      boundary.set(candidate.end, end);
      recordSelectionStop(candidate.end, end);
      sourceIndex++;
    }
    if (mismatch) break;
    const newline = source.graphemes[sourceIndex];
    if (newline?.text === "\n") {
      const nextRow = { x: 0, y: rowIndex + 1 };
      for (const owner of newline.owners) {
        if (unavailableOwners.has(owner)) continue;
        const trace = traces.get(owner)!;
        if ((trace.rows.get(rowIndex)?.length ?? 0) === 0 && !trace.origins.has(rowIndex)) {
          trace.origins.set(rowIndex, column);
        }
        trace.origins.set(rowIndex + 1, nextRow.x);
      }
      const newlineStart = { x: column, y: rowIndex };
      boundary.set(newline.start, newlineStart);
      recordSelectionStop(newline.start, newlineStart);
      boundary.set(newline.end, nextRow);
      recordSelectionStop(newline.end, nextRow);
      sourceIndex++;
    }
  }
  if (mismatch || sourceIndex !== source.graphemes.length) {
    return unavailable();
  }

  const topTrace = traces.get(0)!;
  for (const rowIndex of actualRows.keys()) {
    if (actualRows[rowIndex] === "" && !topTrace.origins.has(rowIndex)) {
      topTrace.origins.set(rowIndex, 0);
    }
  }

  for (const meta of metas.values()) {
    if (meta.start !== meta.end || unavailableOwners.has(meta.id)) continue;
    const origin = boundary.get(meta.start) ?? { x: 0, y: 0 };
    traces.get(meta.id)!.origins.set(origin.y, origin.x);
  }

  for (const trace of traces.values()) {
    const surfaceRows = [...new Set([...trace.rows.keys(), ...trace.origins.keys()])].sort(
      (a, b) => a - b,
    );
    for (const [denseLocalY, surfaceRow] of surfaceRows.entries()) {
      const localY = trace.meta.node.type === "tui-text" ? surfaceRow : denseLocalY;
      const cells = trace.rows.get(surfaceRow) ?? [];
      let localX = 0;
      const localCells: LocalTraceCell[] = [];
      for (const cell of cells) {
        const localCell: LocalTraceCell = {
          ...cell,
          localX,
          localY,
        };
        localCells.push(localCell);
        trace.localBySurface.set(surfaceKey(cell.surfaceX, cell.surfaceY), {
          x: localX,
          y: localY,
        });
        localX += cell.width;
        trace.localBySurface.set(surfaceKey(cell.surfaceX + cell.width, cell.surfaceY), {
          x: localX,
          y: localY,
        });
      }
      trace.localRows.set(localY, localCells);
      trace.surfaceRowByLocal.set(localY, surfaceRow);
      const originX = cells[0]?.surfaceX ?? trace.origins.get(surfaceRow);
      if (originX !== undefined && !trace.localBySurface.has(surfaceKey(originX, surfaceRow))) {
        trace.localBySurface.set(surfaceKey(originX, surfaceRow), {
          x: 0,
          y: localY,
        });
      }
    }
  }

  const localSelection = new Map<object, InternalTextSelectionTrace | null>();
  for (const target of input.selectionTargets ?? []) {
    const ownerId = ids.get(target.node);
    const meta = ownerId === undefined ? undefined : metas.get(ownerId);
    const hasStandaloneZeroWidthGrapheme =
      meta !== undefined &&
      source.graphemes.some(
        (grapheme) =>
          grapheme.start >= meta.start &&
          grapheme.end <= meta.end &&
          grapheme.text !== "\n" &&
          grapheme.width === 0 &&
          grapheme.owners.includes(meta.id),
      );
    if (!meta || unavailableOwners.has(meta.id) || hasStandaloneZeroWidthGrapheme) {
      localSelection.set(target.key, null);
      continue;
    }
    const text = plain.slice(meta.start, meta.end);
    const boundaries = [0];
    for (const part of graphemeSegmenter.segment(text)) {
      boundaries.push(part.index + part.segment.length);
    }
    const stops = [...selectionStops.entries()]
      .filter(([offset]) => offset >= meta.start && offset <= meta.end)
      .flatMap(([offset, points]) =>
        points.map((point) => ({ offset: offset - meta.start, x: point.x, y: point.y })),
      );
    const cells = source.graphemes.flatMap((grapheme, id) => {
      if (
        grapheme.start < meta.start ||
        grapheme.end > meta.end ||
        !grapheme.owners.includes(meta.id) ||
        grapheme.width <= 0
      ) {
        return [];
      }
      const mapped = mappedSourceCells.get(grapheme.start);
      if (!mapped) return [];
      return [
        {
          id,
          text: grapheme.text,
          start: grapheme.start - meta.start,
          end: grapheme.end - meta.start,
          x: mapped.surfaceX,
          y: mapped.surfaceY,
          width: mapped.width,
        },
      ];
    });
    localSelection.set(
      target.key,
      Object.freeze({ text, boundaries, surfaceOrigin: { x: 0, y: 0 }, stops, cells }),
    );
  }

  return {
    kind: "mapped",
    virtualTargets,
    selectionKeys,
    ids,
    metas,
    traces,
    boundary,
    unavailableOwners,
    localSelection,
  };
}

interface TextLayoutCache {
  readonly revision: number;
  readonly renderedText: string;
  readonly wrapped: readonly string[];
  readonly wrapWidth: number;
  readonly wrapMode: TextProps["wrap"];
  readonly provenanceAvailable: boolean | undefined;
  readonly targetKeys: readonly object[];
  readonly targetNodes: readonly (TuiText | TuiVirtualText)[];
  readonly layout: PreparedTextLayout;
  projectedX: number;
  projectedY: number;
  projectedClipX: number | undefined;
  projectedClipY: number | undefined;
  projectedClipWidth: number | undefined;
  projectedClipHeight: number | undefined;
  projectedGeometry: boolean;
  projected: TextGeometryResult;
}

const textLayoutCache = new WeakMap<TuiText, TextLayoutCache>();

function sameIdentityList(left: readonly object[], right: readonly object[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameRows(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function projectSelectionLayout(
  local: ReadonlyMap<object, InternalTextSelectionTrace | null>,
  origin: InternalCellPoint,
): ReadonlyMap<object, InternalTextSelectionTrace | null> {
  const selection = new Map<object, InternalTextSelectionTrace | null>();
  for (const [key, trace] of local) {
    selection.set(
      key,
      trace === null
        ? null
        : Object.freeze({
            text: trace.text,
            boundaries: trace.boundaries,
            surfaceOrigin: Object.freeze({ x: origin.x, y: origin.y }),
            stops: trace.stops,
            cells: trace.cells,
          }),
    );
  }
  return selection;
}

function unavailableVirtualGeometry(
  targets: readonly TuiVirtualText[],
): ReadonlyMap<TuiVirtualText, InternalElementGeometry> {
  return new Map(targets.map((target) => [target, { status: "unavailable" } as const]));
}

function unavailableSelectionGeometry(
  keys: readonly object[],
): ReadonlyMap<object, InternalTextSelectionTrace | null> {
  return new Map(keys.map((key) => [key, null]));
}

function projectMappedTextLayout(
  layout: MappedTextLayout,
  origin: InternalCellPoint,
  clip: InternalCellRect | undefined,
): TextGeometryResult {
  const geometryByOwner = new Map<TuiText | TuiVirtualText, InternalElementGeometry>();
  const slotsByOwner = new Map<TuiText | TuiVirtualText, InternalCaretSlot[]>();
  let topFragments: readonly InternalGeometryFragment[] | null = [];

  for (const trace of layout.traces.values()) {
    if (layout.unavailableOwners.has(trace.meta.id)) {
      geometryByOwner.set(trace.meta.node, { status: "unavailable" });
      if (trace.meta.node.type === "tui-text") topFragments = null;
      continue;
    }

    const fragments: InternalGeometryFragment[] = [];
    const slots = new Map<string, InternalCaretSlot>();
    for (const [localY, localCells] of trace.localRows) {
      if (localCells.length === 0) {
        // Only structurally empty Text or an explicit empty newline row creates
        // an insertion origin. A non-empty zero-width grapheme creates no cell.
        const surfaceRow = trace.surfaceRowByLocal.get(localY);
        const originX = surfaceRow === undefined ? undefined : trace.origins.get(surfaceRow);
        if (surfaceRow === undefined || originX === undefined) continue;
        const surface = { x: origin.x + originX, y: origin.y + surfaceRow };
        slots.set(`0:${localY}`, {
          local: { x: 0, y: localY },
          surface,
          visible: pointVisible(surface, clip),
        });
        continue;
      }

      const cells: ProjectedLocalTraceCell[] = localCells.map((cell) => {
        const projected = {
          ...cell,
          surfaceX: origin.x + cell.surfaceX,
          surfaceY: origin.y + cell.surfaceY,
        };
        return { ...projected, visible: glyphVisible(projected, clip) };
      });
      let run: ProjectedLocalTraceCell[] = [];
      const finishRun = (): void => {
        if (run.length === 0) return;
        const first = run[0]!;
        const last = run.at(-1)!;
        const width = last.localX + last.width - first.localX;
        const surface: InternalCellRect = {
          x: first.surfaceX,
          y: first.surfaceY,
          width: last.surfaceX + last.width - first.surfaceX,
          height: 1,
        };
        const local: InternalCellRect = { x: first.localX, y: localY, width, height: 1 };
        const layoutX = first.surfaceX - origin.x;
        const layoutY = first.surfaceY - origin.y;
        const parentPoint = trace.meta.parentOwner
          ? layout.traces
              .get(layout.ids.get(trace.meta.parentOwner)!)
              ?.localBySurface.get(surfaceKey(layoutX, layoutY))
          : { x: layoutX, y: layoutY };
        fragments.push({
          local,
          parent: {
            x: parentPoint?.x ?? local.x,
            y: parentPoint?.y ?? local.y,
            width,
            height: 1,
          },
          surface,
          visibleSurface: first.visible ? surface : null,
        });
        run = [];
      };

      for (const cell of cells) {
        const previous = run.at(-1);
        if (
          previous &&
          (previous.surfaceX + previous.width !== cell.surfaceX ||
            previous.localX + previous.width !== cell.localX ||
            previous.visible !== cell.visible)
        ) {
          finishRun();
        }
        run.push(cell);
        const startSurface = { x: cell.surfaceX, y: cell.surfaceY };
        const endSurface = { x: cell.surfaceX + cell.width, y: cell.surfaceY };
        slots.set(`${cell.localX}:${localY}`, {
          local: { x: cell.localX, y: localY },
          surface: startSurface,
          visible: cell.visible && pointVisible(startSurface, clip),
        });
        slots.set(`${cell.localX + cell.width}:${localY}`, {
          local: { x: cell.localX + cell.width, y: localY },
          surface: endSurface,
          visible: cell.visible && pointVisible(endSurface, clip),
        });
      }
      finishRun();
    }

    const caretSlots = [...slots.values()];
    slotsByOwner.set(trace.meta.node, caretSlots);
    if (trace.meta.node.type === "tui-text") {
      topFragments = fragments;
      continue;
    }
    if (fragments.length === 0) {
      const localOrigin = layout.boundary.get(trace.meta.start) ?? { x: 0, y: 0 };
      const parentPoint = trace.meta.parentOwner
        ? layout.traces
            .get(layout.ids.get(trace.meta.parentOwner)!)
            ?.localBySurface.get(surfaceKey(localOrigin.x, localOrigin.y))
        : localOrigin;
      geometryByOwner.set(trace.meta.node, {
        status: "zero-size",
        parent: { x: parentPoint?.x ?? 0, y: parentPoint?.y ?? 0, width: 0, height: 0 },
        surface: {
          x: origin.x + localOrigin.x,
          y: origin.y + localOrigin.y,
          width: 0,
          height: 0,
        },
        fragments: [],
        caretSlots,
      });
      continue;
    }
    const surface = bounds(fragments.map((fragment) => fragment.surface));
    const parent = bounds(fragments.map((fragment) => fragment.parent));
    geometryByOwner.set(trace.meta.node, {
      status: fragments.some((fragment) => fragment.visibleSurface) ? "visible" : "fully-clipped",
      parent,
      surface,
      fragments,
      caretSlots,
    });
  }

  return {
    topCaretSlots: slotsByOwner.get(layout.metas.get(0)!.node) ?? [],
    topFragments,
    virtual: new Map(
      layout.virtualTargets.map((target) => [
        target,
        geometryByOwner.get(target) ?? ({ status: "unavailable" } as const),
      ]),
    ),
    selection: projectSelectionLayout(layout.localSelection, origin),
  };
}

function projectTextLayout(
  layout: PreparedTextLayout,
  origin: InternalCellPoint,
  clip: InternalCellRect | undefined,
  includeGeometry: boolean,
): TextGeometryResult {
  if (layout.kind === "mapped") {
    if (includeGeometry) return projectMappedTextLayout(layout, origin, clip);
    return {
      topCaretSlots: [],
      topFragments: [],
      virtual: new Map(),
      selection: projectSelectionLayout(layout.localSelection, origin),
    };
  }
  const selection = unavailableSelectionGeometry(layout.selectionKeys);
  if (!includeGeometry) {
    return { topCaretSlots: [], topFragments: [], virtual: new Map(), selection };
  }
  if (layout.kind === "unavailable") {
    return {
      topCaretSlots: null,
      topFragments: null,
      virtual: unavailableVirtualGeometry(layout.virtualTargets),
      selection,
    };
  }
  return {
    topCaretSlots: directCaretSlots(layout.actualRows, origin, clip),
    topFragments: null,
    virtual: unavailableVirtualGeometry(layout.virtualTargets),
    selection,
  };
}

function prepareInput(input: DeriveTextGeometryInput): PrepareTextLayoutInput {
  return {
    node: input.node,
    renderedText: input.renderedText,
    wrapped: input.wrapped,
    wrapWidth: input.wrapWidth,
    wrapMode: input.wrapMode,
    provenanceAvailable: input.provenanceAvailable,
    selectionTargets: input.selectionTargets,
  };
}

/** Direct derivation used to verify that cached projections preserve semantics. */
export function deriveTextGeometryUncached(input: DeriveTextGeometryInput): TextGeometryResult {
  const targets = input.selectionTargets ?? [];
  return projectTextLayout(
    prepareTextLayout(prepareInput(input)),
    input.surfaceOrigin,
    input.clip,
    input.geometryRequested !== false || targets.length === 0,
  );
}

/** Trace complete graphemes through one authoritative wrapped Text generation. */
export function deriveTextGeometry(input: DeriveTextGeometryInput): TextGeometryResult {
  const targets = input.selectionTargets ?? [];
  const includeGeometry = input.geometryRequested !== false || targets.length === 0;
  const targetKeys = targets.map((target) => target.key);
  const targetNodes = targets.map((target) => target.node);
  let cached = textLayoutCache.get(input.node);
  if (
    cached?.revision !== input.node.textRevision ||
    cached.renderedText !== input.renderedText ||
    cached.wrapWidth !== input.wrapWidth ||
    cached.wrapMode !== input.wrapMode ||
    cached.provenanceAvailable !== input.provenanceAvailable ||
    !sameRows(cached.wrapped, input.wrapped) ||
    !sameIdentityList(cached.targetKeys, targetKeys) ||
    !sameIdentityList(cached.targetNodes, targetNodes)
  ) {
    const layout = prepareTextLayout(prepareInput(input));
    const projected = projectTextLayout(layout, input.surfaceOrigin, input.clip, includeGeometry);
    cached = {
      revision: input.node.textRevision,
      renderedText: input.renderedText,
      wrapped: Object.freeze([...input.wrapped]),
      wrapWidth: input.wrapWidth,
      wrapMode: input.wrapMode,
      provenanceAvailable: input.provenanceAvailable,
      targetKeys: Object.freeze(targetKeys),
      targetNodes: Object.freeze(targetNodes),
      layout,
      projectedX: input.surfaceOrigin.x,
      projectedY: input.surfaceOrigin.y,
      projectedClipX: input.clip?.x,
      projectedClipY: input.clip?.y,
      projectedClipWidth: input.clip?.width,
      projectedClipHeight: input.clip?.height,
      projectedGeometry: includeGeometry,
      projected,
    };
    textLayoutCache.set(input.node, cached);
    return projected;
  }
  if (
    cached.projectedX !== input.surfaceOrigin.x ||
    cached.projectedY !== input.surfaceOrigin.y ||
    cached.projectedClipX !== input.clip?.x ||
    cached.projectedClipY !== input.clip?.y ||
    cached.projectedClipWidth !== input.clip?.width ||
    cached.projectedClipHeight !== input.clip?.height ||
    cached.projectedGeometry !== includeGeometry
  ) {
    cached.projectedX = input.surfaceOrigin.x;
    cached.projectedY = input.surfaceOrigin.y;
    cached.projectedClipX = input.clip?.x;
    cached.projectedClipY = input.clip?.y;
    cached.projectedClipWidth = input.clip?.width;
    cached.projectedClipHeight = input.clip?.height;
    cached.projectedGeometry = includeGeometry;
    cached.projected = projectTextLayout(
      cached.layout,
      input.surfaceOrigin,
      input.clip,
      includeGeometry,
    );
  }
  return cached.projected;
}

export function virtualTextDescendants(node: TuiNode): readonly TuiVirtualText[] {
  return collectVirtualTexts(node);
}
