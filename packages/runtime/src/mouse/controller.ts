import type { ShallowRef } from "vue";
import type { StdinContext, SgrMouseMode } from "../context.ts";
import type {
  InternalElementGeometry,
  InternalGeometryBinding,
  InternalGeometryPaintFrame,
  InternalGeometryService,
  InternalResolvedGeometry,
} from "../geometry/geometry-service.ts";
import { isContainer, type TuiNode } from "../host/nodes.ts";
import type { SgrMouseButtonEvent, SgrMouseEvent } from "../io/parse-mouse.ts";
import type { RenderedTargetTransactionHost } from "../rendered-target.ts";
import type {
  CellDelta,
  MouseButton,
  MouseDragHandler,
  MouseEventHandler,
  MouseModifiers,
  TuiMouseDragEvent,
  TuiMouseEventMap,
} from "./public-events.ts";

type MouseEventType = keyof TuiMouseEventMap;

interface EventRegistration<Type extends MouseEventType = MouseEventType> {
  readonly kind: "event";
  readonly id: number;
  readonly node: TuiNode;
  readonly type: Type;
  readonly getHandler: () => MouseEventHandler<Type>;
  active: boolean;
}

interface DragRegistration {
  readonly kind: "drag";
  readonly id: number;
  readonly node: TuiNode;
  readonly getHandler: () => MouseDragHandler;
  readonly isDragging: ShallowRef<boolean>;
  active: boolean;
}

interface RegisteredHost {
  readonly node: TuiNode;
  readonly geometry: InternalGeometryBinding;
  readonly detachGeometry: () => void;
  readonly events: {
    readonly click: Set<EventRegistration<"click">>;
    readonly wheel: Set<EventRegistration<"wheel">>;
  };
  readonly drags: Set<DragRegistration>;
}

interface AcceptedHost {
  readonly node: TuiNode;
  readonly geometry: InternalResolvedGeometry & {
    readonly status: "zero-size" | "fully-clipped" | "visible";
  };
  readonly paintOrder: number;
  readonly ancestors: readonly TuiNode[];
  readonly events: {
    readonly click: readonly EventRegistration<"click">[];
    readonly wheel: readonly EventRegistration<"wheel">[];
  };
  readonly drags: readonly DragRegistration[];
}

interface AcceptedMouseFrame {
  readonly generation: number;
  readonly hosts: ReadonlyMap<TuiNode, AcceptedHost>;
}

export interface FullscreenMouseInputSnapshot {
  readonly frame: AcceptedMouseFrame;
}

export interface PreparedMouseFrame {
  accept(): void;
  discard(): void;
}

export interface FullscreenMouseController extends RenderedTargetTransactionHost {
  registerEvent<Type extends MouseEventType>(
    target: TuiNode,
    type: Type,
    getHandler: () => MouseEventHandler<Type>,
  ): () => void;
  registerDrag(
    target: TuiNode,
    getHandler: () => MouseDragHandler,
    isDragging: ShallowRef<boolean>,
  ): () => void;
  prepareFrame(frame: InternalGeometryPaintFrame): PreparedMouseFrame;
  captureInputSnapshot(): FullscreenMouseInputSnapshot;
  handleInput(event: SgrMouseEvent, snapshot: FullscreenMouseInputSnapshot): void;
  suspend(): void;
  resume(): void;
  beginSilentTeardown(): void;
  dispose(): void;
}

interface CreateFullscreenMouseControllerOptions {
  readonly stdin: StdinContext;
  readonly geometry: InternalGeometryService;
  readonly protocolAvailable: boolean;
  readonly requestPaint: () => void;
  readonly reportError: (error: unknown) => void;
}

interface ClickCandidate {
  readonly button: MouseButton;
  readonly target: TuiNode;
  readonly receivers: readonly {
    readonly node: TuiNode;
    readonly delivery: "target" | "bubble";
    readonly leases: readonly EventRegistration<"click">[];
  }[];
}

interface DragGesture {
  readonly owner: TuiNode;
  cohort: DragRegistration[];
  started: boolean;
  point: Readonly<{ x: number; y: number }>;
  modifiers: MouseModifiers;
}

type DragDispatchPhase = "start" | "move" | "end" | "cancel";

interface DragDispatchContext {
  readonly gesture: DragGesture;
  readonly phase: DragDispatchPhase;
  readonly planned: ReadonlySet<DragRegistration>;
  readonly deactivated: Set<DragRegistration>;
}

const EMPTY_FRAME: AcceptedMouseFrame = Object.freeze({
  generation: 0,
  hosts: new Map<TuiNode, AcceptedHost>(),
});

function point(x: number, y: number): Readonly<{ x: number; y: number }> {
  return Object.freeze({ x, y });
}

function delta(x: number, y: number): CellDelta {
  return Object.freeze({ x, y });
}

function modifiersOf(event: SgrMouseEvent): MouseModifiers {
  return Object.freeze({ shift: event.shift, alt: event.meta, ctrl: event.ctrl });
}

function contains(
  rect: Readonly<{ x: number; y: number; width: number; height: number }>,
  surface: Readonly<{ x: number; y: number }>,
): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    surface.x >= rect.x &&
    surface.y >= rect.y &&
    surface.x < rect.x + rect.width &&
    surface.y < rect.y + rect.height
  );
}

function hitVisible(host: AcceptedHost, surface: Readonly<{ x: number; y: number }>): boolean {
  return host.geometry.fragments.some(
    (fragment) => fragment.visibleSurface && contains(fragment.visibleSurface, surface),
  );
}

function localForSurface(
  host: AcceptedHost,
  surface: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> | null {
  for (let index = host.geometry.fragments.length - 1; index >= 0; index--) {
    const fragment = host.geometry.fragments[index]!;
    if (!contains(fragment.surface, surface)) continue;
    return point(
      fragment.local.x + surface.x - fragment.surface.x,
      fragment.local.y + surface.y - fragment.surface.y,
    );
  }
  return null;
}

function isResolvedGeometry(
  geometry: InternalElementGeometry,
): geometry is InternalResolvedGeometry & {
  readonly status: "zero-size" | "fully-clipped" | "visible";
} {
  return (
    geometry.status === "zero-size" ||
    geometry.status === "fully-clipped" ||
    geometry.status === "visible"
  );
}

function desiredReporting(frame: AcceptedMouseFrame): SgrMouseMode | undefined {
  let button = false;
  for (const host of frame.hosts.values()) {
    if (host.drags.some((registration) => registration.active)) return "drag";
    if (
      host.events.click.some((registration) => registration.active) ||
      host.events.wheel.some((registration) => registration.active)
    ) {
      button = true;
    }
  }
  return button ? "button" : undefined;
}

function invalidHandlerResult(result: unknown): TypeError {
  const actual = result instanceof Promise ? "a Promise" : JSON.stringify(result);
  return new TypeError(
    `A mouse event handler must return "continue" or "consume" synchronously; received ${actual ?? String(result)}.`,
  );
}

export function createFullscreenMouseController(
  options: CreateFullscreenMouseControllerOptions,
): FullscreenMouseController {
  const { stdin, geometry, protocolAvailable, reportError } = options;
  const hosts = new Map<TuiNode, RegisteredHost>();
  const invalidatedNodes = new WeakSet<TuiNode>();
  let nextRegistrationId = 1;
  let acceptedFrame = EMPTY_FRAME;
  let clickCandidate: ClickCandidate | undefined;
  let dragGesture: DragGesture | undefined;
  let dragDispatch: DragDispatchContext | undefined;
  let mouseToken: symbol | undefined;
  let reportingLevel: SgrMouseMode | undefined;
  let rawHeld = false;
  let suspended = false;
  let silent = false;
  let disposed = false;
  let transactionDepth = 0;
  let paintRequested = false;

  const requestPaint = (): void => {
    if (disposed || suspended || silent) return;
    if (transactionDepth > 0) {
      paintRequested = true;
      return;
    }
    options.requestPaint();
  };

  const isEventLive = (
    registration: Pick<EventRegistration, "active" | "node">,
    node: TuiNode,
  ): boolean => registration.active && registration.node === node && !invalidatedNodes.has(node);

  const isDragLive = (registration: DragRegistration, node: TuiNode): boolean =>
    registration.active && registration.node === node && !invalidatedNodes.has(node);

  const ensureHost = (node: TuiNode): RegisteredHost => {
    const existing = hosts.get(node);
    if (existing) return existing;
    const geometryBinding = geometry.createBinding();
    let detachGeometry: (() => void) | undefined;
    try {
      detachGeometry = geometryBinding.attach(node);
    } catch (error) {
      geometryBinding.dispose();
      throw error;
    }
    const host: RegisteredHost = {
      node,
      geometry: geometryBinding,
      detachGeometry,
      events: { click: new Set(), wheel: new Set() },
      drags: new Set(),
    };
    hosts.set(node, host);
    return host;
  };

  const removeEmptyHost = (host: RegisteredHost): void => {
    if (host.events.click.size > 0 || host.events.wheel.size > 0 || host.drags.size > 0) return;
    if (hosts.get(host.node) !== host) return;
    hosts.delete(host.node);
    host.detachGeometry();
    host.geometry.dispose();
  };

  const releaseReporting = (): void => {
    const token = mouseToken;
    mouseToken = undefined;
    reportingLevel = undefined;
    let firstError: unknown;
    if (token) {
      try {
        stdin.releaseSgrMouseMode(token);
      } catch (error) {
        firstError = error;
      }
    }
    if (rawHeld) {
      rawHeld = false;
      try {
        stdin.releaseRawMode();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== undefined) throw firstError;
  };

  const reconcileReporting = (desired: SgrMouseMode | undefined): void => {
    if (disposed || suspended || silent) desired = undefined;
    if (desired === reportingLevel && (desired === undefined || mouseToken !== undefined)) return;
    if (!desired) {
      releaseReporting();
      return;
    }
    if (!protocolAvailable) {
      throw new Error(
        "Fullscreen mouse input is unavailable because the terminal does not advertise an xterm-compatible SGR mouse protocol.",
      );
    }

    if (!rawHeld) {
      stdin.acquireRawMode();
      rawHeld = true;
    }

    const previousToken = mouseToken;
    let nextToken: symbol | undefined;
    try {
      nextToken = stdin.acquireSgrMouseMode(desired);
    } catch (error) {
      if (!previousToken) {
        try {
          releaseReporting();
        } catch {
          // Preserve the acquisition error after attempting every rollback.
        }
      }
      throw error;
    }

    mouseToken = nextToken;
    reportingLevel = desired;
    if (previousToken) {
      // The logical replacement is already committed before releasing the old
      // token. If release throws, the new token remains owned so teardown can
      // still retry exact terminal cleanup.
      stdin.releaseSgrMouseMode(previousToken);
    }
  };

  const reconcileAcceptedDemand = (): void => {
    reconcileReporting(desiredReporting(acceptedFrame));
  };

  const clearClickCandidateFor = (registration: EventRegistration<"click">): void => {
    if (!clickCandidate) return;
    if (
      clickCandidate.receivers.some((receiver) => receiver.leases.includes(registration)) &&
      !clickCandidate.receivers[0]?.leases.some((lease) => lease.active)
    ) {
      clickCandidate = undefined;
    }
  };

  const currentDragLocal = (gesture: DragGesture): Readonly<{ x: number; y: number }> | null => {
    const host = acceptedFrame.hosts.get(gesture.owner);
    return host ? localForSurface(host, gesture.point) : null;
  };

  const abandonDrag = (): void => {
    if (!dragGesture) return;
    for (const registration of dragGesture.cohort) registration.isDragging.value = false;
    dragGesture = undefined;
  };

  const failDrag = (error: unknown): void => {
    abandonDrag();
    try {
      reconcileAcceptedDemand();
    } catch {
      // The application error remains first; teardown retries terminal cleanup.
    }
    reportError(error);
  };

  const cancelDragMembers = (
    gesture: DragGesture,
    members: readonly DragRegistration[],
    reason: "deactivated" | "target-lost" | "suspended",
  ): boolean => {
    if (!gesture.started || members.length === 0) return true;
    const surface = gesture.point;
    const local = currentDragLocal(gesture);
    const modifiers = gesture.modifiers;
    const plans: Array<{ registration: DragRegistration; handler: MouseDragHandler }> = [];
    const context: DragDispatchContext = {
      gesture,
      phase: "cancel",
      planned: new Set(members),
      deactivated: new Set(),
    };
    try {
      for (const registration of members) {
        registration.isDragging.value = false;
        const handler = registration.getHandler();
        if (typeof handler !== "function") {
          throw new TypeError("A mouse drag handler must be a function.");
        }
        plans.push({ registration, handler });
      }
      const event = Object.freeze({
        type: "drag",
        phase: "cancel",
        button: "left",
        reason,
        surface,
        local,
        modifiers,
        movement: null,
      }) satisfies TuiMouseDragEvent;
      const previousDispatch = dragDispatch;
      dragDispatch = context;
      try {
        for (const plan of plans) {
          if (silent || disposed) break;
          plan.handler(event);
        }
      } finally {
        dragDispatch = previousDispatch;
      }
    } catch (error) {
      failDrag(error);
      return false;
    }
    const additionallyDeactivated = [...context.deactivated];
    return (
      additionallyDeactivated.length === 0 ||
      cancelDragMembers(gesture, additionallyDeactivated, "deactivated")
    );
  };

  const cancelWholeDrag = (reason: "target-lost" | "suspended", invokeHandlers: boolean): void => {
    const gesture = dragGesture;
    if (!gesture) return;
    if (invokeHandlers && gesture.started) {
      cancelDragMembers(gesture, [...gesture.cohort], reason);
    }
    if (dragGesture === gesture) abandonDrag();
  };

  const removeDragRegistration = (registration: DragRegistration): void => {
    if (!registration.active) return;
    const activeDispatch = dragDispatch;
    const gesture = dragGesture?.cohort.includes(registration)
      ? dragGesture
      : activeDispatch?.gesture.cohort.includes(registration)
        ? activeDispatch.gesture
        : undefined;
    registration.active = false;
    if (gesture?.cohort.includes(registration)) {
      registration.isDragging.value = false;
      gesture.cohort = gesture.cohort.filter((member) => member !== registration);
      if (gesture.started && !silent) {
        if (activeDispatch?.gesture === gesture) {
          if (
            activeDispatch.phase === "start" ||
            activeDispatch.phase === "move" ||
            !activeDispatch.planned.has(registration)
          ) {
            activeDispatch.deactivated.add(registration);
          }
        } else {
          cancelDragMembers(gesture, [registration], "deactivated");
        }
      }
      if (dragGesture === gesture && gesture.cohort.length === 0) dragGesture = undefined;
    }
    registration.isDragging.value = false;
    const host = hosts.get(registration.node);
    host?.drags.delete(registration);
    if (host) removeEmptyHost(host);
    try {
      reconcileAcceptedDemand();
    } finally {
      requestPaint();
    }
  };

  const selectHost = (
    frame: AcceptedMouseFrame,
    kind: MouseEventType | "drag",
    surface: Readonly<{ x: number; y: number }>,
  ): AcceptedHost | undefined => {
    let selected: AcceptedHost | undefined;
    for (const host of frame.hosts.values()) {
      const matches =
        kind === "drag"
          ? host.drags.some((registration) => isDragLive(registration, host.node))
          : host.events[kind].some((registration) => isEventLive(registration, host.node));
      if (!matches || !hitVisible(host, surface)) continue;
      if (!selected || host.paintOrder > selected.paintOrder) selected = host;
    }
    return selected;
  };

  const receiverPath = <Type extends MouseEventType>(
    frame: AcceptedMouseFrame,
    target: AcceptedHost,
    type: Type,
  ): Array<{
    readonly host: AcceptedHost;
    readonly delivery: "target" | "bubble";
    readonly leases: readonly EventRegistration<Type>[];
  }> => {
    const result: Array<{
      readonly host: AcceptedHost;
      readonly delivery: "target" | "bubble";
      readonly leases: readonly EventRegistration<Type>[];
    }> = [];
    const nodes = [target.node, ...target.ancestors];
    for (let index = 0; index < nodes.length; index++) {
      const host = frame.hosts.get(nodes[index]!);
      if (!host) continue;
      const leases = host.events[type].filter((registration) =>
        isEventLive(registration, host.node),
      ) as unknown as EventRegistration<Type>[];
      if (leases.length > 0) {
        result.push({ host, delivery: index === 0 ? "target" : "bubble", leases });
      }
    }
    return result;
  };

  const dispatchEvent = <Type extends MouseEventType>(
    type: Type,
    surface: Readonly<{ x: number; y: number }>,
    modifiers: MouseModifiers,
    receivers: ReturnType<typeof receiverPath<Type>>,
    extra: Type extends "click" ? { readonly button: MouseButton } : { readonly delta: CellDelta },
  ): void => {
    try {
      const plan = receivers.map((receiver) => {
        const local = localForSurface(receiver.host, surface);
        if (!local) {
          throw new Error("Accepted mouse geometry could not map a receiver-local cell.");
        }
        const handlers = receiver.leases.map((registration) => {
          const handler = registration.getHandler();
          if (typeof handler !== "function") {
            throw new TypeError(`A ${type} mouse handler must be a function.`);
          }
          return handler;
        });
        const event = Object.freeze({
          type,
          delivery: receiver.delivery,
          surface,
          local,
          modifiers,
          ...extra,
        }) as unknown as TuiMouseEventMap[Type];
        return { event, handlers };
      });

      for (const receiver of plan) {
        let consumed = false;
        for (const handler of receiver.handlers) {
          const result = handler(receiver.event);
          if (result !== "continue" && result !== "consume") {
            throw invalidHandlerResult(result);
          }
          if (result === "consume") consumed = true;
        }
        if (consumed) break;
      }
    } catch (error) {
      reportError(error);
    }
  };

  const dispatchWheel = (
    event: Extract<SgrMouseEvent, { readonly type: "wheel" }>,
    snapshot: FullscreenMouseInputSnapshot,
  ): void => {
    const surface = point(event.x - 1, event.y - 1);
    const target = selectHost(snapshot.frame, "wheel", surface);
    if (!target) return;
    const wheelDelta =
      event.direction === "up"
        ? delta(0, -1)
        : event.direction === "down"
          ? delta(0, 1)
          : event.direction === "left"
            ? delta(-1, 0)
            : delta(1, 0);
    dispatchEvent(
      "wheel",
      surface,
      modifiersOf(event),
      receiverPath(snapshot.frame, target, "wheel"),
      { delta: wheelDelta },
    );
  };

  const beginButton = (
    event: SgrMouseButtonEvent,
    snapshot: FullscreenMouseInputSnapshot,
  ): void => {
    if (dragGesture?.started) return;
    clickCandidate = undefined;
    dragGesture = undefined;
    const surface = point(event.x - 1, event.y - 1);
    const clickTarget = selectHost(snapshot.frame, "click", surface);
    if (clickTarget) {
      const path = receiverPath(snapshot.frame, clickTarget, "click");
      clickCandidate = {
        button: event.button,
        target: clickTarget.node,
        receivers: path.map((receiver) => ({
          node: receiver.host.node,
          delivery: receiver.delivery,
          leases: [...receiver.leases],
        })),
      };
    }
    if (event.button !== "left") return;
    const dragTarget = selectHost(snapshot.frame, "drag", surface);
    if (!dragTarget) return;
    dragGesture = {
      owner: dragTarget.node,
      cohort: dragTarget.drags.filter((registration) => isDragLive(registration, dragTarget.node)),
      started: false,
      point: surface,
      modifiers: modifiersOf(event),
    };
  };

  const dispatchDragPhase = (
    phase: "start" | "move" | "end",
    surface: Readonly<{ x: number; y: number }>,
    modifiers: MouseModifiers,
    movement: CellDelta,
    frame: AcceptedMouseFrame,
  ): boolean => {
    const gesture = dragGesture;
    if (!gesture) return false;
    const owner = frame.hosts.get(gesture.owner) ?? acceptedFrame.hosts.get(gesture.owner);
    const local = owner ? localForSurface(owner, surface) : null;
    const members = gesture.cohort.filter((registration) =>
      isDragLive(registration, gesture.owner),
    );
    if (members.length === 0) {
      abandonDrag();
      return false;
    }
    try {
      const plans = members.map((registration) => {
        const handler = registration.getHandler();
        if (typeof handler !== "function")
          throw new TypeError("A mouse drag handler must be a function.");
        return { registration, handler };
      });
      if (phase === "start") {
        for (const plan of plans) plan.registration.isDragging.value = true;
        gesture.started = true;
      } else if (phase === "end") {
        for (const plan of plans) plan.registration.isDragging.value = false;
      }
      gesture.point = surface;
      gesture.modifiers = modifiers;
      const dragEvent = Object.freeze({
        type: "drag",
        phase,
        button: "left",
        surface,
        local,
        modifiers,
        movement,
      }) satisfies TuiMouseDragEvent;
      const context: DragDispatchContext = {
        gesture,
        phase,
        planned: new Set(members),
        deactivated: new Set(),
      };
      const previousDispatch = dragDispatch;
      dragDispatch = context;
      try {
        for (const plan of plans) {
          if (silent || disposed) break;
          plan.handler(dragEvent);
        }
      } finally {
        dragDispatch = previousDispatch;
      }
      gesture.cohort = members.filter((registration) => registration.active);
      if (dragGesture === gesture && gesture.cohort.length === 0) dragGesture = undefined;
      if (
        context.deactivated.size > 0 &&
        !cancelDragMembers(gesture, [...context.deactivated], "deactivated")
      ) {
        return false;
      }
      return true;
    } catch (error) {
      failDrag(error);
      return false;
    }
  };

  const moveButton = (event: SgrMouseButtonEvent, snapshot: FullscreenMouseInputSnapshot): void => {
    const gesture = dragGesture;
    if (!gesture || event.button !== "left") return;
    clickCandidate = undefined;
    const surface = point(event.x - 1, event.y - 1);
    const movement = delta(surface.x - gesture.point.x, surface.y - gesture.point.y);
    const modifiers = modifiersOf(event);
    const phase = gesture.started ? "move" : "start";
    if (!dispatchDragPhase(phase, surface, modifiers, movement, snapshot.frame)) return;
    if (!dragGesture) return;
    dragGesture.started = true;
    dragGesture.point = surface;
    dragGesture.modifiers = modifiers;
  };

  const endButton = (event: SgrMouseButtonEvent, snapshot: FullscreenMouseInputSnapshot): void => {
    const surface = point(event.x - 1, event.y - 1);
    const modifiers = modifiersOf(event);
    const gesture = dragGesture;
    const dragStarted = Boolean(gesture?.started);
    if (gesture && event.button === "left") {
      if (gesture.started) {
        const movement = delta(surface.x - gesture.point.x, surface.y - gesture.point.y);
        dispatchDragPhase("end", surface, modifiers, movement, snapshot.frame);
      }
      abandonDrag();
    }

    const candidate = clickCandidate;
    clickCandidate = undefined;
    if (!candidate || dragStarted || candidate.button !== event.button) return;
    const releaseTarget = selectHost(snapshot.frame, "click", surface);
    if (!releaseTarget || releaseTarget.node !== candidate.target) return;
    const targetLeases = candidate.receivers[0]?.leases.filter((lease) =>
      isEventLive(lease, candidate.target),
    );
    if (!targetLeases || targetLeases.length === 0) return;

    const receivers: ReturnType<typeof receiverPath<"click">> = [];
    for (const candidateReceiver of candidate.receivers) {
      const host = snapshot.frame.hosts.get(candidateReceiver.node);
      if (!host) continue;
      const leases = candidateReceiver.leases.filter((lease) =>
        isEventLive(lease, candidateReceiver.node),
      );
      if (leases.length > 0) {
        receivers.push({ host, delivery: candidateReceiver.delivery, leases });
      }
    }
    dispatchEvent("click", surface, modifiers, receivers, { button: event.button });
  };

  const acceptFrame = (frame: AcceptedMouseFrame): void => {
    if (disposed || suspended || silent) return;
    reconcileReporting(desiredReporting(frame));
    acceptedFrame = frame;
    if (clickCandidate && !frame.hosts.has(clickCandidate.target)) clickCandidate = undefined;
    if (dragGesture && !frame.hosts.has(dragGesture.owner)) {
      cancelWholeDrag("target-lost", true);
    }
    reconcileAcceptedDemand();
  };

  const controller: FullscreenMouseController = {
    transaction(_kind, change) {
      transactionDepth++;
      try {
        change();
      } finally {
        transactionDepth--;
        if (transactionDepth === 0 && paintRequested) {
          paintRequested = false;
          requestPaint();
        }
      }
    },
    beforeInvalidateSubtree(target) {
      const invalidated: TuiNode[] = [];
      const visit = (node: TuiNode): void => {
        invalidatedNodes.add(node);
        invalidated.push(node);
        if (isContainer(node)) for (const child of node.children) visit(child);
      };
      visit(target);
      if (invalidated.some((node) => acceptedFrame.hosts.has(node))) {
        const remaining = new Map<TuiNode, AcceptedHost>();
        for (const [node, host] of acceptedFrame.hosts) {
          if (!invalidatedNodes.has(node)) remaining.set(node, host);
        }
        acceptedFrame = Object.freeze({ generation: acceptedFrame.generation, hosts: remaining });
      }
      if (clickCandidate && invalidated.some((node) => node === clickCandidate?.target)) {
        clickCandidate = undefined;
      }
      if (dragGesture && invalidated.some((node) => node === dragGesture?.owner)) {
        cancelWholeDrag("target-lost", true);
      }
      try {
        reconcileAcceptedDemand();
      } finally {
        requestPaint();
      }
    },
    registerEvent(target, type, getHandler) {
      if (disposed) return () => {};
      const host = ensureHost(target);
      const registration: EventRegistration<typeof type> = {
        kind: "event",
        id: nextRegistrationId++,
        node: target,
        type,
        getHandler,
        active: true,
      };
      host.events[type].add(registration as never);
      requestPaint();
      return () => {
        if (!registration.active) return;
        registration.active = false;
        if (registration.type === "click") {
          clearClickCandidateFor(registration as unknown as EventRegistration<"click">);
        }
        host.events[type].delete(registration as never);
        removeEmptyHost(host);
        try {
          reconcileAcceptedDemand();
        } finally {
          requestPaint();
        }
      };
    },
    registerDrag(target, getHandler, isDragging) {
      if (disposed) return () => {};
      const host = ensureHost(target);
      const registration: DragRegistration = {
        kind: "drag",
        id: nextRegistrationId++,
        node: target,
        getHandler,
        isDragging,
        active: true,
      };
      host.drags.add(registration);
      requestPaint();
      return () => removeDragRegistration(registration);
    },
    prepareFrame(geometryFrame) {
      if (disposed || suspended || silent) {
        return { accept() {}, discard() {} };
      }
      const acceptedHosts = new Map<TuiNode, AcceptedHost>();
      for (const host of hosts.values()) {
        if (invalidatedNodes.has(host.node) || !geometryFrame.isObserved(host.node)) continue;
        const targetGeometry = geometryFrame.geometryFor(host.node);
        const paintOrder = geometryFrame.paintOrderFor(host.node);
        if (
          !isResolvedGeometry(targetGeometry) ||
          targetGeometry.status !== "visible" ||
          paintOrder === undefined ||
          !targetGeometry.fragments.some((fragment) => fragment.visibleSurface !== null)
        ) {
          continue;
        }
        const click = [...host.events.click].filter((registration) => registration.active);
        const wheel = [...host.events.wheel].filter((registration) => registration.active);
        const drags = [...host.drags].filter((registration) => registration.active);
        if (click.length === 0 && wheel.length === 0 && drags.length === 0) continue;
        const ancestors: TuiNode[] = [];
        let parent = host.node.parent;
        while (parent) {
          ancestors.push(parent);
          parent = parent.parent;
        }
        acceptedHosts.set(
          host.node,
          Object.freeze({
            node: host.node,
            geometry: targetGeometry,
            paintOrder,
            ancestors: Object.freeze(ancestors),
            events: Object.freeze({
              click: Object.freeze(click),
              wheel: Object.freeze(wheel),
            }),
            drags: Object.freeze(drags),
          }),
        );
      }
      const nextFrame: AcceptedMouseFrame = Object.freeze({
        generation: geometryFrame.generation,
        hosts: acceptedHosts,
      });
      let settled = false;
      return {
        accept() {
          if (settled) return;
          settled = true;
          acceptFrame(nextFrame);
        },
        discard() {
          settled = true;
        },
      };
    },
    captureInputSnapshot() {
      return Object.freeze({ frame: acceptedFrame });
    },
    handleInput(event, snapshot) {
      if (disposed || suspended || silent) return;
      switch (event.type) {
        case "wheel":
          dispatchWheel(event, snapshot);
          break;
        case "down":
          beginButton(event, snapshot);
          break;
        case "drag":
          moveButton(event, snapshot);
          break;
        case "up":
          endButton(event, snapshot);
          break;
      }
    },
    suspend() {
      if (disposed || suspended) return;
      suspended = true;
      clickCandidate = undefined;
      cancelWholeDrag("suspended", !silent);
      acceptedFrame = EMPTY_FRAME;
      releaseReporting();
    },
    resume() {
      if (disposed || silent) return;
      suspended = false;
      acceptedFrame = EMPTY_FRAME;
      requestPaint();
    },
    beginSilentTeardown() {
      if (silent) return;
      silent = true;
      clickCandidate = undefined;
      abandonDrag();
      acceptedFrame = EMPTY_FRAME;
      releaseReporting();
    },
    dispose() {
      if (disposed) return;
      silent = true;
      clickCandidate = undefined;
      abandonDrag();
      acceptedFrame = EMPTY_FRAME;
      let firstError: unknown;
      try {
        releaseReporting();
      } catch (error) {
        firstError = error;
      }
      disposed = true;
      for (const host of hosts.values()) {
        for (const registration of host.events.click) registration.active = false;
        for (const registration of host.events.wheel) registration.active = false;
        for (const registration of host.drags) {
          registration.active = false;
          registration.isDragging.value = false;
        }
        try {
          host.detachGeometry();
        } catch (error) {
          firstError ??= error;
        }
        try {
          host.geometry.dispose();
        } catch (error) {
          firstError ??= error;
        }
      }
      hosts.clear();
      if (firstError !== undefined) throw firstError;
    },
  };

  return controller;
}
