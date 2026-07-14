import { inject, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from "vue";
import { resolveTuiNode } from "../host/resolve-node.ts";
import { InternalTextSelectionControllerKey } from "../selection/context.ts";
import type { TextSelectionCommands, TextSelectionMove } from "../selection/public-selection.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";
import { useInternalRenderSession } from "../render-session.ts";
import type { ElementTarget } from "./useElementGeometry.ts";
import { useMouseDrag } from "./use-mouse-drag.ts";
import { useMouseEvent } from "./use-mouse-event.ts";

export interface UseTextSelectionOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
  readonly pointer?: MaybeRefOrGetter<boolean>;
}

const MOVES = new Set<TextSelectionMove>([
  "backward",
  "forward",
  "up",
  "down",
  "line-start",
  "line-end",
  "document-start",
  "document-end",
]);

function readBoolean(
  source: MaybeRefOrGetter<boolean> | undefined,
  fallback: boolean,
  option: string,
): boolean {
  const value = source === undefined ? fallback : toValue(source);
  if (typeof value !== "boolean") {
    throw new TypeError(`useTextSelection() ${option} must resolve to a boolean`);
  }
  return value;
}

export function useTextSelection(
  target: ElementTarget,
  options: UseTextSelectionOptions = {},
): TextSelectionCommands {
  const controller = inject(InternalTextSelectionControllerKey, null);
  if (!controller)
    throw new Error("useTextSelection() must be called inside a vue-tui render tree");
  const session = useInternalRenderSession().session;
  const readActive = () => readBoolean(options.isActive, true, "isActive");
  const readPointer = () => readBoolean(options.pointer, true, "pointer");

  const failInline = (): never => {
    throw new Error("useTextSelection() requires an effective visual Fullscreen render surface");
  };
  const isInline =
    session.host === "live" &&
    session.output.presentation === "visual" &&
    session.mode.effective === "inline";
  if (isInline) {
    if (readActive()) failInline();
    watch(
      readActive,
      (active) => {
        if (active) failInline();
      },
      { flush: "sync" },
    );
  }

  const registration = controller.register(readActive());
  const stopActive = watch(readActive, (active) => registration.setActive(active), {
    flush: "sync",
  });
  const stopTarget = useRenderedTargetRegistration(
    () => (readActive() ? resolveTuiNode(toValue(target)) : null),
    (node) => registration.attach(node),
  );

  if (!isInline) {
    const pointerActive = () => readActive() && readPointer();
    useMouseEvent(target, "click", (event) => registration.click(event), {
      isActive: pointerActive,
    });
    useMouseDrag(target, (event) => registration.drag(event), {
      isActive: pointerActive,
    });
  }

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    stopActive();
    stopTarget();
    registration.dispose();
  };
  onScopeDispose(dispose);

  return Object.freeze({
    state: registration.state,
    move(direction: TextSelectionMove, moveOptions: { readonly extend?: boolean } = {}) {
      if (!MOVES.has(direction)) {
        throw new TypeError("useTextSelection().move() direction is invalid");
      }
      const extend = moveOptions.extend ?? false;
      if (typeof extend !== "boolean") {
        throw new TypeError("useTextSelection().move() extend must be a boolean");
      }
      return registration.move(direction, extend);
    },
    selectAll: () => registration.selectAll(),
    clear: () => registration.clear(),
    copy: () => registration.copy(),
  });
}
