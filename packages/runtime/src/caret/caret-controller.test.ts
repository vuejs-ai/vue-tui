import { shallowRef, watch, type ShallowRef } from "vue";
import { describe, expect, test, vi } from "vite-plus/test";
import type {
  InternalFocusTargetDependent,
  InternalFocusTargetHandle,
} from "../focus/focus-controller.ts";
import { createBox, createText, type TuiNode } from "../host/nodes.ts";
import {
  freezeInternalGeometry,
  type InternalElementGeometry,
  type InternalGeometryPaintFrame,
} from "../geometry/geometry-service.ts";
import { createInternalCaretController } from "./caret-controller.ts";

interface FocusFixture {
  readonly effectiveTarget: ShallowRef<InternalFocusTargetHandle | null>;
  readonly controller: Parameters<typeof createInternalCaretController>[0]["focus"];
  create(host?: TuiNode | null): InternalFocusTargetHandle;
  setHost(handle: InternalFocusTargetHandle, host: TuiNode | null): void;
  dispose(handle: InternalFocusTargetHandle): void;
}

function focusFixture(): FocusFixture {
  const effectiveTarget = shallowRef<InternalFocusTargetHandle | null>(null);
  const records = new Map<
    InternalFocusTargetHandle,
    { host: TuiNode | null; dependents: Set<InternalFocusTargetDependent>; disposed: boolean }
  >();
  return {
    effectiveTarget,
    controller: {
      effectiveTarget,
      registerTargetDependent(handle, dependent) {
        const record = records.get(handle);
        if (!record || record.disposed) {
          throw new Error("Focus target belongs to another application or has been disposed");
        }
        record.dependents.add(dependent);
        dependent.hostChanged(record.host);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          record.dependents.delete(dependent);
        };
      },
    },
    create(host = null) {
      const handle: InternalFocusTargetHandle = Object.freeze({
        isFocused: shallowRef(false),
        focus: () => false,
        blur: () => false,
      });
      records.set(handle, { host, dependents: new Set(), disposed: false });
      return handle;
    },
    setHost(handle, host) {
      const record = records.get(handle)!;
      record.host = host;
      for (const dependent of record.dependents) dependent.hostChanged(host);
    },
    dispose(handle) {
      const record = records.get(handle)!;
      record.disposed = true;
      for (const dependent of record.dependents) dependent.disposed();
      record.dependents.clear();
      if (effectiveTarget.value === handle) effectiveTarget.value = null;
    },
  };
}

function connect(parent: TuiNode, child: TuiNode): void {
  if (!("children" in parent)) throw new Error("parent must be a container");
  child.parent = parent;
  (parent.children as TuiNode[]).push(child);
}

const visibleTextGeometry = (surfaceX = 3): InternalElementGeometry =>
  freezeInternalGeometry({
    status: "visible",
    parent: { x: 0, y: 0, width: 2, height: 1 },
    surface: { x: surfaceX, y: 2, width: 2, height: 1 },
    fragments: [
      {
        local: { x: 0, y: 0, width: 2, height: 1 },
        parent: { x: 0, y: 0, width: 2, height: 1 },
        surface: { x: surfaceX, y: 2, width: 2, height: 1 },
        visibleSurface: { x: surfaceX, y: 2, width: 2, height: 1 },
      },
    ],
    caretSlots: [
      { local: { x: 0, y: 0 }, surface: { x: surfaceX, y: 2 }, visible: true },
      { local: { x: 1, y: 0 }, surface: { x: surfaceX + 1, y: 2 }, visible: true },
      { local: { x: 2, y: 0 }, surface: { x: surfaceX + 2, y: 2 }, visible: true },
    ],
  });

function paintFrame(
  values: ReadonlyMap<TuiNode, InternalElementGeometry>,
): InternalGeometryPaintFrame {
  return {
    generation: 1,
    isObserved: (target) => values.has(target),
    hasObservedSubtree: () => true,
    geometryFor(target) {
      const geometry = values.get(target);
      if (!geometry) throw new Error("unobserved");
      return geometry;
    },
    paintOrderFor: () => 0,
    record: () => {},
    recordSubtree: () => {},
    commit: () => {},
    discard: () => {},
  };
}

describe("focus-bound caret controller", () => {
  test("accepts one same-frame Text slot and publishes only after accept", () => {
    const focus = focusFixture();
    const requestPaint = vi.fn();
    const controller = createInternalCaretController({
      focus: focus.controller,
      outputAvailable: true,
      requestPaint,
    });
    const host = createBox();
    const target = createText();
    connect(host, target);
    const handle = focus.create(host);
    const owner = controller.register(handle, { x: 1, y: 0 });
    owner.updateGeometry({ status: "pending" }, target);
    focus.effectiveTarget.value = handle;
    expect(owner.state.value).toEqual({ status: "hidden", reason: "pending" });

    const prepared = controller.prepareFrame(
      paintFrame(new Map([[target, visibleTextGeometry(3)]])),
    );
    expect(prepared.position).toEqual({ x: 4, y: 2 });
    expect(owner.state.value).toEqual({ status: "hidden", reason: "pending" });
    prepared.discard();
    expect(owner.state.value).toEqual({ status: "hidden", reason: "pending" });

    const accepted = controller.prepareFrame(
      paintFrame(new Map([[target, visibleTextGeometry(3)]])),
    );
    owner.updateGeometry(visibleTextGeometry(3), target);
    accepted.accept();
    expect(owner.state.value).toEqual({ status: "visible", surface: { x: 4, y: 2 } });
    expect(controller.writerPosition).toEqual({ x: 4, y: 2 });
    expect(Object.isFrozen(owner.state.value)).toBe(true);
    expect(Object.isFrozen((owner.state.value as { surface: object }).surface)).toBe(true);
  });

  test.each(["clear-position", "dispose-owner"] as const)(
    "keeps the last accepted writer declaration until a hidden %s frame commits",
    (transition) => {
      const focus = focusFixture();
      const controller = createInternalCaretController({
        focus: focus.controller,
        outputAvailable: true,
        requestPaint: vi.fn(),
      });
      const host = createBox();
      const target = createText();
      connect(host, target);
      const handle = focus.create(host);
      const owner = controller.register(handle, { x: 1, y: 0 });
      owner.updateGeometry(visibleTextGeometry(3), target);
      focus.effectiveTarget.value = handle;

      const visible = controller.prepareFrame(
        paintFrame(new Map([[target, visibleTextGeometry(3)]])),
      );
      owner.updateGeometry(visibleTextGeometry(3), target);
      visible.accept();
      expect(controller.writerPosition).toEqual({ x: 4, y: 2 });

      if (transition === "clear-position") owner.updatePosition(null);
      else owner.dispose();
      expect(owner.state.value).toEqual({ status: "inactive" });
      expect(controller.writerPosition).toEqual({ x: 4, y: 2 });

      const discarded = controller.prepareFrame(
        paintFrame(new Map([[target, visibleTextGeometry(3)]])),
      );
      expect(discarded.previousPosition).toEqual({ x: 4, y: 2 });
      expect(discarded.position).toBeUndefined();
      expect(discarded.shouldStage).toBe(true);
      discarded.discard();
      expect(controller.writerPosition).toEqual({ x: 4, y: 2 });

      const hidden = controller.prepareFrame(
        paintFrame(new Map([[target, visibleTextGeometry(3)]])),
      );
      hidden.accept();
      expect(controller.writerPosition).toBeUndefined();
    },
  );

  test("a released output surface cannot be revived by an older active frame", () => {
    const focus = focusFixture();
    const controller = createInternalCaretController({
      focus: focus.controller,
      outputAvailable: true,
      requestPaint: vi.fn(),
    });
    const host = createBox();
    const target = createText();
    connect(host, target);
    const handle = focus.create(host);
    const owner = controller.register(handle, { x: 1, y: 0 });
    owner.updateGeometry(visibleTextGeometry(3), target);
    focus.effectiveTarget.value = handle;

    const visible = controller.prepareFrame(
      paintFrame(new Map([[target, visibleTextGeometry(3)]])),
    );
    owner.updateGeometry(visibleTextGeometry(3), target);
    visible.accept();
    expect(controller.writerPosition).toEqual({ x: 4, y: 2 });

    const stale = controller.prepareFrame(paintFrame(new Map([[target, visibleTextGeometry(7)]])));
    let writerPositionWhenUnavailable: unknown = "not-observed";
    const stop = watch(
      owner.state,
      (state) => {
        if (state.status === "unavailable") {
          writerPositionWhenUnavailable = controller.writerPosition;
        }
      },
      { flush: "sync" },
    );

    controller.setOutputAvailable(false, { surfaceReleased: true });
    expect(writerPositionWhenUnavailable).toBeUndefined();
    expect(controller.writerPosition).toBeUndefined();
    expect(owner.state.value).toEqual({ status: "unavailable" });

    stale.accept();
    expect(controller.writerPosition).toBeUndefined();
    expect(owner.state.value).toEqual({ status: "unavailable" });
    stop();
  });

  test("arbitrates by exact focus identity and removing another owner cannot clear selection", () => {
    const focus = focusFixture();
    const controller = createInternalCaretController({
      focus: focus.controller,
      outputAvailable: true,
      requestPaint: vi.fn(),
    });
    const hostA = createBox();
    const hostB = createBox();
    const targetA = createText();
    const targetB = createText();
    connect(hostA, targetA);
    connect(hostB, targetB);
    const focusA = focus.create(hostA);
    const focusB = focus.create(hostB);
    const ownerA = controller.register(focusA, { x: 0, y: 0 });
    const ownerB = controller.register(focusB, { x: 1, y: 0 });
    ownerA.updateGeometry(visibleTextGeometry(1), targetA);
    ownerB.updateGeometry(visibleTextGeometry(8), targetB);

    focus.effectiveTarget.value = focusB;
    const prepared = controller.prepareFrame(
      paintFrame(
        new Map([
          [targetA, visibleTextGeometry(1)],
          [targetB, visibleTextGeometry(8)],
        ]),
      ),
    );
    ownerB.updateGeometry(visibleTextGeometry(8), targetB);
    prepared.accept();
    expect(controller.writerPosition).toEqual({ x: 9, y: 2 });
    expect(ownerA.state.value).toEqual({ status: "inactive" });

    ownerA.dispose();
    expect(controller.writerPosition).toEqual({ x: 9, y: 2 });
    expect(ownerB.state.value).toEqual({ status: "visible", surface: { x: 9, y: 2 } });
  });

  test("rejects foreign, duplicate, and invalid initial ownership before reserving a handle", () => {
    const focus = focusFixture();
    const controller = createInternalCaretController({
      focus: focus.controller,
      outputAvailable: true,
      requestPaint: vi.fn(),
    });
    const handle = focus.create(createBox());
    expect(() => controller.register(handle, { x: -1, y: 0 })).toThrow(TypeError);
    const owner = controller.register(handle, { x: 0, y: 0 });
    expect(() => controller.register(handle, { x: 0, y: 0 })).toThrow(
      "Focus target already has a live caret owner",
    );
    const foreign = Object.freeze({
      isFocused: shallowRef(false),
      focus: () => false,
      blur: () => false,
    }) as InternalFocusTargetHandle;
    expect(() => controller.register(foreign, { x: 0, y: 0 })).toThrow(
      "Focus target belongs to another application or has been disposed",
    );
    owner.dispose();
    expect(() => controller.register(handle, { x: 0, y: 0 })).not.toThrow();
  });

  test("focus disposal releases the reservation and leaves retained state inactive", () => {
    const focus = focusFixture();
    const controller = createInternalCaretController({
      focus: focus.controller,
      outputAvailable: true,
      requestPaint: vi.fn(),
    });
    const handle = focus.create(createBox());
    const owner = controller.register(handle, null);
    focus.dispose(handle);
    expect(owner.state.value).toEqual({ status: "inactive" });
    expect(Object.isFrozen(owner.state.value)).toBe(true);
    owner.dispose();
  });

  test("later invalid positions fail closed and a later valid point can recover", () => {
    const focus = focusFixture();
    const controller = createInternalCaretController({
      focus: focus.controller,
      outputAvailable: true,
      requestPaint: vi.fn(),
    });
    const host = createBox();
    const target = createText();
    connect(host, target);
    const handle = focus.create(host);
    const owner = controller.register(handle, { x: 0, y: 0 });
    owner.updateGeometry(visibleTextGeometry(), target);
    focus.effectiveTarget.value = handle;

    owner.updatePosition({ x: Number.NaN, y: 0 });
    expect(owner.state.value).toEqual({ status: "hidden", reason: "invalid-position" });
    expect(controller.writerPosition).toBeUndefined();

    owner.updatePosition({ x: 2, y: 0 });
    expect(owner.state.value).toEqual({ status: "hidden", reason: "pending" });
    const prepared = controller.prepareFrame(
      paintFrame(new Map([[target, visibleTextGeometry()]])),
    );
    owner.updateGeometry(visibleTextGeometry(), target);
    prepared.accept();
    expect(owner.state.value).toEqual({ status: "visible", surface: { x: 5, y: 2 } });
  });

  test("distinguishes output unavailability, geometry reasons, relation, clipping, and outside", () => {
    const focus = focusFixture();
    const controller = createInternalCaretController({
      focus: focus.controller,
      outputAvailable: false,
      requestPaint: vi.fn(),
    });
    const host = createBox();
    const target = createText();
    connect(host, target);
    const handle = focus.create(host);
    const owner = controller.register(handle, { x: 0, y: 0 });
    focus.effectiveTarget.value = handle;
    owner.updateGeometry({ status: "unavailable" }, target);
    expect(owner.state.value).toEqual({ status: "unavailable" });

    controller.setOutputAvailable(true);
    expect(owner.state.value).toEqual({ status: "hidden", reason: "unavailable" });
    owner.updateGeometry({ status: "detached" }, null);
    expect(owner.state.value).toEqual({ status: "hidden", reason: "detached" });
    owner.updateGeometry({ status: "hidden" }, target);
    expect(owner.state.value).toEqual({ status: "hidden", reason: "hidden" });
    owner.updateGeometry(
      freezeInternalGeometry({
        status: "fully-clipped",
        parent: { x: 0, y: 0, width: 2, height: 1 },
        surface: { x: 3, y: 2, width: 2, height: 1 },
        fragments: [],
        caretSlots: [],
      }),
      target,
    );
    expect(owner.state.value).toEqual({ status: "hidden", reason: "clipped" });

    const sibling = createText();
    owner.updateGeometry(visibleTextGeometry(), sibling);
    const unrelated = controller.prepareFrame(
      paintFrame(new Map([[sibling, visibleTextGeometry()]])),
    );
    owner.updateGeometry(visibleTextGeometry(), sibling);
    unrelated.accept();
    expect(owner.state.value).toEqual({ status: "hidden", reason: "unrelated" });
    focus.setHost(handle, sibling);
    expect(owner.state.value).toEqual({ status: "hidden", reason: "pending" });
    owner.updatePosition({ x: 99, y: 0 });
    const prepared = controller.prepareFrame(
      paintFrame(new Map([[sibling, visibleTextGeometry()]])),
    );
    owner.updateGeometry(visibleTextGeometry(), sibling);
    prepared.accept();
    expect(owner.state.value).toEqual({ status: "hidden", reason: "outside" });
  });

  test("maps positive Box cells affinely without accepting its trailing or zero-size cells", () => {
    const focus = focusFixture();
    const controller = createInternalCaretController({
      focus: focus.controller,
      outputAvailable: true,
      requestPaint: vi.fn(),
    });
    const box = createBox();
    const handle = focus.create(box);
    const owner = controller.register(handle, { x: 1, y: 1 });
    const boxGeometry = freezeInternalGeometry({
      status: "visible",
      parent: { x: 0, y: 0, width: 3, height: 2 },
      surface: { x: 4, y: 5, width: 3, height: 2 },
      fragments: [
        {
          local: { x: 0, y: 0, width: 3, height: 2 },
          parent: { x: 0, y: 0, width: 3, height: 2 },
          surface: { x: 4, y: 5, width: 3, height: 2 },
          visibleSurface: { x: 4, y: 5, width: 3, height: 2 },
        },
      ],
      caretSlots: [],
    });
    owner.updateGeometry(boxGeometry, box);
    focus.effectiveTarget.value = handle;
    const prepared = controller.prepareFrame(paintFrame(new Map([[box, boxGeometry]])));
    owner.updateGeometry(boxGeometry, box);
    prepared.accept();
    expect(owner.state.value).toEqual({ status: "visible", surface: { x: 5, y: 6 } });

    owner.updatePosition({ x: 3, y: 1 });
    const outside = controller.prepareFrame(paintFrame(new Map([[box, boxGeometry]])));
    owner.updateGeometry(boxGeometry, box);
    outside.accept();
    expect(owner.state.value).toEqual({ status: "hidden", reason: "outside" });
  });
});
