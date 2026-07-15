import { readonly, shallowRef, type ShallowRef } from "vue";
import type { InternalClipboardService } from "../clipboard/clipboard-service.ts";
import type { TuiNode, TuiText } from "../host/nodes.ts";
import type { TuiMouseClickEvent, TuiMouseDragEvent } from "../mouse/public-events.ts";
import type {
  TextSelectionCopyResult,
  TextSelectionMove,
  TextSelectionState,
} from "./public-selection.ts";
import type {
  InternalSelectionPaintFrame,
  InternalSelectionPaintTarget,
  InternalTextSelectionTrace,
} from "./selection-paint.ts";
import {
  createInternalSelectionPolicy,
  projectInternalSelectionRange,
  type InternalSelectionPolicy,
  type InternalSelectionRange,
  type InternalSelectionSnapshot,
} from "./selection-policy.ts";
import { changeRuntimeResource } from "../resource-tracker.ts";

export interface InternalTextSelectionRegistration {
  readonly key: object;
  readonly state: Readonly<ShallowRef<TextSelectionState>>;
  setActive(active: boolean): void;
  attach(node: TuiNode): () => void;
  move(direction: TextSelectionMove, extend: boolean): boolean;
  selectAll(): boolean;
  clear(): boolean;
  copy(): Promise<TextSelectionCopyResult>;
  click(event: TuiMouseClickEvent): "continue" | "consume";
  drag(event: TuiMouseDragEvent): void;
  dispose(): void;
}

export interface InternalTextSelectionController {
  register(active: boolean): InternalTextSelectionRegistration;
  beginFrame(): InternalSelectionPaintFrame | undefined;
  setSurfaceAvailable(available: boolean, options?: { readonly suspended?: boolean }): void;
  invalidateSurface(): void;
  dispose(): void;
}

interface Owner {
  readonly key: object;
  readonly policy: InternalSelectionPolicy;
  readonly stateRef: ShallowRef<TextSelectionState>;
  active: boolean;
  target: TuiText | null;
  displayedSnapshot: InternalSelectionSnapshot | null;
  displayedRange: InternalSelectionRange | null;
  mapping: "pending" | "ready" | "unavailable";
  intentRevision: number;
  disposed: boolean;
}

interface FrameOwner {
  readonly owner: Owner;
  readonly target: InternalSelectionPaintTarget;
  readonly previousSnapshot: InternalSelectionSnapshot | null;
  readonly intendedRange: InternalSelectionRange | null;
  readonly intentRevision: number;
  trace: InternalTextSelectionTrace | null;
  recorded: boolean;
  candidate: InternalSelectionSnapshot | null;
  projectedRange: InternalSelectionRange | null;
}

export interface CreateInternalTextSelectionControllerOptions {
  readonly surfaceAvailable: boolean;
  readonly unavailableReason: "host-unavailable" | "screen-reader" | "string-host";
  readonly requestPaint: () => void;
  readonly clipboard: InternalClipboardService;
}

const INACTIVE = Object.freeze({ status: "inactive" as const, range: null, selectedText: "" });
const PENDING = Object.freeze({ status: "pending" as const, range: null, selectedText: "" });

function unavailableState(
  reason: "host-unavailable" | "screen-reader" | "string-host" | "mapping-unavailable",
): TextSelectionState {
  return Object.freeze({ status: "unavailable", reason, range: null, selectedText: "" });
}

function rangesEqual(
  left: InternalSelectionRange | null,
  right: InternalSelectionRange | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.anchor === right.anchor &&
      left.extent === right.extent)
  );
}

function publicStatesEqual(left: TextSelectionState, right: TextSelectionState): boolean {
  if (left === right) return true;
  if (left.status !== right.status) return false;
  if (left.status === "unavailable" && right.status === "unavailable") {
    return left.reason === right.reason;
  }
  if (
    (left.status === "ready" || left.status === "suspended") &&
    (right.status === "ready" || right.status === "suspended")
  ) {
    return (
      left.text === right.text &&
      left.selectedText === right.selectedText &&
      rangesEqual(left.range, right.range)
    );
  }
  return true;
}

function publicState(
  status: "ready" | "suspended",
  snapshot: InternalSelectionSnapshot,
  range: InternalSelectionRange | null,
): TextSelectionState {
  const selectedText = range
    ? snapshot.text.slice(
        Math.min(range.anchor, range.extent),
        Math.max(range.anchor, range.extent),
      )
    : "";
  return Object.freeze({
    status,
    text: snapshot.text,
    range: range
      ? Object.freeze({
          anchor: range.anchor,
          extent: range.extent,
          direction: range.extent < range.anchor ? ("backward" as const) : ("forward" as const),
          collapsed: range.anchor === range.extent,
        })
      : null,
    selectedText,
  });
}

function inSubtree(node: TuiNode, ancestor: TuiText): boolean {
  for (let current: TuiNode | null = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

export function createInternalTextSelectionController(
  options: CreateInternalTextSelectionControllerOptions,
): InternalTextSelectionController {
  const owners = new Set<Owner>();
  const ownerByTarget = new Map<TuiText, Owner>();
  let surfaceAvailable = options.surfaceAvailable;
  let suspended = false;
  let disposed = false;
  let activeFrame: InternalSelectionPaintFrame | null = null;
  let activeOwner: Owner | null = null;

  const publish = (owner: Owner, state: TextSelectionState): void => {
    if (!publicStatesEqual(owner.stateRef.value, state)) owner.stateRef.value = state;
  };

  const refresh = (owner: Owner): void => {
    if (owner.disposed || !owner.active) {
      publish(owner, INACTIVE);
      return;
    }
    if (!surfaceAvailable) {
      if (suspended && owner.displayedSnapshot) {
        publish(owner, publicState("suspended", owner.displayedSnapshot, owner.displayedRange));
      } else {
        publish(owner, unavailableState(options.unavailableReason));
      }
      return;
    }
    if (!owner.target || owner.mapping === "pending") {
      publish(owner, PENDING);
      return;
    }
    if (owner.mapping === "unavailable" || !owner.displayedSnapshot) {
      publish(owner, unavailableState("mapping-unavailable"));
      return;
    }
    publish(owner, publicState("ready", owner.displayedSnapshot, owner.displayedRange));
  };

  const request = (owner: Owner): void => {
    owner.intentRevision++;
    refresh(owner);
    options.requestPaint();
  };

  const clearOtherOwner = (owner: Owner): void => {
    if (activeOwner === owner) return;
    if (activeOwner && !activeOwner.disposed && activeOwner.policy.range) {
      activeOwner.policy.clear();
      request(activeOwner);
    }
    activeOwner = owner;
  };

  const changed = (owner: Owner, result: "changed" | "unchanged" | "unavailable"): boolean => {
    if (result !== "changed") return false;
    clearOtherOwner(owner);
    request(owner);
    return true;
  };

  const controller: InternalTextSelectionController = {
    register(initialActive) {
      if (disposed) throw new Error("Text selection controller is disposed");
      if (typeof initialActive !== "boolean") {
        throw new TypeError("useTextSelection() isActive must resolve to a boolean");
      }
      const owner: Owner = {
        key: Object.freeze({}),
        policy: createInternalSelectionPolicy(),
        stateRef: shallowRef<TextSelectionState>(initialActive ? PENDING : INACTIVE),
        active: initialActive,
        target: null,
        displayedSnapshot: null,
        displayedRange: null,
        mapping: "pending",
        intentRevision: 0,
        disposed: false,
      };
      owners.add(owner);
      changeRuntimeResource("selectionOwners", 1);
      refresh(owner);

      return {
        key: owner.key,
        state: readonly(owner.stateRef) as Readonly<ShallowRef<TextSelectionState>>,
        setActive(active) {
          if (owner.disposed || owner.active === active) return;
          owner.active = active;
          if (!active) {
            if (activeOwner === owner) activeOwner = null;
            owner.policy.accept(null);
            owner.displayedSnapshot = null;
            owner.displayedRange = null;
            owner.mapping = "pending";
          }
          request(owner);
        },
        attach(node) {
          if (owner.disposed) return () => {};
          if (node.type !== "tui-text") {
            throw new TypeError("useTextSelection() target must resolve to one top-level <Text>");
          }
          if (owner.target && owner.target !== node) {
            throw new Error("useTextSelection() target is already attached to another <Text>");
          }
          const existing = ownerByTarget.get(node);
          if (existing && existing !== owner && !existing.disposed) {
            throw new Error("useTextSelection() supports one registration per top-level <Text>");
          }
          ownerByTarget.set(node, owner);
          owner.target = node;
          owner.mapping = "pending";
          request(owner);
          let attached = true;
          return () => {
            if (!attached || owner.disposed || owner.target !== node) return;
            attached = false;
            owner.target = null;
            if (ownerByTarget.get(node) === owner) ownerByTarget.delete(node);
            owner.policy.accept(null);
            owner.displayedSnapshot = null;
            owner.displayedRange = null;
            owner.mapping = "pending";
            if (activeOwner === owner) activeOwner = null;
            request(owner);
          };
        },
        move(direction, extend) {
          if (owner.disposed || !owner.active) return false;
          return changed(owner, owner.policy.move(direction, extend));
        },
        selectAll() {
          if (owner.disposed || !owner.active) return false;
          return changed(owner, owner.policy.selectAll());
        },
        clear() {
          if (owner.disposed || !owner.active) return false;
          return changed(owner, owner.policy.clear());
        },
        async copy() {
          if (
            owner.disposed ||
            !owner.active ||
            owner.mapping !== "ready" ||
            !owner.displayedSnapshot ||
            !owner.displayedRange
          ) {
            return Object.freeze({ status: "empty" as const });
          }
          const start = Math.min(owner.displayedRange.anchor, owner.displayedRange.extent);
          const end = Math.max(owner.displayedRange.anchor, owner.displayedRange.extent);
          if (start === end) return Object.freeze({ status: "empty" as const });
          return options.clipboard.writeText(owner.displayedSnapshot.text.slice(start, end));
        },
        click(event) {
          if (owner.disposed || !owner.active || owner.mapping !== "ready") return "continue";
          const point = { x: event.surface.x, y: event.surface.y };
          const result = owner.policy.click(point, event.modifiers.shift);
          return changed(owner, result) ? "consume" : "continue";
        },
        drag(event) {
          if (owner.disposed || !owner.active || owner.mapping !== "ready") return;
          const result = owner.policy.drag({
            phase: event.phase,
            surface: event.surface,
            movement: event.movement,
          });
          changed(owner, result);
        },
        dispose() {
          if (owner.disposed) return;
          owner.disposed = true;
          owners.delete(owner);
          changeRuntimeResource("selectionOwners", -1);
          if (activeOwner === owner) activeOwner = null;
          if (owner.target && ownerByTarget.get(owner.target) === owner) {
            ownerByTarget.delete(owner.target);
          }
          owner.target = null;
          owner.policy.accept(null);
          owner.displayedSnapshot = null;
          owner.displayedRange = null;
          owner.stateRef.value = INACTIVE;
          options.requestPaint();
        },
      } satisfies InternalTextSelectionRegistration;
    },
    beginFrame() {
      if (disposed || !surfaceAvailable) return undefined;
      if (activeFrame) throw new Error("A text selection paint frame is already active");
      const frameOwners = new Map<object, FrameOwner>();
      for (const owner of owners) {
        if (!owner.active || !owner.target || owner.disposed) continue;
        const target = Object.freeze({ key: owner.key, node: owner.target });
        frameOwners.set(owner.key, {
          owner,
          target,
          previousSnapshot: owner.policy.snapshot,
          intendedRange: owner.policy.range,
          intentRevision: owner.intentRevision,
          trace: null,
          recorded: false,
          candidate: null,
          projectedRange: null,
        });
      }
      let settled = false;
      const settle = (): boolean => {
        if (settled) return false;
        settled = true;
        if (activeFrame === frame) activeFrame = null;
        return true;
      };
      const frame: InternalSelectionPaintFrame = {
        targetsFor(node) {
          return [...frameOwners.values()]
            .filter((candidate) => inSubtree(candidate.target.node, node))
            .map((candidate) => candidate.target);
        },
        record(target, trace) {
          const candidate = frameOwners.get(target.key);
          if (!candidate || candidate.target !== target) return;
          candidate.recorded = true;
          candidate.trace = trace;
        },
        prepare(target, snapshot) {
          const candidate = frameOwners.get(target.key);
          if (
            !candidate ||
            candidate.target !== target ||
            !candidate.recorded ||
            !candidate.trace
          ) {
            return null;
          }
          candidate.candidate = snapshot;
          candidate.projectedRange = projectInternalSelectionRange(
            candidate.previousSnapshot,
            snapshot,
            candidate.intendedRange,
          );
          return candidate.projectedRange;
        },
        accept() {
          if (!settle()) return;
          for (const candidate of frameOwners.values()) {
            const { owner } = candidate;
            if (!owner.active || owner.disposed || owner.target !== candidate.target.node) continue;
            if (!candidate.recorded || !candidate.candidate) {
              owner.policy.accept(null);
              owner.displayedSnapshot = null;
              owner.displayedRange = null;
              owner.mapping = "unavailable";
            } else {
              owner.displayedSnapshot = candidate.candidate;
              owner.displayedRange = candidate.projectedRange;
              owner.mapping = "ready";
              owner.policy.accept(candidate.candidate);
            }
            refresh(owner);
            if (
              owner.intentRevision !== candidate.intentRevision ||
              !rangesEqual(owner.policy.range, candidate.projectedRange)
            ) {
              options.requestPaint();
            }
          }
        },
        discard() {
          if (!settle()) return;
          for (const candidate of frameOwners.values()) {
            if (!candidate.owner.disposed) refresh(candidate.owner);
          }
        },
      };
      activeFrame = frame;
      return frame;
    },
    setSurfaceAvailable(available, availabilityOptions = {}) {
      if (disposed) return;
      surfaceAvailable = available;
      suspended = availabilityOptions.suspended === true;
      for (const owner of owners) refresh(owner);
      if (available) options.requestPaint();
    },
    invalidateSurface() {
      if (disposed || !surfaceAvailable) return;
      for (const owner of owners) {
        if (!owner.disposed && owner.active && owner.target) {
          owner.mapping = "pending";
          refresh(owner);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      activeFrame = null;
      changeRuntimeResource("selectionOwners", -owners.size);
      for (const owner of owners) {
        owner.disposed = true;
        owner.target = null;
        owner.policy.accept(null);
        owner.displayedSnapshot = null;
        owner.displayedRange = null;
        owner.stateRef.value = INACTIVE;
      }
      owners.clear();
      ownerByTarget.clear();
      activeOwner = null;
    },
  };

  return controller;
}
