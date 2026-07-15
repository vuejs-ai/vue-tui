export interface InternalSelectionPoint {
  readonly x: number;
  readonly y: number;
}

export interface InternalSelectionCell extends InternalSelectionPoint {
  /** Stable identity within one semantic document mapping. */
  readonly id: number;
  /** UTF-16 offsets into the semantic plain-text document. */
  readonly start: number;
  readonly end: number;
  readonly width: number;
}

export interface InternalSelectionStop extends InternalSelectionPoint {
  /** One complete-grapheme boundary in the semantic plain-text document. */
  readonly offset: number;
}

/** One exact semantic document mapped through a completed paint. */
export interface InternalSelectionSnapshot {
  readonly text: string;
  /** Sorted complete-grapheme boundaries, including zero and text.length. */
  readonly boundaries: readonly number[];
  /** Surface translation for the origin-independent document mapping below. */
  readonly surfaceOrigin: InternalSelectionPoint;
  /** Cell ids that survived clipping and later overlapping paint operations. */
  readonly visibleCellIds: ReadonlySet<number>;
  /** Document-local visual caret stops. A soft-wrap boundary may appear on two rows. */
  readonly stops: readonly InternalSelectionStop[];
  /** Document-local painted graphemes, including clipped or covered cells. */
  readonly cells: readonly InternalSelectionCell[];
}

export interface InternalSelectionRange {
  readonly anchor: number;
  readonly extent: number;
}

export type InternalSelectionMove =
  | "backward"
  | "forward"
  | "up"
  | "down"
  | "line-start"
  | "line-end"
  | "document-start"
  | "document-end";

export type InternalSelectionOperation = "changed" | "unchanged" | "unavailable";

export interface InternalSelectionDragEvent {
  readonly phase: "start" | "move" | "end" | "cancel";
  readonly surface: InternalSelectionPoint;
  /** Delta from the preceding point. On start this reconstructs the physical down point. */
  readonly movement: InternalSelectionPoint | null;
}

export interface InternalSelectionPolicy {
  readonly snapshot: InternalSelectionSnapshot | null;
  readonly range: InternalSelectionRange | null;
  readonly selectedText: string;
  accept(snapshot: InternalSelectionSnapshot | null): InternalSelectionOperation;
  setSelection(range: InternalSelectionRange | null): InternalSelectionOperation;
  clear(): InternalSelectionOperation;
  selectAll(): InternalSelectionOperation;
  move(direction: InternalSelectionMove, extend: boolean): InternalSelectionOperation;
  click(point: InternalSelectionPoint, extend?: boolean): InternalSelectionOperation;
  drag(event: InternalSelectionDragEvent): InternalSelectionOperation;
}

interface MutableSelectionState {
  snapshot: InternalSelectionSnapshot | null;
  range: InternalSelectionRange | null;
  /** Exact visual stop for the extent when one logical wrap boundary has two positions. */
  extentStop: InternalSelectionStop | null;
  preferredColumn: number | null;
  dragAnchor: number | null;
}

interface InternalSelectionBoundary {
  readonly offset: number;
  readonly stop: InternalSelectionStop | null;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const trustedPaintSnapshots = new WeakSet<InternalSelectionSnapshot>();

/** Mark a snapshot assembled from Runtime's already-validated text layout trace. */
export function trustInternalSelectionPaintSnapshot(
  snapshot: InternalSelectionSnapshot,
): InternalSelectionSnapshot {
  trustedPaintSnapshots.add(snapshot);
  return snapshot;
}

function expectedBoundaries(text: string): number[] {
  const boundaries = [0];
  for (const part of graphemeSegmenter.segment(text)) {
    boundaries.push(part.index + part.segment.length);
  }
  return boundaries;
}

function validateSnapshot(snapshot: InternalSelectionSnapshot): void {
  if (typeof snapshot !== "object" || snapshot === null) {
    throw new TypeError("selection snapshot must be an object");
  }
  if (trustedPaintSnapshots.has(snapshot)) return;
  if (typeof snapshot.text !== "string") {
    throw new TypeError("selection snapshot text must be a string");
  }
  if (
    !Number.isSafeInteger(snapshot.surfaceOrigin?.x) ||
    !Number.isSafeInteger(snapshot.surfaceOrigin?.y)
  ) {
    throw new TypeError("selection snapshot surface origin must use safe integer cells");
  }
  if (!(snapshot.visibleCellIds instanceof Set)) {
    throw new TypeError("selection snapshot visible cell ids must be a Set");
  }
  const expected = expectedBoundaries(snapshot.text);
  if (
    snapshot.boundaries.length !== expected.length ||
    snapshot.boundaries.some((boundary, index) => boundary !== expected[index])
  ) {
    throw new TypeError("selection snapshot boundaries must match complete source graphemes");
  }
  const boundarySet = new Set(expected);
  for (const stop of snapshot.stops) {
    if (!boundarySet.has(stop.offset) || !Number.isFinite(stop.x) || !Number.isFinite(stop.y)) {
      throw new TypeError("selection snapshot stops must use finite cells and grapheme boundaries");
    }
  }
  const cellIds = new Set<number>();
  for (const cell of snapshot.cells) {
    if (
      !Number.isSafeInteger(cell.id) ||
      cellIds.has(cell.id) ||
      !boundarySet.has(cell.start) ||
      !boundarySet.has(cell.end) ||
      cell.start >= cell.end ||
      !Number.isSafeInteger(cell.x) ||
      !Number.isSafeInteger(cell.y) ||
      !Number.isSafeInteger(cell.width) ||
      cell.width <= 0
    ) {
      throw new TypeError("selection snapshot cells must map complete graphemes to terminal cells");
    }
    cellIds.add(cell.id);
  }
  for (const id of snapshot.visibleCellIds) {
    if (!cellIds.has(id)) {
      throw new TypeError("selection snapshot visible cell ids must belong to mapped cells");
    }
  }
}

function surfaceX(snapshot: InternalSelectionSnapshot, point: InternalSelectionPoint): number {
  return snapshot.surfaceOrigin.x + point.x;
}

function surfaceY(snapshot: InternalSelectionSnapshot, point: InternalSelectionPoint): number {
  return snapshot.surfaceOrigin.y + point.y;
}

function localPoint(
  snapshot: InternalSelectionSnapshot,
  point: InternalSelectionPoint,
): InternalSelectionPoint {
  return {
    x: point.x - snapshot.surfaceOrigin.x,
    y: point.y - snapshot.surfaceOrigin.y,
  };
}

function isVisible(snapshot: InternalSelectionSnapshot, cell: InternalSelectionCell): boolean {
  return snapshot.visibleCellIds.has(cell.id);
}

function sameRange(a: InternalSelectionRange | null, b: InternalSelectionRange | null): boolean {
  return a === b || (a !== null && b !== null && a.anchor === b.anchor && a.extent === b.extent);
}

function frozenRange(anchor: number, extent: number): InternalSelectionRange {
  return Object.freeze({ anchor, extent });
}

function boundaryIndex(snapshot: InternalSelectionSnapshot, offset: number): number {
  return snapshot.boundaries.indexOf(offset);
}

function assertRange(snapshot: InternalSelectionSnapshot, range: InternalSelectionRange): void {
  if (
    !Number.isSafeInteger(range.anchor) ||
    !Number.isSafeInteger(range.extent) ||
    boundaryIndex(snapshot, range.anchor) < 0 ||
    boundaryIndex(snapshot, range.extent) < 0
  ) {
    throw new RangeError("selection endpoints must be complete-grapheme boundaries");
  }
}

function compareCells(a: InternalSelectionCell, b: InternalSelectionCell): number {
  return a.y - b.y || a.x - b.x || a.start - b.start;
}

function visibleRows(snapshot: InternalSelectionSnapshot): InternalSelectionCell[][] {
  const rows = new Map<number, InternalSelectionCell[]>();
  for (const cell of snapshot.cells) {
    if (!isVisible(snapshot, cell)) continue;
    let row = rows.get(cell.y);
    if (!row) rows.set(cell.y, (row = []));
    row.push(cell);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, cells]) => cells.sort(compareCells));
}

function cellAt(
  snapshot: InternalSelectionSnapshot,
  point: InternalSelectionPoint,
): InternalSelectionCell | null {
  for (const cell of snapshot.cells) {
    if (
      isVisible(snapshot, cell) &&
      point.y === cell.y &&
      point.x >= cell.x &&
      point.x < cell.x + cell.width
    ) {
      return cell;
    }
  }
  return null;
}

function stopAt(
  snapshot: InternalSelectionSnapshot,
  offset: number,
  x: number,
  y: number,
): InternalSelectionStop | null {
  return (
    snapshot.stops.find((stop) => stop.offset === offset && stop.x === x && stop.y === y) ?? null
  );
}

function cellBoundary(
  snapshot: InternalSelectionSnapshot,
  cell: InternalSelectionCell,
  edge: "start" | "end",
): InternalSelectionBoundary {
  const offset = edge === "start" ? cell.start : cell.end;
  const x = edge === "start" ? cell.x : cell.x + cell.width;
  return { offset, stop: stopAt(snapshot, offset, x, cell.y) };
}

function nearestBoundary(
  snapshot: InternalSelectionSnapshot,
  point: InternalSelectionPoint,
): InternalSelectionBoundary {
  const exact = cellAt(snapshot, point);
  if (exact) {
    // A continuation cell of a wide grapheme is closer to its trailing boundary.
    return cellBoundary(snapshot, exact, point.x > exact.x ? "end" : "start");
  }

  const rows = visibleRows(snapshot);
  if (rows.length === 0) return { offset: 0, stop: null };
  const firstRow = rows[0]!;
  const lastRow = rows.at(-1)!;
  if (point.y < firstRow[0]!.y) return cellBoundary(snapshot, firstRow[0]!, "start");
  if (point.y > lastRow[0]!.y) return cellBoundary(snapshot, lastRow.at(-1)!, "end");

  const row = rows.find((candidate) => candidate[0]!.y === point.y);
  if (!row) {
    const next = rows.find((candidate) => candidate[0]!.y > point.y);
    return next
      ? cellBoundary(snapshot, next[0]!, "start")
      : cellBoundary(snapshot, lastRow.at(-1)!, "end");
  }
  if (point.x <= row[0]!.x) return cellBoundary(snapshot, row[0]!, "start");
  const last = row.at(-1)!;
  if (point.x >= last.x + last.width) return cellBoundary(snapshot, last, "end");

  for (let index = 1; index < row.length; index++) {
    const previous = row[index - 1]!;
    const next = row[index]!;
    if (point.x < next.x) {
      return point.x - (previous.x + previous.width) < next.x - point.x
        ? cellBoundary(snapshot, previous, "end")
        : cellBoundary(snapshot, next, "start");
    }
  }
  return cellBoundary(snapshot, last, "end");
}

function dragExtent(
  snapshot: InternalSelectionSnapshot,
  anchor: number,
  point: InternalSelectionPoint,
): InternalSelectionBoundary {
  const exact = cellAt(snapshot, point);
  if (!exact) return nearestBoundary(snapshot, point);
  return cellBoundary(snapshot, exact, exact.end <= anchor ? "start" : "end");
}

function stopsByRow(snapshot: InternalSelectionSnapshot): InternalSelectionStop[][] {
  const rows = new Map<number, InternalSelectionStop[]>();
  for (const stop of snapshot.stops) {
    let row = rows.get(stop.y);
    if (!row) rows.set(stop.y, (row = []));
    row.push(stop);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, stops]) => stops.sort((a, b) => a.x - b.x || a.offset - b.offset));
}

function stopForOffset(
  snapshot: InternalSelectionSnapshot,
  offset: number,
  direction: "backward" | "forward",
): InternalSelectionStop | null {
  const candidates = snapshot.stops.filter((stop) => stop.offset === offset);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);
  return direction === "backward" ? candidates[0]! : candidates.at(-1)!;
}

function compatibleSelection(
  previous: InternalSelectionSnapshot,
  next: InternalSelectionSnapshot,
  range: InternalSelectionRange,
): boolean {
  const retainedThrough = Math.max(range.anchor, range.extent);
  return (
    retainedThrough <= next.text.length &&
    previous.text.slice(0, retainedThrough) === next.text.slice(0, retainedThrough) &&
    boundaryIndex(next, range.anchor) >= 0 &&
    boundaryIndex(next, range.extent) >= 0
  );
}

/** Project one accepted logical range onto a candidate semantic document without mutating state. */
export function projectInternalSelectionRange(
  previous: InternalSelectionSnapshot | null,
  next: InternalSelectionSnapshot,
  range: InternalSelectionRange | null,
): InternalSelectionRange | null {
  validateSnapshot(next);
  if (!previous || !range) return null;
  return compatibleSelection(previous, next, range)
    ? frozenRange(range.anchor, range.extent)
    : null;
}

/**
 * API-neutral logical selection reducer. Rendering, focus, input routing,
 * pointer capture, and clipboard transport remain separate owners.
 */
export function createInternalSelectionPolicy(): InternalSelectionPolicy {
  const state: MutableSelectionState = {
    snapshot: null,
    range: null,
    extentStop: null,
    preferredColumn: null,
    dragAnchor: null,
  };

  const setRange = (
    range: InternalSelectionRange | null,
    extentStop: InternalSelectionStop | null = null,
  ): InternalSelectionOperation => {
    const changed = !sameRange(state.range, range);
    state.range = range;
    state.extentStop = extentStop;
    return changed ? "changed" : "unchanged";
  };

  const policy: InternalSelectionPolicy = {
    get snapshot() {
      return state.snapshot;
    },
    get range() {
      return state.range;
    },
    get selectedText() {
      if (!state.snapshot || !state.range) return "";
      const start = Math.min(state.range.anchor, state.range.extent);
      const end = Math.max(state.range.anchor, state.range.extent);
      return state.snapshot.text.slice(start, end);
    },
    accept(snapshot) {
      if (snapshot) validateSnapshot(snapshot);
      const previousSnapshot = state.snapshot;
      const previousRange = state.range;
      const previousExtentStop = state.extentStop;
      const previousPreferredColumn = state.preferredColumn;
      const previousDragAnchor = state.dragAnchor;
      state.snapshot = snapshot;
      if (!snapshot || !previousSnapshot || !previousRange) {
        state.extentStop = null;
        state.preferredColumn = null;
        state.dragAnchor = null;
        if (!snapshot) return setRange(null);
        return "unchanged";
      }
      if (!compatibleSelection(previousSnapshot, snapshot, previousRange)) {
        state.extentStop = null;
        state.preferredColumn = null;
        state.dragAnchor = null;
        return setRange(null);
      }
      const mappedExtentStop = previousExtentStop
        ? (snapshot.stops.find(
            (stop) =>
              stop.offset === previousExtentStop.offset &&
              surfaceX(snapshot, stop) === surfaceX(previousSnapshot, previousExtentStop) &&
              surfaceY(snapshot, stop) === surfaceY(previousSnapshot, previousExtentStop),
          ) ?? null)
        : null;
      state.extentStop = mappedExtentStop;
      state.preferredColumn =
        previousExtentStop && !mappedExtentStop ? null : previousPreferredColumn;
      state.dragAnchor =
        previousDragAnchor !== null && boundaryIndex(snapshot, previousDragAnchor) >= 0
          ? previousDragAnchor
          : null;
      return "unchanged";
    },
    setSelection(range) {
      if (!state.snapshot) return "unavailable";
      state.preferredColumn = null;
      if (range === null) return setRange(null);
      assertRange(state.snapshot, range);
      return setRange(frozenRange(range.anchor, range.extent));
    },
    clear() {
      if (!state.snapshot) return "unavailable";
      state.preferredColumn = null;
      return setRange(null);
    },
    selectAll() {
      if (!state.snapshot) return "unavailable";
      state.preferredColumn = null;
      return setRange(frozenRange(0, state.snapshot.text.length));
    },
    move(direction, extend) {
      const snapshot = state.snapshot;
      if (!snapshot) return "unavailable";
      let range = state.range ?? frozenRange(0, 0);
      const collapsed = range.anchor === range.extent;
      const towardStart =
        direction === "backward" ||
        direction === "up" ||
        direction === "line-start" ||
        direction === "document-start";

      if (!extend && !collapsed) {
        const offset = towardStart
          ? Math.min(range.anchor, range.extent)
          : Math.max(range.anchor, range.extent);
        state.preferredColumn = null;
        return setRange(
          frozenRange(offset, offset),
          stopForOffset(snapshot, offset, towardStart ? "backward" : "forward"),
        );
      }

      const current = range.extent;
      let next = current;
      let nextStop: InternalSelectionStop | null = null;
      if (direction === "document-start") next = 0;
      else if (direction === "document-end") next = snapshot.text.length;
      else if (direction === "backward" || direction === "forward") {
        const index = boundaryIndex(snapshot, current);
        const delta = direction === "backward" ? -1 : 1;
        next =
          snapshot.boundaries[
            Math.max(0, Math.min(snapshot.boundaries.length - 1, index + delta))
          ]!;
        nextStop = stopForOffset(snapshot, next, direction);
      } else {
        const rows = stopsByRow(snapshot);
        const currentStop =
          state.extentStop ??
          stopForOffset(snapshot, current, towardStart ? "backward" : "forward");
        const rowIndex = currentStop
          ? rows.findIndex((row) => row.some((stop) => stop === currentStop))
          : -1;
        if (rowIndex >= 0) {
          if (direction === "line-start" || direction === "line-end") {
            const row = rows[rowIndex]!;
            nextStop = direction === "line-start" ? row[0]! : row.at(-1)!;
          } else {
            const targetIndex = Math.max(
              0,
              Math.min(rows.length - 1, rowIndex + (direction === "up" ? -1 : 1)),
            );
            const target = rows[targetIndex]!;
            const column = state.preferredColumn ?? surfaceX(snapshot, currentStop!);
            nextStop = target.reduce((best, candidate) =>
              Math.abs(surfaceX(snapshot, candidate) - column) <
              Math.abs(surfaceX(snapshot, best) - column)
                ? candidate
                : best,
            );
            state.preferredColumn = column;
          }
          next = nextStop.offset;
        }
      }

      if (direction !== "up" && direction !== "down") state.preferredColumn = null;
      range = extend ? frozenRange(range.anchor, next) : frozenRange(next, next);
      return setRange(
        range,
        nextStop ?? stopForOffset(snapshot, next, towardStart ? "backward" : "forward"),
      );
    },
    click(point, extend = false) {
      if (!state.snapshot) return "unavailable";
      const boundary = nearestBoundary(state.snapshot, localPoint(state.snapshot, point));
      const anchor = extend && state.range ? state.range.anchor : boundary.offset;
      state.dragAnchor = null;
      state.preferredColumn = null;
      return setRange(
        frozenRange(anchor, boundary.offset),
        boundary.stop ?? stopForOffset(state.snapshot, boundary.offset, "forward"),
      );
    },
    drag(event) {
      const snapshot = state.snapshot;
      if (!snapshot) return "unavailable";
      if (event.phase === "cancel") {
        state.dragAnchor = null;
        return "unchanged";
      }
      state.preferredColumn = null;
      const surface = localPoint(snapshot, event.surface);
      if (event.phase === "start") {
        const movement = event.movement ?? { x: 0, y: 0 };
        const down = {
          x: surface.x - movement.x,
          y: surface.y - movement.y,
        };
        state.dragAnchor = nearestBoundary(snapshot, down).offset;
      }
      if (state.dragAnchor === null) return "unchanged";
      const extent = dragExtent(snapshot, state.dragAnchor, surface);
      const result = setRange(
        frozenRange(state.dragAnchor, extent.offset),
        extent.stop ?? stopForOffset(snapshot, extent.offset, "forward"),
      );
      if (event.phase === "end") state.dragAnchor = null;
      return result;
    },
  };

  return policy;
}
