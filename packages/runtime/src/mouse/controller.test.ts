import { shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import type { SgrMouseMode, StdinContext } from "../context.ts";
import type {
  InternalElementGeometry,
  InternalGeometryBinding,
  InternalGeometryPaintFrame,
  InternalGeometryService,
} from "../geometry/geometry-service.ts";
import type { TuiNode } from "../host/nodes.ts";
import { createFullscreenMouseController } from "./controller.ts";

interface HarnessOptions {
  readonly onAcquireSgrMouseMode?: (level: SgrMouseMode) => void;
  readonly onReleaseSgrMouseMode?: (level: SgrMouseMode | undefined) => void;
  readonly onReportError?: (error: unknown) => void;
}

function createHarness(options: HarnessOptions = {}) {
  const node = { type: "tui-box", parent: null } as unknown as TuiNode;
  const observed = new Set<TuiNode>();
  const transitions: string[] = [];
  const mouseLevels = new Map<symbol, SgrMouseMode>();
  const geometry: InternalGeometryService = {
    generation: 0,
    createBinding(): InternalGeometryBinding {
      const value = shallowRef<InternalElementGeometry>({ status: "detached" });
      let target: TuiNode | null = null;
      return {
        geometry: value,
        observe() {
          return () => {};
        },
        attach(nextTarget) {
          target = nextTarget;
          observed.add(nextTarget);
          return () => {
            if (target !== nextTarget) return;
            target = null;
            observed.delete(nextTarget);
          };
        },
        dispose() {
          if (target) observed.delete(target);
          target = null;
        },
      };
    },
    beginFrame() {
      throw new Error("not used by this controller test");
    },
    setSurfaceAvailable() {},
    invalidateSurface() {},
    transaction(_kind, change) {
      change();
    },
    beforeInvalidateSubtree() {},
    dispose() {},
  };
  const stdin = {
    acquireRawMode() {
      transitions.push("raw:on");
    },
    releaseRawMode() {
      transitions.push("raw:off");
    },
    acquireSgrMouseMode(level: SgrMouseMode) {
      transitions.push(`mouse:${level}`);
      options.onAcquireSgrMouseMode?.(level);
      const token = Symbol(level);
      mouseLevels.set(token, level);
      return token;
    },
    releaseSgrMouseMode(token: symbol) {
      transitions.push("mouse:none");
      const level = mouseLevels.get(token);
      // StdinController consumes the logical token before reconciling the
      // physical terminal mode, so a later throw does not return that token to
      // this higher-level owner.
      mouseLevels.delete(token);
      options.onReleaseSgrMouseMode?.(level);
    },
  } as unknown as StdinContext;
  const controller = createFullscreenMouseController({
    stdin,
    geometry,
    protocolAvailable: true,
    requestPaint() {},
    reportError(error) {
      if (options.onReportError) {
        options.onReportError(error);
        return;
      }
      throw error;
    },
  });
  const visible: InternalElementGeometry = Object.freeze({
    status: "visible",
    parent: Object.freeze({ x: 0, y: 0, width: 4, height: 1 }),
    surface: Object.freeze({ x: 0, y: 0, width: 4, height: 1 }),
    fragments: Object.freeze([
      Object.freeze({
        local: Object.freeze({ x: 0, y: 0, width: 4, height: 1 }),
        parent: Object.freeze({ x: 0, y: 0, width: 4, height: 1 }),
        surface: Object.freeze({ x: 0, y: 0, width: 4, height: 1 }),
        visibleSurface: Object.freeze({ x: 0, y: 0, width: 4, height: 1 }),
      }),
    ]),
    caretSlots: null,
  });
  const frame = (
    generation: number,
    frameGeometry: InternalElementGeometry = visible,
  ): InternalGeometryPaintFrame => ({
    generation,
    isObserved(target) {
      return observed.has(target);
    },
    hasObservedSubtree() {
      return true;
    },
    requiresTextGeometry() {
      return true;
    },
    geometryFor(target) {
      return observed.has(target) ? frameGeometry : { status: "pending" };
    },
    paintOrderFor(target) {
      return observed.has(target) ? 0 : undefined;
    },
    record() {},
    recordSubtree() {},
    commit() {},
    discard() {},
  });
  return { controller, frame, node, transitions };
}

test("visible mouse demand becomes physical only after its prepared frame is accepted", () => {
  const { controller, frame, node, transitions } = createHarness();
  controller.registerEvent(node, "click", () => () => "continue");

  const discarded = controller.prepareFrame(frame(1));
  expect(transitions).toEqual([]);
  discarded.discard();
  expect(transitions).toEqual([]);

  const accepted = controller.prepareFrame(frame(2));
  expect(transitions).toEqual([]);
  accepted.accept();
  expect(transitions).toEqual(["raw:on", "mouse:button"]);

  controller.dispose();
  expect(transitions).toEqual(["raw:on", "mouse:button", "mouse:none", "raw:off"]);
});

test("staging reconciles reporting without publishing the candidate frame", () => {
  const { controller, frame, node, transitions } = createHarness();
  controller.registerEvent(node, "click", () => () => "continue");

  const prepared = controller.prepareFrame(frame(1));
  prepared.stage();

  expect(transitions).toEqual(["raw:on", "mouse:button"]);
  expect(controller.captureInputSnapshot().frame.generation).toBe(0);

  prepared.accept();
  expect(transitions).toEqual(["raw:on", "mouse:button"]);
  expect(controller.captureInputSnapshot().frame.generation).toBe(1);

  controller.dispose();
  expect(transitions).toEqual(["raw:on", "mouse:button", "mouse:none", "raw:off"]);
});

test("discarding a staged frame restores the previously accepted reporting demand", () => {
  const { controller, frame, node, transitions } = createHarness();
  controller.registerEvent(node, "click", () => () => "continue");
  controller.prepareFrame(frame(1)).accept();
  controller.registerDrag(node, () => () => {}, shallowRef(false));

  const prepared = controller.prepareFrame(frame(2));
  prepared.stage();
  expect(transitions).toEqual(["raw:on", "mouse:button", "mouse:drag", "mouse:none"]);

  prepared.discard();
  expect(transitions).toEqual([
    "raw:on",
    "mouse:button",
    "mouse:drag",
    "mouse:none",
    "mouse:button",
    "mouse:none",
  ]);
  expect(controller.captureInputSnapshot().frame.generation).toBe(1);

  controller.dispose();
  expect(transitions).toEqual([
    "raw:on",
    "mouse:button",
    "mouse:drag",
    "mouse:none",
    "mouse:button",
    "mouse:none",
    "mouse:none",
    "raw:off",
  ]);
});

test("an older staged frame cannot roll back a newer reporting claim", () => {
  const { controller, frame, node, transitions } = createHarness();
  controller.registerEvent(node, "click", () => () => "continue");
  const older = controller.prepareFrame(frame(1));
  controller.registerDrag(node, () => () => {}, shallowRef(false));
  const newer = controller.prepareFrame(frame(2));

  older.stage();
  newer.stage();
  older.discard();
  expect(transitions).toEqual(["raw:on", "mouse:button", "mouse:drag", "mouse:none"]);
  expect(controller.captureInputSnapshot().frame.generation).toBe(0);

  newer.accept();
  expect(controller.captureInputSnapshot().frame.generation).toBe(2);
  expect(transitions).toEqual(["raw:on", "mouse:button", "mouse:drag", "mouse:none"]);

  controller.dispose();
  expect(transitions).toEqual([
    "raw:on",
    "mouse:button",
    "mouse:drag",
    "mouse:none",
    "mouse:none",
    "raw:off",
  ]);
});

test("abandoning a staged frame releases its terminal reporting ownership", () => {
  const { controller, frame, node, transitions } = createHarness();
  controller.registerEvent(node, "click", () => () => "continue");
  controller.prepareFrame(frame(1)).accept();
  controller.registerDrag(node, () => () => {}, shallowRef(false));

  const prepared = controller.prepareFrame(frame(2));
  prepared.stage();
  prepared.abandon();

  expect(controller.captureInputSnapshot().frame.generation).toBe(1);
  expect(transitions).toEqual([
    "raw:on",
    "mouse:button",
    "mouse:drag",
    "mouse:none",
    "mouse:none",
    "raw:off",
  ]);

  controller.dispose();
  expect(transitions).toEqual([
    "raw:on",
    "mouse:button",
    "mouse:drag",
    "mouse:none",
    "mouse:none",
    "raw:off",
  ]);
});

test("discarding a failed frame preserves the previously displayed hit geometry", () => {
  const { controller, frame, node } = createHarness();
  const clicks: number[] = [];
  controller.registerEvent(node, "click", () => () => {
    clicks.push(1);
    return "consume";
  });
  controller.prepareFrame(frame(1)).accept();

  const moved: InternalElementGeometry = Object.freeze({
    status: "visible",
    parent: Object.freeze({ x: 8, y: 0, width: 4, height: 1 }),
    surface: Object.freeze({ x: 8, y: 0, width: 4, height: 1 }),
    fragments: Object.freeze([
      Object.freeze({
        local: Object.freeze({ x: 0, y: 0, width: 4, height: 1 }),
        parent: Object.freeze({ x: 8, y: 0, width: 4, height: 1 }),
        surface: Object.freeze({ x: 8, y: 0, width: 4, height: 1 }),
        visibleSurface: Object.freeze({ x: 8, y: 0, width: 4, height: 1 }),
      }),
    ]),
    caretSlots: null,
  });
  controller.prepareFrame(frame(2, moved)).discard();

  const snapshot = controller.captureInputSnapshot();
  controller.handleInput(
    {
      type: "down",
      button: "left",
      x: 1,
      y: 1,
      shift: false,
      meta: false,
      ctrl: false,
    },
    snapshot,
  );
  controller.handleInput(
    {
      type: "up",
      button: "left",
      x: 1,
      y: 1,
      shift: false,
      meta: false,
      ctrl: false,
    },
    snapshot,
  );

  expect(snapshot.frame.generation).toBe(1);
  expect(clicks).toEqual([1]);
  controller.dispose();
});

test.each([
  [
    "throwing",
    () => () => {
      throw new Error("drag start failed");
    },
    "drag start failed",
  ],
  ["invalid", () => undefined as never, "A mouse drag handler must be a function."],
] as const)(
  "a %s drag start clears its click candidate before a same-turn release",
  (_kind, getHandler, expectedError) => {
    const errors: unknown[] = [];
    const { controller, frame, node } = createHarness({
      onReportError(error) {
        errors.push(error);
      },
    });
    const clicks: number[] = [];
    const isDragging = shallowRef(false);
    controller.registerEvent(node, "click", () => () => {
      clicks.push(1);
      return "consume";
    });
    controller.registerDrag(node, getHandler, isDragging);
    controller.prepareFrame(frame(1)).accept();
    const snapshot = controller.captureInputSnapshot();

    controller.handleInput(
      {
        type: "down",
        button: "left",
        x: 1,
        y: 1,
        shift: false,
        meta: false,
        ctrl: false,
      },
      snapshot,
    );
    controller.handleInput(
      {
        type: "drag",
        button: "left",
        x: 2,
        y: 1,
        shift: false,
        meta: false,
        ctrl: false,
      },
      snapshot,
    );
    controller.handleInput(
      {
        type: "up",
        button: "left",
        x: 2,
        y: 1,
        shift: false,
        meta: false,
        ctrl: false,
      },
      snapshot,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ message: expectedError });
    expect(clicks).toEqual([]);
    expect(isDragging.value).toBe(false);
    controller.dispose();
  },
);

test("a reporting acquisition failure rolls raw ownership back before a later frame retries", () => {
  let failAcquire = true;
  const { controller, frame, node, transitions } = createHarness({
    onAcquireSgrMouseMode() {
      if (!failAcquire) return;
      failAcquire = false;
      throw new Error("mouse acquisition failed");
    },
  });
  controller.registerEvent(node, "click", () => () => "continue");

  const rejected = controller.prepareFrame(frame(1));
  expect(() => rejected.accept()).toThrow("mouse acquisition failed");
  expect(transitions).toEqual(["raw:on", "mouse:button", "raw:off"]);

  controller.prepareFrame(frame(2)).accept();
  expect(transitions).toEqual(["raw:on", "mouse:button", "raw:off", "raw:on", "mouse:button"]);

  controller.dispose();
  expect(transitions).toEqual([
    "raw:on",
    "mouse:button",
    "raw:off",
    "raw:on",
    "mouse:button",
    "mouse:none",
    "raw:off",
  ]);
});

test("a final reporting release failure still gives raw ownership its cleanup turn", () => {
  let failRelease = true;
  const { controller, frame, node, transitions } = createHarness({
    onReleaseSgrMouseMode() {
      if (!failRelease) return;
      failRelease = false;
      throw new Error("mouse release failed");
    },
  });
  const unregister = controller.registerEvent(node, "click", () => () => "continue");
  controller.prepareFrame(frame(1)).accept();

  expect(() => unregister()).toThrow("mouse release failed");
  expect(transitions).toEqual(["raw:on", "mouse:button", "mouse:none", "raw:off"]);

  // The lower stdin owner consumed the failed token before throwing. Disposal
  // is therefore an idempotent backstop here; physical uncertainty and retries
  // remain the stdin owner's responsibility.
  expect(() => controller.dispose()).not.toThrow();
  expect(transitions).toEqual(["raw:on", "mouse:button", "mouse:none", "raw:off"]);
});

test("a re-entrant frame keeps replacement button demand when the old drag release fails", () => {
  let failOldRelease = true;
  let reenterWithCurrentDemand = () => {};
  const { controller, frame, node, transitions } = createHarness({
    onReleaseSgrMouseMode() {
      if (!failOldRelease) return;
      failOldRelease = false;
      reenterWithCurrentDemand();
      throw new Error("old reporting release failed");
    },
  });
  controller.registerEvent(node, "click", () => () => "continue");
  const unregisterDrag = controller.registerDrag(node, () => () => {}, shallowRef(false));
  controller.prepareFrame(frame(1)).accept();
  expect(transitions).toEqual(["raw:on", "mouse:drag"]);

  reenterWithCurrentDemand = () => controller.prepareFrame(frame(2)).accept();
  expect(() => unregisterDrag()).toThrow("old reporting release failed");
  expect(controller.captureInputSnapshot().frame.generation).toBe(2);
  expect(transitions).toEqual(["raw:on", "mouse:drag", "mouse:button", "mouse:none"]);

  // The replacement button token was committed before releasing the old drag
  // token. A later accepted frame therefore observes stable button demand and
  // does not reacquire either reporting or raw input.
  controller.prepareFrame(frame(3)).accept();
  expect(transitions).toEqual(["raw:on", "mouse:drag", "mouse:button", "mouse:none"]);

  controller.dispose();
  expect(transitions).toEqual([
    "raw:on",
    "mouse:drag",
    "mouse:button",
    "mouse:none",
    "mouse:none",
    "raw:off",
  ]);
});
