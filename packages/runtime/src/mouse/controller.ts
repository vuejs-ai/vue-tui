import type { SgrMouseEvent } from "../io/parse-mouse.ts";
import type { StdinContext } from "../context.ts";
import { isContainer, type TuiContainer, type TuiNode } from "../host/nodes.ts";
import type {
  MouseButton,
  MouseHandlerName,
  MouseHandlerProps,
  MouseTarget,
  MouseTargetRect,
  TuiMouseEvent,
  TuiWheelEvent,
} from "./events.ts";
import { forgetMouseTarget, getMouseTarget } from "./target.ts";

export interface MouseHitMapEntry {
  readonly node: TuiNode;
  readonly rect: MouseTargetRect;
}

export interface DraggableRegistration {
  readonly onStart?: (event: TuiMouseEvent) => void | false;
  readonly onMove?: (event: TuiMouseEvent) => void;
  readonly onEnd?: (event: TuiMouseEvent) => void;
}

export interface MouseController {
  readonly fullscreen: boolean;
  setHandler(node: TuiNode, name: MouseHandlerName, handler: unknown): void;
  updateHitMap(entries: readonly MouseHitMapEntry[]): void;
  removeNode(node: TuiNode): void;
  registerDraggable(node: TuiNode, registration: DraggableRegistration): () => void;
}

interface CreateMouseControllerOptions {
  readonly stdin: StdinContext;
  readonly fullscreen: boolean;
  readonly now: () => number;
}

type MutableMouseEvent = TuiMouseEvent & {
  currentTarget: MouseTarget | null;
  offsetX: number;
  offsetY: number;
};

type MutableWheelEvent = TuiWheelEvent & {
  currentTarget: MouseTarget | null;
  offsetX: number;
  offsetY: number;
};

const CLICK_DETAIL_WINDOW_MS = 500;
const INLINE_MOUSE_WARNING =
  '[vue-tui] Mouse handlers only fire in fullscreen mode. Use app.mount({ mode: "fullscreen" }) for targeted element mouse events, or useMouseInput() for raw inline mouse input.';

function hasMouseHandlers(node: TuiNode): boolean {
  const handlers = (node as { mouseHandlers?: Partial<MouseHandlerProps> }).mouseHandlers;
  return Boolean(
    handlers?.onMousedown || handlers?.onMouseup || handlers?.onClick || handlers?.onWheel,
  );
}

function handlerNameFor(type: "down" | "up" | "click" | "wheel"): MouseHandlerName {
  switch (type) {
    case "down":
      return "onMousedown";
    case "up":
      return "onMouseup";
    case "click":
      return "onClick";
    case "wheel":
      return "onWheel";
  }
}

function rectContains(rect: MouseTargetRect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

function parentOf(node: TuiNode): TuiContainer | null {
  return node.parent;
}

export function createMouseController(options: CreateMouseControllerOptions): MouseController {
  const { stdin, fullscreen, now } = options;
  const handlerNodes = new Set<TuiNode>();
  const hitMap: MouseHitMapEntry[] = [];
  const pressedButtons = new Set<MouseButton>();
  const draggables = new Map<TuiNode, Set<DraggableRegistration>>();
  let warnedInline = false;
  let rawModeAcquired = false;
  let mouseModeToken: symbol | undefined;
  let detachInputRoute: (() => void) | undefined;
  let lastPointer: { screenX: number; screenY: number } | undefined;
  let lastDown: { node: TuiNode; button: MouseButton } | undefined;
  let lastClick:
    | {
        node: TuiNode;
        button: MouseButton;
        screenX: number;
        screenY: number;
        time: number;
        detail: number;
      }
    | undefined;
  let capturedNode: TuiNode | undefined;
  let activeDrag:
    | { node: TuiNode; registration: DraggableRegistration; x: number; y: number; moved: boolean }
    | undefined;

  function warnInlineOnce() {
    if (fullscreen || warnedInline) return;
    warnedInline = true;
    // Deliberately not NODE_ENV-gated: an inline mouse handler is a dead end in production too.
    // eslint-disable-next-line no-console
    console.warn(INLINE_MOUSE_WARNING);
  }

  function shouldArm(): boolean {
    return fullscreen && (handlerNodes.size > 0 || draggables.size > 0);
  }

  function attach() {
    if (rawModeAcquired) return;
    stdin.acquireRawMode();
    try {
      mouseModeToken = stdin.acquireSgrMouseMode("drag");
      detachInputRoute = stdin.internal_routes.attach("internal_mouse", onRawMouse);
      rawModeAcquired = true;
    } catch (error) {
      const token = mouseModeToken;
      mouseModeToken = undefined;
      if (token) {
        try {
          stdin.releaseSgrMouseMode(token);
        } catch {
          // Preserve the attach failure while still attempting every rollback.
        }
      }
      try {
        stdin.releaseRawMode();
      } catch {
        // Preserve the attach failure; raw-mode teardown was still attempted.
      }
      throw error;
    }
  }

  function detach() {
    if (!rawModeAcquired) return;
    rawModeAcquired = false;
    const token = mouseModeToken;
    mouseModeToken = undefined;
    const errors: unknown[] = [];
    try {
      detachInputRoute?.();
      detachInputRoute = undefined;
    } catch (error) {
      errors.push(error);
    }
    if (token) {
      try {
        stdin.releaseSgrMouseMode(token);
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      stdin.releaseRawMode();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) throw errors[0];
  }

  function reconcileArmed() {
    if (shouldArm()) attach();
    else detach();
  }

  function hitTest(screenX: number, screenY: number): TuiNode | undefined {
    for (let index = hitMap.length - 1; index >= 0; index--) {
      const entry = hitMap[index]!;
      if (rectContains(entry.rect, screenX, screenY)) return entry.node;
    }
    return undefined;
  }

  function makeMouseEvent(
    type: TuiMouseEvent["type"],
    targetNode: TuiNode,
    raw: Extract<SgrMouseEvent, { type: "down" | "up" | "drag" }>,
    movementX: number,
    movementY: number,
    detail: number,
  ): { event: MutableMouseEvent; stopped: () => boolean } {
    let stopped = false;
    const target = getMouseTarget(targetNode);
    const event = {
      type,
      button: raw.button,
      buttons: new Set(pressedButtons),
      ctrlKey: raw.ctrl,
      shiftKey: raw.shift,
      altKey: raw.meta,
      metaKey: false,
      offsetX: 0,
      offsetY: 0,
      screenX: raw.x - 1,
      screenY: raw.y - 1,
      target,
      currentTarget: null,
      stopPropagation() {
        stopped = true;
      },
      preventDefault() {},
      defaultPrevented: false,
      detail,
      movementX,
      movementY,
    } satisfies MutableMouseEvent;
    return { event, stopped: () => stopped };
  }

  function makeWheelEvent(
    targetNode: TuiNode,
    raw: Extract<SgrMouseEvent, { type: "wheel" }>,
  ): { event: MutableWheelEvent; stopped: () => boolean } {
    let stopped = false;
    const target = getMouseTarget(targetNode);
    const event = {
      type: "wheel",
      button: null,
      buttons: new Set(pressedButtons),
      ctrlKey: raw.ctrl,
      shiftKey: raw.shift,
      altKey: raw.meta,
      metaKey: false,
      offsetX: 0,
      offsetY: 0,
      screenX: raw.x - 1,
      screenY: raw.y - 1,
      target,
      currentTarget: null,
      stopPropagation() {
        stopped = true;
      },
      preventDefault() {},
      defaultPrevented: false,
      detail: 0,
      deltaX: raw.direction === "left" ? -1 : raw.direction === "right" ? 1 : 0,
      deltaY: raw.direction === "up" ? -1 : raw.direction === "down" ? 1 : 0,
    } satisfies MutableWheelEvent;
    return { event, stopped: () => stopped };
  }

  function withCurrentTarget<Event extends MutableMouseEvent | MutableWheelEvent>(
    event: Event,
    currentTarget: MouseTarget,
  ): Event {
    const rect = currentTarget.rect;
    return {
      ...event,
      currentTarget,
      offsetX: event.screenX - rect.x,
      offsetY: event.screenY - rect.y,
    } as Event;
  }

  function dispatchMouseEvent(
    type: "down" | "up" | "click",
    targetNode: TuiNode,
    raw: Extract<SgrMouseEvent, { type: "down" | "up" | "drag" }>,
    movementX: number,
    movementY: number,
    detail: number,
  ) {
    const { event, stopped } = makeMouseEvent(type, targetNode, raw, movementX, movementY, detail);
    const handlerName = handlerNameFor(type);
    let current: TuiNode | null = targetNode;
    while (current) {
      const handlers = (current as { mouseHandlers?: Partial<MouseHandlerProps> }).mouseHandlers;
      const handler = handlers?.[handlerName] as ((event: TuiMouseEvent) => void) | undefined;
      if (handler) {
        handler(withCurrentTarget<MutableMouseEvent>(event, getMouseTarget(current)));
        if (stopped()) return;
      }
      current = parentOf(current);
    }
  }

  function dispatchWheelEvent(targetNode: TuiNode, raw: Extract<SgrMouseEvent, { type: "wheel" }>) {
    const { event, stopped } = makeWheelEvent(targetNode, raw);
    let current: TuiNode | null = targetNode;
    while (current) {
      const handlers = (current as { mouseHandlers?: Partial<MouseHandlerProps> }).mouseHandlers;
      const handler = handlers?.onWheel;
      if (handler) {
        handler(withCurrentTarget<MutableWheelEvent>(event, getMouseTarget(current)));
        if (stopped()) return;
      }
      current = parentOf(current);
    }
  }

  function makeDragEvent(
    type: "dragstart" | "drag" | "dragend",
    node: TuiNode,
    raw: Extract<SgrMouseEvent, { type: "down" | "up" | "drag" }>,
    movementX: number,
    movementY: number,
  ): TuiMouseEvent {
    const { event } = makeMouseEvent(type, node, raw, movementX, movementY, 0);
    return withCurrentTarget<MutableMouseEvent>(event, getMouseTarget(node));
  }

  function findDraggable(
    start: TuiNode | undefined,
  ): { node: TuiNode; registration: DraggableRegistration } | undefined {
    let current: TuiNode | null | undefined = start;
    while (current) {
      const registrations = draggables.get(current);
      const registration = registrations?.values().next().value as
        | DraggableRegistration
        | undefined;
      if (registration) return { node: current, registration };
      current = parentOf(current);
    }
    return undefined;
  }

  function onRawMouse(raw: SgrMouseEvent) {
    const screenX = raw.x - 1;
    const screenY = raw.y - 1;

    if (raw.type === "wheel") {
      const targetNode = capturedNode ?? hitTest(screenX, screenY);
      if (targetNode) dispatchWheelEvent(targetNode, raw);
      return;
    }

    const movementX = lastPointer ? screenX - lastPointer.screenX : 0;
    const movementY = lastPointer ? screenY - lastPointer.screenY : 0;
    lastPointer = { screenX, screenY };

    if (raw.type === "down") {
      pressedButtons.add(raw.button);
    } else if (raw.type === "up") {
      pressedButtons.delete(raw.button);
    }

    const targetNode = capturedNode ?? hitTest(screenX, screenY);
    if (!targetNode) return;

    if (raw.type === "down") {
      lastDown = { node: targetNode, button: raw.button };
      dispatchMouseEvent("down", targetNode, raw, 0, 0, 0);
      const draggable = findDraggable(targetNode);
      if (draggable) {
        const startResult = draggable.registration.onStart?.(
          makeDragEvent("dragstart", draggable.node, raw, 0, 0),
        );
        if (startResult === false) return;
        if (!draggables.get(draggable.node)?.has(draggable.registration)) return;
        capturedNode = draggable.node;
        activeDrag = { ...draggable, x: screenX, y: screenY, moved: false };
      }
      return;
    }

    if (raw.type === "drag") {
      if (activeDrag) {
        activeDrag.moved = true;
        activeDrag.x = screenX;
        activeDrag.y = screenY;
        activeDrag.registration.onMove?.(
          makeDragEvent("drag", activeDrag.node, raw, movementX, movementY),
        );
      }
      return;
    }

    dispatchMouseEvent("up", targetNode, raw, movementX, movementY, 0);

    const suppressClick = activeDrag?.moved === true;
    if (activeDrag) {
      activeDrag.registration.onEnd?.(
        makeDragEvent("dragend", activeDrag.node, raw, movementX, movementY),
      );
      activeDrag = undefined;
      capturedNode = undefined;
    }

    if (
      !suppressClick &&
      lastDown &&
      lastDown.node === targetNode &&
      lastDown.button === raw.button
    ) {
      const time = now();
      const detail =
        lastClick &&
        lastClick.node === targetNode &&
        lastClick.button === raw.button &&
        lastClick.screenX === screenX &&
        lastClick.screenY === screenY &&
        time - lastClick.time <= CLICK_DETAIL_WINDOW_MS
          ? lastClick.detail + 1
          : 1;
      lastClick = { node: targetNode, button: raw.button, screenX, screenY, time, detail };
      dispatchMouseEvent("click", targetNode, raw, 0, 0, detail);
    }
    lastDown = undefined;
  }

  function removeNode(node: TuiNode) {
    handlerNodes.delete(node);
    draggables.delete(node);
    for (let index = hitMap.length - 1; index >= 0; index--) {
      if (hitMap[index]!.node === node) hitMap.splice(index, 1);
    }
    if (capturedNode === node) {
      capturedNode = undefined;
      activeDrag = undefined;
    }
    if (lastDown?.node === node) lastDown = undefined;
    if (lastClick?.node === node) lastClick = undefined;
    forgetMouseTarget(node);
    if (isContainer(node)) {
      for (const child of node.children) removeNode(child);
    }
  }

  return {
    fullscreen,
    setHandler(node, name, handler) {
      const before = handlerNodes.has(node);
      const handlers = ((node as { mouseHandlers?: Partial<MouseHandlerProps> }).mouseHandlers ??=
        {});
      if (typeof handler === "function") {
        handlers[name] = handler as never;
        if (!fullscreen) warnInlineOnce();
      } else {
        delete handlers[name];
      }
      const after = hasMouseHandlers(node);
      if (before !== after) {
        if (after) handlerNodes.add(node);
        else handlerNodes.delete(node);
        reconcileArmed();
      }
    },
    updateHitMap(entries) {
      hitMap.length = 0;
      if (fullscreen) hitMap.push(...entries);
    },
    removeNode(node) {
      removeNode(node);
      reconcileArmed();
    },
    registerDraggable(node, registration) {
      let registrations = draggables.get(node);
      if (!registrations) {
        registrations = new Set();
        draggables.set(node, registrations);
      }
      registrations.add(registration);
      if (!fullscreen) warnInlineOnce();
      try {
        reconcileArmed();
      } catch (error) {
        // The caller receives no disposer when acquisition throws. Roll the
        // registration back here so it cannot become an ownerless request that
        // keeps raw/SGR mouse state armed after a later registration releases.
        registrations.delete(registration);
        if (registrations.size === 0) draggables.delete(node);
        try {
          reconcileArmed();
        } catch {
          // Preserve the acquisition error after attempting rollback.
        }
        throw error;
      }
      return () => {
        const current = draggables.get(node);
        if (!current) return;
        current.delete(registration);
        if (current.size === 0) draggables.delete(node);
        if (activeDrag?.registration === registration) {
          activeDrag = undefined;
          capturedNode = undefined;
        }
        reconcileArmed();
      };
    },
  };
}
