const SGR_MOUSE_INPUT = /^\x1b\[<(\d+);(\d+);(\d+)([mM])$/;
const SHIFT_MASK = 4;
const META_MASK = 8;
const CTRL_MASK = 16;
const MODIFIER_MASK = SHIFT_MASK | META_MASK | CTRL_MASK;
const DRAG_MASK = 32;
const WHEEL_UP = 64;
const WHEEL_DOWN = 65;
const WHEEL_LEFT = 66;
const WHEEL_RIGHT = 67;

export type SgrMouseButton = "left" | "middle" | "right";

interface SgrMouseSequence {
  readonly button: number;
  readonly x: number;
  readonly y: number;
  readonly final: "M" | "m";
}

export interface MouseInputEvent {
  readonly type: "wheel";
  readonly direction: "up" | "down";
  readonly x: number;
  readonly y: number;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
}

export interface SgrMouseButtonEvent {
  readonly type: "down" | "up" | "drag";
  readonly button: SgrMouseButton;
  /** 1-based SGR wire coordinate. */
  readonly x: number;
  /** 1-based SGR wire coordinate. */
  readonly y: number;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
}

export interface SgrMouseWheelEvent {
  readonly type: "wheel";
  readonly direction: "up" | "down" | "left" | "right";
  /** 1-based SGR wire coordinate. */
  readonly x: number;
  /** 1-based SGR wire coordinate. */
  readonly y: number;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
}

export type SgrMouseEvent = SgrMouseButtonEvent | SgrMouseWheelEvent;

function parseSgrMouseSequence(input: string): SgrMouseSequence | undefined {
  const match = SGR_MOUSE_INPUT.exec(input);
  if (!match) return undefined;

  const button = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const final = match[4] as "M" | "m";
  if (x < 1 || y < 1) return undefined;

  return { button, x, y, final };
}

export function isSgrMouseInput(input: string): boolean {
  return parseSgrMouseSequence(input) !== undefined;
}

function readModifiers(button: number) {
  return {
    shift: Boolean(button & SHIFT_MASK),
    meta: Boolean(button & META_MASK),
    ctrl: Boolean(button & CTRL_MASK),
  };
}

function decodeButton(button: number): SgrMouseButton | undefined {
  switch (button) {
    case 0:
      return "left";
    case 1:
      return "middle";
    case 2:
      return "right";
    default:
      return undefined;
  }
}

function decodeWheelDirection(button: number): SgrMouseWheelEvent["direction"] | undefined {
  switch (button) {
    case WHEEL_UP:
      return "up";
    case WHEEL_DOWN:
      return "down";
    case WHEEL_LEFT:
      return "left";
    case WHEEL_RIGHT:
      return "right";
    default:
      return undefined;
  }
}

export function parseSgrMouseInput(input: string): SgrMouseEvent | undefined {
  const sequence = parseSgrMouseSequence(input);
  if (!sequence) return undefined;

  const modifiers = readModifiers(sequence.button);

  if (sequence.final === "M") {
    const wheelButton = sequence.button & ~MODIFIER_MASK;
    const wheelDirection = decodeWheelDirection(wheelButton);
    if (wheelDirection) {
      return {
        type: "wheel",
        direction: wheelDirection,
        x: sequence.x,
        y: sequence.y,
        ...modifiers,
      };
    }

    const isDrag = Boolean(sequence.button & DRAG_MASK);
    const button = decodeButton(sequence.button & ~(MODIFIER_MASK | DRAG_MASK));
    if (!button) return undefined;

    return {
      type: isDrag ? "drag" : "down",
      button,
      x: sequence.x,
      y: sequence.y,
      ...modifiers,
    };
  }

  const button = decodeButton(sequence.button & ~(MODIFIER_MASK | DRAG_MASK));
  if (!button) return undefined;

  return {
    type: "up",
    button,
    x: sequence.x,
    y: sequence.y,
    ...modifiers,
  };
}

export function parseMouseInput(input: string): MouseInputEvent | undefined {
  const event = parseSgrMouseInput(input);
  if (!event || event.type !== "wheel") return undefined;
  if (event.direction !== "up" && event.direction !== "down") return undefined;

  return {
    type: "wheel",
    direction: event.direction,
    x: event.x,
    y: event.y,
    shift: event.shift,
    meta: event.meta,
    ctrl: event.ctrl,
  };
}
