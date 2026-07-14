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
export function deriveTextGeometry(input: {
  readonly node: TuiText;
  readonly renderedText: string;
  readonly wrapped: readonly string[];
  readonly wrapWidth: number;
  readonly wrapMode: TextProps["wrap"];
  readonly surfaceOrigin: InternalCellPoint;
  readonly clip?: InternalCellRect;
  readonly provenanceAvailable?: boolean;
  readonly selectionTargets?: readonly InternalSelectionPaintTarget[];
}): TextGeometryResult {
  const virtualTargets = collectVirtualTexts(input.node);
  const unavailableVirtual = () =>
    new Map<TuiVirtualText, InternalElementGeometry>(
      virtualTargets.map((target) => [target, { status: "unavailable" }]),
    );
  const unavailableSelection = () =>
    new Map<object, InternalTextSelectionTrace | null>(
      (input.selectionTargets ?? []).map((target) => [target.key, null]),
    );
  if (input.provenanceAvailable === false || containsTransform(input.node)) {
    return {
      topCaretSlots: null,
      topFragments: null,
      virtual: unavailableVirtual(),
      selection: unavailableSelection(),
    };
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
    return {
      topCaretSlots: null,
      topFragments: null,
      virtual: unavailableVirtual(),
      selection: unavailableSelection(),
    };
  }

  const truncating =
    input.wrapMode === "truncate" ||
    input.wrapMode === "truncate-start" ||
    input.wrapMode === "truncate-middle" ||
    input.wrapMode === "truncate-end";
  if (truncating) {
    return {
      topCaretSlots: directCaretSlots(actualRows, input.surfaceOrigin, input.clip),
      topFragments: null,
      virtual: unavailableVirtual(),
      selection: unavailableSelection(),
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
  boundary.set(0, { ...input.surfaceOrigin });
  recordSelectionStop(0, { ...input.surfaceOrigin });
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
      const start = { x: input.surfaceOrigin.x + column, y: input.surfaceOrigin.y + rowIndex };
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
      const end = { x: input.surfaceOrigin.x + column, y: input.surfaceOrigin.y + rowIndex };
      boundary.set(candidate.end, end);
      recordSelectionStop(candidate.end, end);
      sourceIndex++;
    }
    if (mismatch) break;
    const newline = source.graphemes[sourceIndex];
    if (newline?.text === "\n") {
      const nextRow = { x: input.surfaceOrigin.x, y: input.surfaceOrigin.y + rowIndex + 1 };
      for (const owner of newline.owners) {
        if (unavailableOwners.has(owner)) continue;
        const trace = traces.get(owner)!;
        if ((trace.rows.get(rowIndex)?.length ?? 0) === 0 && !trace.origins.has(rowIndex)) {
          trace.origins.set(rowIndex, input.surfaceOrigin.x + column);
        }
        trace.origins.set(rowIndex + 1, nextRow.x);
      }
      const newlineStart = {
        x: input.surfaceOrigin.x + column,
        y: input.surfaceOrigin.y + rowIndex,
      };
      boundary.set(newline.start, newlineStart);
      recordSelectionStop(newline.start, newlineStart);
      boundary.set(newline.end, nextRow);
      recordSelectionStop(newline.end, nextRow);
      sourceIndex++;
    }
  }
  if (mismatch || sourceIndex !== source.graphemes.length) {
    return {
      topCaretSlots: null,
      topFragments: null,
      virtual: unavailableVirtual(),
      selection: unavailableSelection(),
    };
  }

  const topTrace = traces.get(0)!;
  for (const rowIndex of actualRows.keys()) {
    if (actualRows[rowIndex] === "" && !topTrace.origins.has(rowIndex)) {
      topTrace.origins.set(rowIndex, input.surfaceOrigin.x);
    }
  }

  for (const meta of metas.values()) {
    if (meta.start !== meta.end || unavailableOwners.has(meta.id)) continue;
    const origin = boundary.get(meta.start) ?? input.surfaceOrigin;
    traces.get(meta.id)!.origins.set(origin.y - input.surfaceOrigin.y, origin.x);
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
          visible: glyphVisible(cell, input.clip),
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
      if (
        originX !== undefined &&
        !trace.localBySurface.has(surfaceKey(originX, input.surfaceOrigin.y + surfaceRow))
      ) {
        trace.localBySurface.set(surfaceKey(originX, input.surfaceOrigin.y + surfaceRow), {
          x: 0,
          y: localY,
        });
      }
    }
  }

  const geometryByOwner = new Map<TuiText | TuiVirtualText, InternalElementGeometry>();
  const slotsByOwner = new Map<TuiText | TuiVirtualText, InternalCaretSlot[]>();
  let topFragments: readonly InternalGeometryFragment[] | null = [];
  for (const trace of traces.values()) {
    if (unavailableOwners.has(trace.meta.id)) {
      geometryByOwner.set(trace.meta.node, { status: "unavailable" });
      if (trace.meta.node.type === "tui-text") topFragments = null;
      continue;
    }
    const fragments: InternalGeometryFragment[] = [];
    const slots = new Map<string, InternalCaretSlot>();
    for (const [localY, cells] of trace.localRows) {
      if (cells.length === 0) {
        // Only structurally empty Text or an explicit empty newline row creates
        // an insertion origin. A non-empty zero-width grapheme creates no cell.
        const surfaceRow = trace.surfaceRowByLocal.get(localY);
        if (surfaceRow === undefined) continue;
        const surface = {
          x: trace.origins.get(surfaceRow)!,
          y: input.surfaceOrigin.y + surfaceRow,
        };
        slots.set(`0:${localY}`, {
          local: { x: 0, y: localY },
          surface,
          visible: pointVisible(surface, input.clip),
        });
        continue;
      }

      let run: LocalTraceCell[] = [];
      const finishRun = () => {
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
        const parentPoint = trace.meta.parentOwner
          ? traces
              .get(ids.get(trace.meta.parentOwner)!)
              ?.localBySurface.get(surfaceKey(first.surfaceX, first.surfaceY))
          : {
              x: first.surfaceX - input.surfaceOrigin.x,
              y: first.surfaceY - input.surfaceOrigin.y,
            };
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
          visible: cell.visible && pointVisible(startSurface, input.clip),
        });
        slots.set(`${cell.localX + cell.width}:${localY}`, {
          local: { x: cell.localX + cell.width, y: localY },
          surface: endSurface,
          visible: cell.visible && pointVisible(endSurface, input.clip),
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
      const origin = boundary.get(trace.meta.start) ?? input.surfaceOrigin;
      const parentPoint = trace.meta.parentOwner
        ? traces
            .get(ids.get(trace.meta.parentOwner)!)
            ?.localBySurface.get(surfaceKey(origin.x, origin.y))
        : { x: origin.x - input.surfaceOrigin.x, y: origin.y - input.surfaceOrigin.y };
      geometryByOwner.set(trace.meta.node, {
        status: "zero-size",
        parent: { x: parentPoint?.x ?? 0, y: parentPoint?.y ?? 0, width: 0, height: 0 },
        surface: { ...origin, width: 0, height: 0 },
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

  const selection = new Map<object, InternalTextSelectionTrace | null>();
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
      selection.set(target.key, null);
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
    selection.set(target.key, Object.freeze({ text, boundaries, stops, cells }));
  }

  return {
    topCaretSlots: slotsByOwner.get(input.node) ?? [],
    topFragments,
    virtual: new Map(
      virtualTargets.map((target) => [
        target,
        geometryByOwner.get(target) ?? ({ status: "unavailable" } as const),
      ]),
    ),
    selection,
  };
}

export function virtualTextDescendants(node: TuiNode): readonly TuiVirtualText[] {
  return collectVirtualTexts(node);
}
