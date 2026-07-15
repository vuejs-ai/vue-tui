import Yoga from "yoga-layout";
import { describe, expect, test } from "vite-plus/test";
import type { AppContext } from "../context.ts";
import { calculateLayoutWithContentGuards } from "../host/layout-guards.ts";
import { buildNodeOps } from "../host/node-ops.ts";
import {
  createRoot,
  type TuiBox,
  type TuiNode,
  type TuiText,
  type TuiVirtualText,
} from "../host/nodes.ts";
import { attachYoga } from "../host/yoga.ts";
import { paint } from "../paint/paint.ts";
import { createRenderedTargetController } from "../rendered-target.ts";
import {
  createInternalGeometryService,
  type InternalCellRect,
  type InternalElementGeometry,
} from "./geometry-service.ts";

const ops = buildNodeOps({ onCommit: () => {} });

function fixture(width = 12) {
  const root = createRoot({} as AppContext);
  attachYoga(root);
  root.yoga.setWidth(width);
  return {
    root,
    box(): TuiBox {
      return ops.createElement("tui-box") as TuiBox;
    },
    text(): TuiText {
      return ops.createElement("tui-text") as TuiText;
    },
    virtualText(): TuiVirtualText {
      return ops.createElement("tui-virtual-text") as TuiVirtualText;
    },
    insert(parent: TuiNode, child: TuiNode) {
      ops.insert(child, parent, null);
    },
    prop(node: TuiNode, name: string, value: unknown) {
      ops.patchProp(node, name, undefined, value);
    },
    leaf(parent: TuiNode, value: string) {
      ops.insert(ops.createText(value), parent, null);
    },
  };
}

function layoutAndPaint(
  root: ReturnType<typeof createRoot>,
  geometry: ReturnType<typeof createInternalGeometryService>,
  viewport = { width: 12, height: 8 },
): string {
  const restore = calculateLayoutWithContentGuards(
    root,
    viewport.width,
    undefined,
    Yoga.DIRECTION_LTR,
  );
  const frame = geometry.beginFrame();
  try {
    const output = paint(root, { geometry: frame, viewport });
    frame.commit();
    return output;
  } catch (error) {
    frame.discard();
    throw error;
  } finally {
    restore();
  }
}

function resolved(geometry: InternalElementGeometry) {
  if (
    geometry.status === "unavailable" ||
    geometry.status === "detached" ||
    geometry.status === "pending" ||
    geometry.status === "hidden"
  ) {
    throw new Error(`expected resolved geometry, received ${geometry.status}`);
  }
  return geometry;
}

describe("private paint-derived geometry service", () => {
  test("exposes the staged paint result without publishing or advancing the generation", () => {
    const f = fixture();
    const target = f.box();
    f.prop(target, "width", 3);
    f.prop(target, "height", 1);
    f.insert(f.root, target);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);

    const restore = calculateLayoutWithContentGuards(f.root, 12, undefined, Yoga.DIRECTION_LTR);
    const frame = service.beginFrame();
    try {
      paint(f.root, { geometry: frame, viewport: { width: 12, height: 8 } });
      expect(frame.geometryFor(target)).toMatchObject({
        status: "visible",
        surface: { x: 0, y: 0, width: 3, height: 1 },
      });
      expect(binding.geometry.value).toEqual({ status: "pending" });
      expect(service.generation).toBe(0);
      frame.discard();
      expect(binding.geometry.value).toEqual({ status: "pending" });
      expect(service.generation).toBe(0);
    } finally {
      restore();
    }

    const committedRestore = calculateLayoutWithContentGuards(
      f.root,
      12,
      undefined,
      Yoga.DIRECTION_LTR,
    );
    const committedFrame = service.beginFrame();
    try {
      paint(f.root, { geometry: committedFrame, viewport: { width: 12, height: 8 } });
      const staged = committedFrame.geometryFor(target);
      committedFrame.commit();
      expect(binding.geometry.value).toBe(staged);
      expect(service.generation).toBe(1);
    } finally {
      committedRestore();
    }
  });

  test("rejects staged geometry reads for targets outside the frame demand snapshot", () => {
    const f = fixture();
    const observed = f.box();
    const unobserved = f.box();
    f.insert(f.root, observed);
    f.insert(f.root, unobserved);
    const service = createInternalGeometryService(f.root);
    service.createBinding().attach(observed);
    const frame = service.beginFrame();

    expect(() => frame.geometryFor(unobserved)).toThrow(
      "geometry target was not observed when this paint frame began",
    );
    frame.discard();
  });

  test("captures only observed targets and the ancestor paths needed to reach them", () => {
    const f = fixture();
    const parent = f.box();
    const sibling = f.text();
    const top = f.text();
    const target = f.virtualText();
    f.leaf(sibling, "unobserved");
    f.leaf(target, "observed");
    f.insert(top, target);
    f.insert(parent, sibling);
    f.insert(parent, top);
    f.insert(f.root, parent);
    const service = createInternalGeometryService(f.root);

    const emptyFrame = service.beginFrame();
    expect(emptyFrame.hasObservedSubtree(f.root)).toBe(false);
    expect(emptyFrame.isObserved(target)).toBe(false);
    emptyFrame.discard();

    const binding = service.createBinding();
    binding.attach(target);
    const frame = service.beginFrame();
    expect(frame.isObserved(target)).toBe(true);
    expect(frame.isObserved(top)).toBe(false);
    expect(frame.hasObservedSubtree(f.root)).toBe(true);
    expect(frame.hasObservedSubtree(parent)).toBe(true);
    expect(frame.hasObservedSubtree(top)).toBe(true);
    expect(frame.hasObservedSubtree(target)).toBe(true);
    expect(frame.hasObservedSubtree(sibling)).toBe(false);
    frame.discard();
  });

  test("lets pointer-only top-level Text use rect geometry while preserving full consumers", () => {
    const f = fixture();
    const top = f.text();
    const nested = f.virtualText();
    f.leaf(nested, "nested");
    f.insert(top, nested);
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);

    const rect = service.createBinding({ textGeometry: "rect" });
    rect.attach(top);
    let frame = service.beginFrame();
    expect(frame.requiresTextGeometry(top)).toBe(false);
    frame.discard();

    const full = service.createBinding();
    full.attach(top);
    frame = service.beginFrame();
    expect(frame.requiresTextGeometry(top)).toBe(true);
    frame.discard();
    full.dispose();

    const nestedRect = service.createBinding({ textGeometry: "rect" });
    nestedRect.attach(nested);
    frame = service.beginFrame();
    expect(frame.requiresTextGeometry(top)).toBe(true);
    frame.discard();

    nestedRect.dispose();
    rect.dispose();
    service.dispose();
  });

  test("publishes one frozen Box snapshot with parent, surface, and visible mapping", () => {
    const f = fixture();
    const parent = f.box();
    const target = f.box();
    f.prop(parent, "width", 8);
    f.prop(parent, "height", 3);
    f.prop(parent, "marginLeft", 2);
    f.prop(target, "width", 4);
    f.prop(target, "height", 2);
    f.prop(target, "marginLeft", 1);
    f.insert(f.root, parent);
    f.insert(parent, target);

    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);
    expect(binding.geometry.value).toEqual({ status: "pending" });

    layoutAndPaint(f.root, service);
    const value = resolved(binding.geometry.value);
    expect(value).toMatchObject({
      status: "visible",
      parent: { x: 1, y: 0, width: 4, height: 2 },
      surface: { x: 3, y: 0, width: 4, height: 2 },
      fragments: [
        {
          local: { x: 0, y: 0, width: 4, height: 2 },
          parent: { x: 1, y: 0, width: 4, height: 2 },
          surface: { x: 3, y: 0, width: 4, height: 2 },
          visibleSurface: { x: 3, y: 0, width: 4, height: 2 },
        },
      ],
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.fragments)).toBe(true);
    expect(Object.isFrozen(value.fragments[0]!.surface)).toBe(true);
  });

  test("maps nested Text from one full wrap, including word movement and legal CJK slots", () => {
    const f = fixture(6);
    const top = f.text();
    const target = f.virtualText();
    f.prop(top, "width", 5);
    f.leaf(top, "ab");
    f.leaf(target, "C中DE");
    f.insert(top, target);
    f.insert(f.root, top);

    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);
    expect(layoutAndPaint(f.root, service, { width: 5, height: 4 })).toBe("abC中\nDE\n\n");

    let value = resolved(binding.geometry.value);
    expect(value.fragments).toMatchObject([
      {
        local: { x: 0, y: 0, width: 3, height: 1 },
        surface: { x: 2, y: 0, width: 3, height: 1 },
      },
      {
        local: { x: 0, y: 1, width: 2, height: 1 },
        surface: { x: 0, y: 1, width: 2, height: 1 },
      },
    ]);
    expect(value.caretSlots?.map((slot) => slot.local)).toContainEqual({ x: 1, y: 0 });
    expect(value.caretSlots?.map((slot) => slot.local)).not.toContainEqual({ x: 2, y: 0 });
    expect(value.caretSlots?.map((slot) => slot.local)).toContainEqual({ x: 3, y: 0 });

    const prefix = top.children[0]!;
    const content = target.children[0]!;
    ops.setText(prefix, "hello ");
    ops.setText(content, "world");
    f.prop(top, "width", 6);
    layoutAndPaint(f.root, service, { width: 6, height: 4 });
    value = resolved(binding.geometry.value);
    expect(value.fragments).toHaveLength(1);
    expect(value.fragments[0]).toMatchObject({
      local: { x: 0, y: 0, width: 5, height: 1 },
      surface: { x: 0, y: 1, width: 5, height: 1 },
    });
  });

  test("keeps explicit newline rows and does not invent a target row at a sibling wrap", () => {
    const f = fixture(6);
    const top = f.text();
    const target = f.virtualText();
    f.prop(top, "width", 6);
    f.leaf(top, "ab");
    f.leaf(target, "C\nDE");
    f.insert(top, target);
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);
    layoutAndPaint(f.root, service, { width: 6, height: 3 });
    let value = resolved(binding.geometry.value);
    expect(value.fragments).toMatchObject([
      { local: { x: 0, y: 0, width: 1 }, surface: { x: 2, y: 0, width: 1 } },
      { local: { x: 0, y: 1, width: 2 }, surface: { x: 0, y: 1, width: 2 } },
    ]);
    expect(value.caretSlots).toContainEqual({
      local: { x: 2, y: 1 },
      surface: { x: 2, y: 1 },
      visible: true,
    });

    ops.setText(top.children[0]!, "A");
    ops.setText(target.children[0]!, "BCDE");
    f.leaf(top, "F");
    f.prop(top, "width", 5);
    layoutAndPaint(f.root, service, { width: 5, height: 3 });
    value = resolved(binding.geometry.value);
    expect(value.fragments).toHaveLength(1);
    expect(value.caretSlots?.some((slot) => slot.local.y === 1)).toBe(false);
  });

  test("preserves leading and consecutive empty rows inside nested Text", () => {
    const f = fixture(4);
    const top = f.text();
    const target = f.virtualText();
    f.leaf(target, "\n\nB");
    f.insert(top, target);
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);
    layoutAndPaint(f.root, service, { width: 4, height: 4 });
    const value = resolved(binding.geometry.value);
    expect(value.fragments[0]).toMatchObject({
      local: { x: 0, y: 2, width: 1 },
      surface: { x: 0, y: 2, width: 1 },
    });
    expect(value.caretSlots).toContainEqual({
      local: { x: 0, y: 0 },
      surface: { x: 0, y: 0 },
      visible: true,
    });
    expect(value.caretSlots).toContainEqual({
      local: { x: 0, y: 1 },
      surface: { x: 0, y: 1 },
      visible: true,
    });
  });

  test("maps an empty nested Text at the exact parent trailing boundary", () => {
    const f = fixture(6);
    const top = f.text();
    const target = f.virtualText();
    f.leaf(top, "abcd");
    f.insert(top, target);
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);
    layoutAndPaint(f.root, service, { width: 6, height: 2 });
    const value = resolved(binding.geometry.value);
    expect(value).toMatchObject({
      status: "zero-size",
      parent: { x: 4, y: 0, width: 0, height: 0 },
      surface: { x: 4, y: 0, width: 0, height: 0 },
      caretSlots: [{ local: { x: 0, y: 0 }, surface: { x: 4, y: 0 }, visible: true }],
    });
  });

  test("uses rendered cells for top-level truncation and rejects nested synthetic provenance", () => {
    const f = fixture(5);
    const top = f.text();
    const target = f.virtualText();
    f.prop(top, "width", 5);
    f.prop(top, "wrap", "truncate-middle");
    f.leaf(target, "ABCDEFGHI");
    f.insert(top, target);
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);
    const topBinding = service.createBinding();
    const nestedBinding = service.createBinding();
    topBinding.attach(top);
    nestedBinding.attach(target);
    layoutAndPaint(f.root, service, { width: 5, height: 2 });
    const topValue = resolved(topBinding.geometry.value);
    expect(topValue.caretSlots?.at(-1)).toEqual({
      local: { x: 5, y: 0 },
      surface: { x: 5, y: 0 },
      visible: false,
    });
    expect(nestedBinding.geometry.value).toEqual({ status: "unavailable" });
  });

  test("preserves leading wrap rows and painted extents when Yoga width is narrower than a glyph", () => {
    const f = fixture(4);
    const top = f.text();
    f.prop(top, "width", 1);
    f.leaf(top, "中A");
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(top);
    layoutAndPaint(f.root, service, { width: 4, height: 4 });
    let value = resolved(binding.geometry.value);
    expect(value.status).toBe("visible");
    expect(value.parent).toEqual({ x: 0, y: 0, width: 2, height: 3 });
    expect(value.surface).toEqual({ x: 0, y: 0, width: 2, height: 3 });
    expect(value.fragments).toMatchObject([
      {
        local: { x: 0, y: 0, width: 1, height: 3 },
        parent: { x: 0, y: 0, width: 1, height: 3 },
        surface: { x: 0, y: 0, width: 1, height: 3 },
      },
      {
        local: { x: 1, y: 1, width: 1, height: 1 },
        parent: { x: 1, y: 1, width: 1, height: 1 },
        surface: { x: 1, y: 1, width: 1, height: 1 },
      },
    ]);
    expect(
      value.fragments.some((fragment) => fragment.surface.x === 1 && fragment.surface.y !== 1),
    ).toBe(false);
    expect(value.caretSlots).toContainEqual({
      local: { x: 0, y: 0 },
      surface: { x: 0, y: 0 },
      visible: true,
    });

    f.prop(top, "width", 0);
    ops.setText(top.children[0]!, "AB");
    layoutAndPaint(f.root, service, { width: 4, height: 4 });
    value = resolved(binding.geometry.value);
    expect(value.surface).toEqual({ x: 0, y: 0, width: 1, height: 3 });
    expect(value.caretSlots?.map((slot) => slot.local.y)).toEqual(
      expect.arrayContaining([0, 1, 2]),
    );
  });

  test("does not split a grapheme across Text ownership boundaries or invent zero-width cells", () => {
    const f = fixture(10);
    const top = f.text();
    const combining = f.virtualText();
    f.leaf(top, "e");
    f.leaf(combining, "\u0301");
    f.insert(top, combining);
    f.leaf(top, "X");
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);
    const topBinding = service.createBinding();
    const nestedBinding = service.createBinding();
    topBinding.attach(top);
    nestedBinding.attach(combining);
    layoutAndPaint(f.root, service, { width: 10, height: 2 });
    expect(nestedBinding.geometry.value).toEqual({ status: "unavailable" });
    const topValue = resolved(topBinding.geometry.value);
    expect(topValue.caretSlots?.at(-1)).toMatchObject({
      local: { x: 2, y: 0 },
      surface: { x: 2, y: 0 },
    });

    const zeroOnly = f.virtualText();
    f.leaf(zeroOnly, "\u200b");
    f.insert(top, zeroOnly);
    const zeroBinding = service.createBinding();
    zeroBinding.attach(zeroOnly);
    layoutAndPaint(f.root, service, { width: 10, height: 2 });
    const zero = resolved(zeroBinding.geometry.value);
    expect(zero.status).toBe("zero-size");
    expect(zero.fragments).toEqual([]);
    expect(zero.caretSlots).toEqual([]);
  });

  test("does not create a top-level caret slot for non-empty zero-width-only text", () => {
    const f = fixture(4);
    const top = f.text();
    f.prop(top, "width", 0);
    f.leaf(top, "\u200b");
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(top);
    layoutAndPaint(f.root, service, { width: 4, height: 2 });
    const value = resolved(binding.geometry.value);
    expect(value.status).toBe("zero-size");
    expect(value.fragments).toEqual([]);
    expect(value.caretSlots).toEqual([]);
  });

  test("does not expose a visible slot at the start of a wide glyph dropped by clipping", () => {
    const f = fixture(8);
    const clip = f.box();
    const target = f.text();
    f.prop(clip, "width", 4);
    f.prop(clip, "height", 1);
    f.prop(clip, "overflow", "hidden");
    f.prop(target, "width", 2);
    f.prop(target, "flexShrink", 0);
    f.prop(target, "marginLeft", 3);
    f.leaf(target, "中");
    f.insert(clip, target);
    f.insert(f.root, clip);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);

    layoutAndPaint(f.root, service, { width: 8, height: 2 });
    const value = resolved(binding.geometry.value);
    expect(value.caretSlots).toContainEqual({
      local: { x: 0, y: 0 },
      surface: { x: 3, y: 0 },
      visible: false,
    });
    expect(value.caretSlots?.map((slot) => slot.local)).not.toContainEqual({ x: 1, y: 0 });
  });

  test("does not invent an empty Text insertion origin inside a grapheme", () => {
    const f = fixture(10);
    const top = f.text();
    const target = f.virtualText();
    f.leaf(top, "e");
    f.insert(top, target);
    f.leaf(top, "\u0301X");
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);
    layoutAndPaint(f.root, service, { width: 10, height: 2 });
    expect(binding.geometry.value).toEqual({ status: "unavailable" });
  });

  test("keeps full bounds while clipping and distinguishes authored hidden state", () => {
    const f = fixture(8);
    const clip = f.box();
    const target = f.box();
    f.prop(clip, "width", 4);
    f.prop(clip, "height", 1);
    f.prop(clip, "overflow", "hidden");
    f.prop(target, "width", 3);
    f.prop(target, "height", 1);
    f.prop(target, "marginLeft", 3);
    f.prop(target, "flexShrink", 0);
    f.insert(f.root, clip);
    f.insert(clip, target);

    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);
    layoutAndPaint(f.root, service, { width: 8, height: 2 });
    let value = resolved(binding.geometry.value);
    expect(value.status).toBe("visible");
    expect(value.surface).toEqual({ x: 3, y: 0, width: 3, height: 1 });
    expect(value.fragments[0]!.visibleSurface).toEqual({ x: 3, y: 0, width: 1, height: 1 });

    f.prop(target, "marginLeft", 4);
    layoutAndPaint(f.root, service, { width: 8, height: 2 });
    value = resolved(binding.geometry.value);
    expect(value.status).toBe("fully-clipped");
    expect(value.surface).toEqual({ x: 4, y: 0, width: 3, height: 1 });
    expect(value.fragments[0]!.visibleSurface).toBeNull();

    f.prop(target, "display", "none");
    layoutAndPaint(f.root, service, { width: 8, height: 2 });
    expect(binding.geometry.value).toEqual({ status: "hidden" });
  });

  test("discards failed frames and publishes surface transitions without stale geometry", () => {
    const f = fixture();
    const target = f.box();
    f.insert(f.root, target);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);
    const rect: InternalCellRect = { x: 0, y: 0, width: 2, height: 1 };
    const draft = service.beginFrame();
    draft.record(target, {
      status: "visible",
      parent: rect,
      surface: rect,
      fragments: [{ local: rect, parent: rect, surface: rect, visibleSurface: rect }],
      caretSlots: [],
    });
    draft.discard();
    expect(binding.geometry.value).toEqual({ status: "pending" });
    expect(service.generation).toBe(0);

    const committed = service.beginFrame();
    committed.record(target, {
      status: "visible",
      parent: rect,
      surface: rect,
      fragments: [{ local: rect, parent: rect, surface: rect, visibleSurface: rect }],
      caretSlots: [],
    });
    committed.commit();
    expect(service.generation).toBe(1);
    const first = binding.geometry.value;

    service.setSurfaceAvailable(false);
    expect(binding.geometry.value).toEqual({ status: "unavailable" });
    service.setSurfaceAvailable(true);
    expect(binding.geometry.value).toEqual({ status: "pending" });
    expect(first).toMatchObject({ status: "visible", surface: rect });
    expect(Object.isFrozen(first)).toBe(true);
  });

  test("publishes resize generations atomically and drops a later failed paint draft", () => {
    const f = fixture(10);
    const target = f.box();
    f.prop(target, "width", "50%");
    f.prop(target, "height", 1);
    f.insert(f.root, target);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);

    layoutAndPaint(f.root, service, { width: 10, height: 3 });
    const first = resolved(binding.geometry.value);
    expect(first.surface.width).toBe(5);
    expect(service.generation).toBe(1);

    f.root.yoga.setWidth(6);
    layoutAndPaint(f.root, service, { width: 6, height: 3 });
    const second = resolved(binding.geometry.value);
    expect(second.surface.width).toBe(3);
    expect(service.generation).toBe(2);
    expect(first.surface.width).toBe(5);

    const transform = ops.createElement("tui-transform");
    ops.patchProp(transform, "transform", undefined, () => {
      throw new Error("paint failed after collecting the target");
    });
    f.leaf(transform, "boom");
    f.insert(f.root, transform);
    const restore = calculateLayoutWithContentGuards(f.root, 6, undefined, Yoga.DIRECTION_LTR);
    const failed = service.beginFrame();
    expect(() => paint(f.root, { geometry: failed, viewport: { width: 6, height: 3 } })).toThrow(
      "paint failed after collecting the target",
    );
    failed.discard();
    restore();
    expect(service.generation).toBe(2);
    expect(binding.geometry.value).toBe(second);
  });

  test("F2 retargeting publishes one pending state and invalidation detaches synchronously", () => {
    const f = fixture();
    const first = f.box();
    const second = f.box();
    f.prop(first, "width", 2);
    f.prop(first, "height", 1);
    f.prop(second, "width", 2);
    f.prop(second, "height", 1);
    f.insert(f.root, first);
    f.insert(f.root, second);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    let target: TuiNode | null = first;
    const renderedTargets = createRenderedTargetController(f.root, service);
    renderedTargets.register(
      () => target,
      (node) => binding.attach(node),
    );
    renderedTargets.reconcile();
    expect(binding.geometry.value).toEqual({ status: "pending" });
    layoutAndPaint(f.root, service);
    expect(binding.geometry.value.status).toBe("visible");

    target = second;
    renderedTargets.reconcile();
    expect(binding.geometry.value).toEqual({ status: "pending" });
    renderedTargets.invalidateSubtree(second);
    expect(binding.geometry.value).toEqual({ status: "detached" });
  });

  test("makes descendant Text provenance unavailable across arbitrary Transform", () => {
    const f = fixture(8);
    const top = f.text();
    const transform = ops.createElement("tui-transform");
    const target = f.virtualText();
    f.leaf(target, "value");
    f.insert(transform, target);
    f.insert(top, transform);
    f.insert(f.root, top);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);

    layoutAndPaint(f.root, service, { width: 8, height: 2 });
    expect(binding.geometry.value).toEqual({ status: "unavailable" });
    service.invalidateSurface();
    expect(binding.geometry.value).toEqual({ status: "unavailable" });
  });

  test("makes a Yoga Text target unavailable when an ancestor Transform rewrites it", () => {
    const f = fixture(8);
    const transform = ops.createElement("tui-transform");
    ops.patchProp(transform, "transform", undefined, () => "");
    const target = f.text();
    f.leaf(target, "deleted");
    f.insert(transform, target);
    f.insert(f.root, transform);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);

    layoutAndPaint(f.root, service, { width: 8, height: 2 });
    expect(binding.geometry.value).toEqual({ status: "unavailable" });
  });

  test("settles a flow child suppressed by a zero-content guard with its parent origin", () => {
    const f = fixture(8);
    const zero = f.box();
    const target = f.box();
    f.prop(zero, "marginLeft", 3);
    f.prop(zero, "width", 0);
    f.prop(zero, "height", 1);
    f.prop(target, "width", 4);
    f.prop(target, "height", 1);
    f.insert(f.root, zero);
    f.insert(zero, target);
    const service = createInternalGeometryService(f.root);
    const binding = service.createBinding();
    binding.attach(target);

    layoutAndPaint(f.root, service, { width: 8, height: 2 });
    expect(binding.geometry.value).toMatchObject({
      status: "zero-size",
      surface: { x: 3, y: 0, width: 0, height: 0 },
    });
  });

  test("keeps authored hidden and Static unavailable precedence under zero-content guards", () => {
    const f = fixture(8);
    const zero = f.box();
    const hidden = f.box();
    const stat = ops.createElement("tui-static");
    f.prop(zero, "width", 0);
    f.prop(zero, "height", 1);
    f.prop(hidden, "display", "none");
    f.insert(f.root, zero);
    f.insert(zero, hidden);
    f.insert(zero, stat);
    const service = createInternalGeometryService(f.root);
    const hiddenBinding = service.createBinding();
    const staticBinding = service.createBinding();
    hiddenBinding.attach(hidden);
    staticBinding.attach(stat);

    layoutAndPaint(f.root, service, { width: 8, height: 2 });
    expect(hiddenBinding.geometry.value).toEqual({ status: "hidden" });
    expect(staticBinding.geometry.value).toEqual({ status: "unavailable" });
  });
});
