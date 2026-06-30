const SGR_MOUSE_INPUT = /^\x1b?\[<(\d+);(\d+);(\d+)([mM])$/;
const SHIFT_MASK = 4;
const META_MASK = 8;
const CTRL_MASK = 16;
const MODIFIER_MASK = SHIFT_MASK | META_MASK | CTRL_MASK;
const WHEEL_UP = 64;
const WHEEL_DOWN = 65;

export interface MouseInputEvent {
  readonly type: "wheel";
  readonly direction: "up" | "down";
  readonly x: number;
  readonly y: number;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
}

export function parseMouseInput(input: string): MouseInputEvent | undefined {
  const match = SGR_MOUSE_INPUT.exec(input);
  if (!match) return undefined;

  const button = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const final = match[4];
  if (final !== "M" || x < 1 || y < 1) return undefined;

  const baseButton = button & ~MODIFIER_MASK;
  if (baseButton !== WHEEL_UP && baseButton !== WHEEL_DOWN) return undefined;

  return {
    type: "wheel",
    direction: baseButton === WHEEL_UP ? "up" : "down",
    x,
    y,
    shift: Boolean(button & SHIFT_MASK),
    meta: Boolean(button & META_MASK),
    ctrl: Boolean(button & CTRL_MASK),
  };
}
