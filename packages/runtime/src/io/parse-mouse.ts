const SGR_MOUSE_INPUT = /^\x1b?\[<(\d+);(\d+);(\d+)([mM])$/;
const SHIFT_MASK = 4;
const META_MASK = 8;
const CTRL_MASK = 16;
const MODIFIER_MASK = SHIFT_MASK | META_MASK | CTRL_MASK;
const WHEEL_UP = 64;
const WHEEL_DOWN = 65;

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

export function parseMouseInput(input: string): MouseInputEvent | undefined {
  const sequence = parseSgrMouseSequence(input);
  if (!sequence || sequence.final !== "M") return undefined;

  const baseButton = sequence.button & ~MODIFIER_MASK;
  if (baseButton !== WHEEL_UP && baseButton !== WHEEL_DOWN) return undefined;

  return {
    type: "wheel",
    direction: baseButton === WHEEL_UP ? "up" : "down",
    x: sequence.x,
    y: sequence.y,
    shift: Boolean(sequence.button & SHIFT_MASK),
    meta: Boolean(sequence.button & META_MASK),
    ctrl: Boolean(sequence.button & CTRL_MASK),
  };
}
