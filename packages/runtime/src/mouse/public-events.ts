import type { MaybeRefOrGetter, ShallowRef } from "vue";
import type { CellPoint } from "../element-target.ts";

export type MouseButton = "left" | "middle" | "right";
export type MouseHandlerResult = "continue" | "consume";

export interface CellDelta {
  readonly x: number;
  readonly y: number;
}

export interface MouseModifiers {
  readonly shift: boolean;
  /** The SGR Meta modifier, exposed under the terminal convention users treat as Alt. */
  readonly alt: boolean;
  readonly ctrl: boolean;
}

interface TargetedMouseEventBase {
  /** Whether this registration was the selected target or a registered ancestor. */
  readonly delivery: "target" | "bubble";
  /** Zero-based cell in the accepted Fullscreen render surface. */
  readonly surface: CellPoint;
  /** Zero-based cell local to the registration receiving this callback. */
  readonly local: CellPoint;
  readonly modifiers: MouseModifiers;
}

export interface TuiMouseClickEvent extends TargetedMouseEventBase {
  readonly type: "click";
  readonly button: MouseButton;
}

export interface TuiMouseWheelEvent extends TargetedMouseEventBase {
  readonly type: "wheel";
  /** Signed terminal wheel steps; positive x/y move toward later columns/content. */
  readonly delta: CellDelta;
}

export interface TuiMouseEventMap {
  readonly click: TuiMouseClickEvent;
  readonly wheel: TuiMouseWheelEvent;
}

export type MouseEventHandler<Type extends keyof TuiMouseEventMap> = (
  event: TuiMouseEventMap[Type],
) => MouseHandlerResult;

export type TuiMouseDragEvent =
  | {
      readonly type: "drag";
      readonly phase: "start" | "move" | "end";
      readonly button: "left";
      readonly surface: CellPoint;
      /** Null only while capture places the pointer outside an exact target-local mapping. */
      readonly local: CellPoint | null;
      readonly modifiers: MouseModifiers;
      /** Signed cell delta since the preceding point in this gesture. */
      readonly movement: CellDelta;
    }
  | {
      readonly type: "drag";
      readonly phase: "cancel";
      readonly button: "left";
      readonly reason: "deactivated" | "target-lost" | "suspended";
      readonly surface: CellPoint;
      readonly local: CellPoint | null;
      readonly modifiers: MouseModifiers;
      readonly movement: null;
    };

export type MouseDragHandler = (event: TuiMouseDragEvent) => void;

export interface UseMouseEventOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
}

export interface UseMouseDragOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
}

export interface UseMouseDragReturn {
  readonly isDragging: Readonly<ShallowRef<boolean>>;
}
