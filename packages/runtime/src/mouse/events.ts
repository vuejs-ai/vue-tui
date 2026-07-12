/** Which button. String union, deliberately friendlier than DOM's numeric `button`. */
export type MouseButton = "left" | "middle" | "right" | "back" | "forward" | (string & {});

export type TuiMouseEventType =
  | "down"
  | "up"
  | "click"
  | "move"
  | "drag"
  | "dragstart"
  | "dragend"
  | "enter"
  | "leave"
  | (string & {});

export interface MouseTargetRect {
  /** Absolute terminal cell column, 0-based. */
  readonly x: number;
  /** Absolute terminal cell row, 0-based. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MouseTarget {
  /** The target's absolute terminal-cell rectangle from the latest fullscreen frame. */
  readonly rect: MouseTargetRect;
}

interface MouseEventShared {
  /** Button for down/up/click/drag; `null` for move/enter/leave/wheel. */
  readonly button: MouseButton | null;
  /** Buttons currently held. Best-effort because SGR reports one button per event. */
  readonly buttons: ReadonlySet<MouseButton>;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly target: MouseTarget | null;
  readonly currentTarget: MouseTarget | null;
  stopPropagation(): void;
  preventDefault(): void;
  readonly defaultPrevented: boolean;
  readonly detail: number;
}

export interface TuiMouseEvent extends MouseEventShared {
  readonly type: TuiMouseEventType;
  readonly movementX: number;
  readonly movementY: number;
}

export interface TuiWheelEvent extends MouseEventShared {
  readonly type: "wheel";
  readonly button: null;
  readonly deltaX: number;
  readonly deltaY: number;
}

/** v1 mouse handler props. Hover handlers are deliberately absent until mode 1003 ships. */
export interface MouseHandlerProps {
  /**
   * Fires only in `fullscreen` mode. For targeted element mouse events use
   * `app.mount({ mode: "fullscreen" })`; for raw inline mouse input use `useMouseInput()`.
   */
  onMousedown?: (event: TuiMouseEvent) => void;
  /**
   * Fires only in `fullscreen` mode. For targeted element mouse events use
   * `app.mount({ mode: "fullscreen" })`; for raw inline mouse input use `useMouseInput()`.
   */
  onMouseup?: (event: TuiMouseEvent) => void;
  /**
   * Fires only in `fullscreen` mode. For targeted element mouse events use
   * `app.mount({ mode: "fullscreen" })`; for raw inline mouse input use `useMouseInput()`.
   */
  onClick?: (event: TuiMouseEvent) => void;
  /**
   * Fires only in `fullscreen` mode. For targeted element mouse events use
   * `app.mount({ mode: "fullscreen" })`; for raw inline mouse input use `useMouseInput()`.
   */
  onWheel?: (event: TuiWheelEvent) => void;
}

export type MouseHandlerName = keyof MouseHandlerProps;
