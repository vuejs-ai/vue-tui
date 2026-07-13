import stringWidth from "string-width";
import { describe, expect, test } from "vite-plus/test";
import { wrapText } from "../host/text-measure.ts";

interface CellPoint {
  readonly x: number;
  readonly y: number;
}

interface CellRect extends CellPoint {
  readonly width: number;
  readonly height: number;
}

/** Public rendered geometry, including the exact local-to-surface mapping. */
interface ElementGeometryFragment {
  readonly local: CellRect;
  readonly parent: CellRect;
  readonly surface: CellRect;
  readonly visibleSurface: CellRect | null;
}

/** Exact private insertion slot; deliberately absent from public geometry. */
interface CaretSlot {
  readonly local: CellPoint;
  readonly surface: CellPoint;
  readonly visible: boolean;
}

interface ResolvedElementGeometry {
  readonly parent: CellRect;
  readonly surface: CellRect;
  readonly fragments: readonly ElementGeometryFragment[];
  readonly caretSlots: readonly CaretSlot[];
}

type ElementGeometry =
  | { readonly status: "unavailable" }
  | { readonly status: "detached" }
  | { readonly status: "pending" }
  | { readonly status: "hidden" }
  | (ResolvedElementGeometry & {
      readonly status: "zero-size" | "fully-clipped" | "visible";
    });

type TargetRelation = "pending" | "related" | "unrelated";

type CaretState =
  | { readonly status: "inactive" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "hidden";
      readonly reason:
        | "unavailable"
        | "detached"
        | "pending"
        | "hidden"
        | "clipped"
        | "outside"
        | "invalid-position"
        | "unrelated";
    }
  | { readonly status: "visible"; readonly surface: CellPoint };

interface FocusHandle {
  readonly id: string;
  readonly app: string;
  disposed: boolean;
}

interface CaretOwner {
  readonly id: string;
  readonly focus: FocusHandle;
  position: CellPoint | null;
  positionInvalid: boolean;
  geometry: ElementGeometry;
  relation: TargetRelation;
  disposed: boolean;
}

function contains(rect: CellRect, point: CellPoint): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

function validatePoint(point: CellPoint): void {
  if (
    !Number.isSafeInteger(point.x) ||
    !Number.isSafeInteger(point.y) ||
    point.x < 0 ||
    point.y < 0
  ) {
    throw new TypeError("caret position must contain non-negative safe-integer cells");
  }
}

function resolveCaret(input: {
  readonly outputAvailable: boolean;
  readonly focused: boolean;
  readonly position: CellPoint | null;
  readonly positionInvalid?: boolean;
  readonly geometry: ElementGeometry;
  readonly relation: TargetRelation;
}): CaretState {
  if (input.positionInvalid) return { status: "hidden", reason: "invalid-position" };
  // Direct/initial authored data is checked even when this frame cannot
  // display a caret. Reactive invalid input is already fail-closed above.
  if (input.position !== null) validatePoint(input.position);
  if (!input.outputAvailable) return { status: "unavailable" };
  if (!input.focused || input.position === null) return { status: "inactive" };

  const { geometry } = input;
  if (geometry.status === "unavailable") {
    return { status: "hidden", reason: "unavailable" };
  }
  if (geometry.status === "detached") return { status: "hidden", reason: "detached" };
  if (geometry.status === "pending") return { status: "hidden", reason: "pending" };
  if (geometry.status === "hidden") return { status: "hidden", reason: "hidden" };
  if (input.relation === "pending") return { status: "hidden", reason: "pending" };
  if (input.relation === "unrelated") return { status: "hidden", reason: "unrelated" };

  // Public bounds/fragments describe painted geometry. Exact private slots are
  // the translation authority because wrapping and wide glyphs make a row
  // range insufficient: a continuation cell is not a legal insertion point.
  const slot = geometry.caretSlots.find(
    (candidate) =>
      candidate.local.x === input.position!.x && candidate.local.y === input.position!.y,
  );
  if (!slot) return { status: "hidden", reason: "outside" };
  if (!slot.visible) return { status: "hidden", reason: "clipped" };
  return { status: "visible", surface: slot.surface };
}

class CaretRegistry {
  readonly #owners = new Map<string, CaretOwner>();
  readonly #app: string;

  constructor(app: string) {
    this.#app = app;
  }

  get size(): number {
    return this.#owners.size;
  }

  register(input: {
    readonly id: string;
    readonly focus: FocusHandle;
    readonly position: CellPoint | null;
    readonly geometry: ElementGeometry;
  }): CaretOwner {
    if (input.focus.app !== this.#app) throw new Error("caret focus belongs to another app");
    if (input.focus.disposed) throw new Error("caret focus is already disposed");
    if (input.position !== null) validatePoint(input.position);
    if (this.#owners.has(input.focus.id)) {
      throw new Error(`focus target ${input.focus.id} already has a caret owner`);
    }

    const owner: CaretOwner = {
      ...input,
      positionInvalid: false,
      relation: "pending",
      disposed: false,
    };
    this.#owners.set(input.focus.id, owner);
    return owner;
  }

  updatePosition(owner: CaretOwner, position: CellPoint | null): void {
    try {
      if (position !== null) validatePoint(position);
    } catch {
      // Reactive invalid input is recoverable state. It must not enter the
      // application's fatal error path or leave a stale physical caret.
      owner.position = null;
      owner.positionInvalid = true;
      return;
    }
    owner.position = position;
    owner.positionInvalid = false;
  }

  updateRelation(owner: CaretOwner, relation: TargetRelation): void {
    owner.relation = relation;
  }

  dispose(owner: CaretOwner): void {
    if (this.#owners.get(owner.focus.id) === owner) this.#owners.delete(owner.focus.id);
    owner.disposed = true;
  }

  disposeFocus(focus: FocusHandle): void {
    focus.disposed = true;
    const owner = this.#owners.get(focus.id);
    if (owner?.focus === focus) this.dispose(owner);
  }

  state(owner: CaretOwner, effectiveFocus: FocusHandle | null, outputAvailable = true): CaretState {
    if (owner.disposed) return { status: "inactive" };
    return resolveCaret({
      outputAvailable,
      focused: owner.focus === effectiveFocus,
      position: owner.position,
      positionInvalid: owner.positionInvalid,
      geometry: owner.geometry,
      relation: owner.relation,
    });
  }

  resolve(
    effectiveFocus: FocusHandle | null,
    outputAvailable = true,
  ): { readonly owner: string; readonly state: CaretState } | null {
    if (!effectiveFocus) return null;
    const owner = this.#owners.get(effectiveFocus.id);
    if (!owner) return null;
    return {
      owner: owner.id,
      state: this.state(owner, effectiveFocus, outputAvailable),
    };
  }
}

function editorInsertionCell(
  prefix: string,
  valueBeforeInsertion: string,
  width: number,
): CellPoint {
  const lines = wrapText(prefix + valueBeforeInsertion, width, "wrap");
  return {
    x: stringWidth(lines.at(-1) ?? ""),
    y: Math.max(0, lines.length - 1),
  };
}

function boundingRect(fragments: readonly CellRect[]): CellRect {
  const x = Math.min(...fragments.map((fragment) => fragment.x));
  const y = Math.min(...fragments.map((fragment) => fragment.y));
  const right = Math.max(...fragments.map((fragment) => fragment.x + fragment.width));
  const bottom = Math.max(...fragments.map((fragment) => fragment.y + fragment.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** Fixture helper: callers still enumerate every legal local insertion cell. */
function slotsForRenderedRow(input: {
  readonly localY: number;
  readonly legalXs: readonly number[];
  readonly surfaceAtLocalZero: CellPoint;
  readonly visible: CellRect | null;
}): readonly CaretSlot[] {
  return input.legalXs.map((x) => {
    const surface = {
      x: input.surfaceAtLocalZero.x + x,
      y: input.surfaceAtLocalZero.y,
    };
    return {
      local: { x, y: input.localY },
      surface,
      visible: input.visible !== null && contains(input.visible, surface),
    };
  });
}

const editorGeometry: ElementGeometry = {
  status: "visible",
  parent: { x: 1, y: 1, width: 6, height: 2 },
  surface: { x: 4, y: 3, width: 6, height: 2 },
  fragments: [
    {
      local: { x: 0, y: 0, width: 6, height: 1 },
      parent: { x: 1, y: 1, width: 6, height: 1 },
      surface: { x: 4, y: 3, width: 6, height: 1 },
      visibleSurface: { x: 4, y: 3, width: 6, height: 1 },
    },
    {
      local: { x: 0, y: 1, width: 4, height: 1 },
      parent: { x: 1, y: 2, width: 4, height: 1 },
      surface: { x: 4, y: 4, width: 4, height: 1 },
      visibleSurface: { x: 4, y: 4, width: 4, height: 1 },
    },
  ],
  caretSlots: [
    ...slotsForRenderedRow({
      localY: 0,
      legalXs: [0, 1, 2, 3, 4, 5, 6],
      surfaceAtLocalZero: { x: 4, y: 3 },
      visible: { x: 4, y: 3, width: 6, height: 1 },
    }),
    ...slotsForRenderedRow({
      localY: 1,
      legalXs: [0, 1, 2, 3, 4],
      surfaceAtLocalZero: { x: 4, y: 4 },
      visible: { x: 4, y: 4, width: 4, height: 1 },
    }),
  ],
};

const focusA: FocusHandle = { id: "editor-a", app: "app", disposed: false };
const focusB: FocusHandle = { id: "editor-b", app: "app", disposed: false };

describe("F5 semantic geometry and caret proposal", () => {
  test.each(["inline", "fullscreen"] as const)(
    "%s uses the same element-local editor declaration",
    () => {
      const position = editorInsertionCell("❯ ", "AB中👩‍💻e\u0301", 6);
      expect(position).toEqual({ x: 3, y: 1 });
      expect(
        resolveCaret({
          outputAvailable: true,
          focused: true,
          position,
          geometry: editorGeometry,
          relation: "related",
        }),
      ).toEqual({ status: "visible", surface: { x: 7, y: 4 } });
    },
  );

  test("focus eligibility and insertion state remain independent", () => {
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: false,
        position: { x: 3, y: 1 },
        geometry: editorGeometry,
        relation: "related",
      }),
    ).toEqual({ status: "inactive" });
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: null,
        geometry: editorGeometry,
        relation: "related",
      }),
    ).toEqual({ status: "inactive" });
  });

  test("owners follow effective focus and dispose independently", () => {
    const registry = new CaretRegistry("app");
    const first = registry.register({
      id: "first",
      focus: focusA,
      position: { x: 1, y: 0 },
      geometry: editorGeometry,
    });
    const second = registry.register({
      id: "second",
      focus: focusB,
      position: { x: 3, y: 1 },
      geometry: editorGeometry,
    });
    registry.updateRelation(first, "related");
    registry.updateRelation(second, "related");

    expect(registry.resolve(focusB)).toEqual({
      owner: "second",
      state: { status: "visible", surface: { x: 7, y: 4 } },
    });
    registry.dispose(first);
    expect(registry.resolve(focusB)?.owner).toBe("second");
    registry.dispose(second);
    expect(registry.size).toBe(0);
  });

  test("registration rejects invalid focus and duplicate ownership transactionally", () => {
    const registry = new CaretRegistry("app");
    const otherApp = { id: "other", app: "other-app", disposed: false };
    const disposed = { id: "disposed", app: "app", disposed: true };
    expect(() =>
      registry.register({
        id: "other",
        focus: otherApp,
        position: null,
        geometry: editorGeometry,
      }),
    ).toThrow("another app");
    expect(() =>
      registry.register({
        id: "disposed",
        focus: disposed,
        position: null,
        geometry: editorGeometry,
      }),
    ).toThrow("already disposed");
    registry.register({
      id: "first",
      focus: focusA,
      position: null,
      geometry: editorGeometry,
    });
    expect(() =>
      registry.register({
        id: "duplicate",
        focus: focusA,
        position: null,
        geometry: editorGeometry,
      }),
    ).toThrow("already has a caret owner");
    expect(registry.size).toBe(1);
  });

  test("reactive invalid positions fail closed and later recover", () => {
    const registry = new CaretRegistry("app");
    expect(() =>
      registry.register({
        id: "invalid",
        focus: focusA,
        position: { x: Number.NaN, y: 0 },
        geometry: editorGeometry,
      }),
    ).toThrow("non-negative safe-integer cells");
    expect(registry.size).toBe(0);

    const owner = registry.register({
      id: "editor",
      focus: focusA,
      position: { x: 1, y: 0 },
      geometry: editorGeometry,
    });
    registry.updateRelation(owner, "related");
    registry.updatePosition(owner, { x: Number.POSITIVE_INFINITY, y: 0 });
    expect(registry.resolve(focusA)?.state).toEqual({
      status: "hidden",
      reason: "invalid-position",
    });
    registry.updatePosition(owner, { x: 3, y: 1 });
    expect(registry.resolve(focusA)?.state).toEqual({
      status: "visible",
      surface: { x: 7, y: 4 },
    });
  });

  test("target relation fails closed without a fatal error and can retarget", () => {
    const registry = new CaretRegistry("app");
    const owner = registry.register({
      id: "editor",
      focus: focusA,
      position: { x: 1, y: 0 },
      geometry: editorGeometry,
    });
    expect(registry.resolve(focusA)?.state).toEqual({
      status: "hidden",
      reason: "pending",
    });

    owner.geometry = { status: "detached" };
    expect(registry.resolve(focusA)?.state).toEqual({
      status: "hidden",
      reason: "detached",
    });
    owner.geometry = editorGeometry;
    registry.updateRelation(owner, "unrelated");
    expect(registry.resolve(focusA)?.state).toEqual({
      status: "hidden",
      reason: "unrelated",
    });
    registry.updateRelation(owner, "related");
    expect(registry.resolve(focusA)?.state).toEqual({
      status: "visible",
      surface: { x: 5, y: 3 },
    });
  });

  test("later focus disposal unregisters its owner and leaves another owner intact", () => {
    const registry = new CaretRegistry("app");
    const firstFocus: FocusHandle = { id: "disposable-a", app: "app", disposed: false };
    const secondFocus: FocusHandle = { id: "disposable-b", app: "app", disposed: false };
    const first = registry.register({
      id: "first",
      focus: firstFocus,
      position: { x: 1, y: 0 },
      geometry: editorGeometry,
    });
    const second = registry.register({
      id: "second",
      focus: secondFocus,
      position: { x: 3, y: 1 },
      geometry: editorGeometry,
    });
    registry.updateRelation(first, "related");
    registry.updateRelation(second, "related");

    registry.disposeFocus(firstFocus);
    expect(registry.size).toBe(1);
    expect(registry.state(first, firstFocus)).toEqual({ status: "inactive" });
    expect(registry.resolve(secondFocus)).toEqual({
      owner: "second",
      state: { status: "visible", surface: { x: 7, y: 4 } },
    });
  });

  test("clipping and resize hide instead of clamping", () => {
    const clipped: ElementGeometry = {
      ...editorGeometry,
      status: "fully-clipped",
      fragments: editorGeometry.fragments.map((fragment) => ({
        ...fragment,
        visibleSurface: null,
      })),
      caretSlots: editorGeometry.caretSlots.map((slot) => ({ ...slot, visible: false })),
    };
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 3, y: 1 },
        geometry: clipped,
        relation: "related",
      }),
    ).toEqual({ status: "hidden", reason: "clipped" });
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 7, y: 0 },
        geometry: editorGeometry,
        relation: "related",
      }),
    ).toEqual({ status: "hidden", reason: "outside" });
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 6, y: 0 },
        geometry: editorGeometry,
        relation: "related",
      }),
    ).toEqual({ status: "hidden", reason: "clipped" });
  });

  test.each([
    [{ status: "unavailable" }, "unavailable"],
    [{ status: "detached" }, "detached"],
    [{ status: "pending" }, "pending"],
    [{ status: "hidden" }, "hidden"],
  ] as const)("geometry %s has an explicit active-caret result", (geometry, reason) => {
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 0, y: 0 },
        geometry,
        relation: "related",
      }),
    ).toEqual({ status: "hidden", reason });
  });

  test("authored cells are validated even when output or focus is inactive", () => {
    for (const input of [
      { outputAvailable: false, focused: true },
      { outputAvailable: true, focused: false },
    ]) {
      expect(() =>
        resolveCaret({
          ...input,
          position: { x: Number.NaN, y: 0 },
          geometry: editorGeometry,
          relation: "related",
        }),
      ).toThrow("non-negative safe-integer cells");
    }
    expect(
      resolveCaret({
        outputAvailable: false,
        focused: true,
        position: { x: 0, y: 0 },
        geometry: editorGeometry,
        relation: "related",
      }),
    ).toEqual({ status: "unavailable" });
  });

  test("an empty target can expose an addressable insertion slot at its origin", () => {
    const geometry: ElementGeometry = {
      status: "zero-size",
      parent: { x: 1, y: 1, width: 0, height: 0 },
      surface: { x: 5, y: 2, width: 0, height: 0 },
      fragments: [],
      caretSlots: [
        {
          local: { x: 0, y: 0 },
          surface: { x: 5, y: 2 },
          visible: true,
        },
      ],
    };
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 0, y: 0 },
        geometry,
        relation: "related",
      }),
    ).toEqual({ status: "visible", surface: { x: 5, y: 2 } });
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 0, y: 0 },
        geometry: { ...geometry, caretSlots: [] },
        relation: "related",
      }),
    ).toEqual({ status: "hidden", reason: "outside" });
  });

  test("mapped fragments and exact private slots cover wrapped nested Text and trailing slots", () => {
    const fragments = [
      { x: 2, y: 0, width: 4, height: 1 },
      { x: 0, y: 1, width: 3, height: 1 },
    ] as const;
    expect(boundingRect(fragments)).toEqual({ x: 0, y: 0, width: 6, height: 2 });
    expect(fragments.some((fragment) => contains(fragment, { x: 1, y: 1 }))).toBe(true);
    expect(fragments.some((fragment) => contains(fragment, { x: 1, y: 0 }))).toBe(false);

    const geometry: ElementGeometry = {
      status: "visible",
      parent: { x: 0, y: 0, width: 6, height: 2 },
      surface: { x: 0, y: 0, width: 6, height: 2 },
      fragments: [
        {
          local: { x: 0, y: 0, width: 4, height: 1 },
          parent: { x: 2, y: 0, width: 4, height: 1 },
          surface: { x: 2, y: 0, width: 4, height: 1 },
          visibleSurface: { x: 2, y: 0, width: 4, height: 1 },
        },
        {
          local: { x: 0, y: 1, width: 3, height: 1 },
          parent: { x: 0, y: 1, width: 3, height: 1 },
          surface: { x: 0, y: 1, width: 3, height: 1 },
          visibleSurface: { x: 0, y: 1, width: 3, height: 1 },
        },
      ],
      caretSlots: [
        ...slotsForRenderedRow({
          localY: 0,
          legalXs: [0, 1, 2, 3, 4],
          surfaceAtLocalZero: { x: 2, y: 0 },
          visible: { x: 0, y: 0, width: 8, height: 2 },
        }),
        ...slotsForRenderedRow({
          localY: 1,
          legalXs: [0, 1, 2, 3],
          surfaceAtLocalZero: { x: 0, y: 1 },
          visible: { x: 0, y: 0, width: 8, height: 2 },
        }),
      ],
    };
    expect(geometry.fragments[0]?.local).toEqual({ x: 0, y: 0, width: 4, height: 1 });
    expect(geometry.fragments[0]?.surface).toEqual({ x: 2, y: 0, width: 4, height: 1 });
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 1, y: 1 },
        geometry,
        relation: "related",
      }),
    ).toEqual({ status: "visible", surface: { x: 1, y: 1 } });
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 4, y: 0 },
        geometry,
        relation: "related",
      }),
    ).toEqual({ status: "visible", surface: { x: 6, y: 0 } });
  });

  test("wide glyph continuation cells are not legal caret slots", () => {
    const geometry: ElementGeometry = {
      status: "visible",
      parent: { x: 0, y: 0, width: 3, height: 1 },
      surface: { x: 5, y: 2, width: 3, height: 1 },
      fragments: [
        {
          local: { x: 0, y: 0, width: 3, height: 1 },
          parent: { x: 0, y: 0, width: 3, height: 1 },
          surface: { x: 5, y: 2, width: 3, height: 1 },
          visibleSurface: { x: 5, y: 2, width: 3, height: 1 },
        },
      ],
      // `中A` has boundaries at 0, 2, and 3. Local x=1 is the CJK
      // continuation cell and must never be accepted or rounded.
      caretSlots: slotsForRenderedRow({
        localY: 0,
        legalXs: [0, 2, 3],
        surfaceAtLocalZero: { x: 5, y: 2 },
        visible: { x: 5, y: 2, width: 3, height: 1 },
      }),
    };

    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 1, y: 0 },
        geometry,
        relation: "related",
      }),
    ).toEqual({ status: "hidden", reason: "outside" });
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 2, y: 0 },
        geometry,
        relation: "related",
      }),
    ).toEqual({ status: "visible", surface: { x: 7, y: 2 } });
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 3, y: 0 },
        geometry,
        relation: "related",
      }),
    ).toEqual({ status: "hidden", reason: "clipped" });
  });

  test("descendant Text geometry across an arbitrary Transform is unavailable", () => {
    const transformedDescendant: ElementGeometry = { status: "unavailable" };
    expect(
      resolveCaret({
        outputAvailable: true,
        focused: true,
        position: { x: 0, y: 0 },
        geometry: transformedDescendant,
        relation: "related",
      }),
    ).toEqual({ status: "hidden", reason: "unavailable" });
  });
});
