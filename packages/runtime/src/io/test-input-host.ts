import type { NormalizedInputFact } from "./normalized-input.ts";
import type { SgrMouseButton, SgrMouseEvent } from "./parse-mouse.ts";

export interface InternalTestMouseModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
}

interface InternalTestMousePoint {
  /** Zero-based modeled surface column. */
  readonly x: number;
  /** Zero-based modeled surface row. */
  readonly y: number;
}

export type InternalTestMouseEvent =
  | (InternalTestMousePoint & {
      readonly type: "down" | "up" | "drag";
      readonly button: SgrMouseButton;
      readonly modifiers: InternalTestMouseModifiers;
    })
  | (InternalTestMousePoint & {
      readonly type: "wheel";
      readonly direction: "up" | "down" | "left" | "right";
      readonly modifiers: InternalTestMouseModifiers;
    });

export interface InternalTestInputHost {
  /** The deterministic host deliberately models the selected SGR profile. */
  readonly supportsMouse: true;
  bind(inject: (event: InternalTestMouseEvent) => void): () => void;
  onMouseReportingChange(level: "button" | "drag" | undefined): void;
}

export const INTERNAL_TEST_INPUT_HOST: unique symbol = Symbol("vue-tui:test-input-host");

function buttonCode(button: SgrMouseButton): number {
  switch (button) {
    case "left":
      return 0;
    case "middle":
      return 1;
    case "right":
      return 2;
  }
}

function wheelCode(
  direction: Extract<InternalTestMouseEvent, { type: "wheel" }>["direction"],
): number {
  switch (direction) {
    case "up":
      return 64;
    case "down":
      return 65;
    case "left":
      return 66;
    case "right":
      return 67;
  }
}

function modifierCode(modifiers: InternalTestMouseModifiers): number {
  return (modifiers.shift ? 4 : 0) | (modifiers.alt ? 8 : 0) | (modifiers.ctrl ? 16 : 0);
}

/** Canonical frozen pointer fact used only by the deterministic application-side ingress seam. */
export function createInternalTestMouseFact(input: InternalTestMouseEvent): NormalizedInputFact {
  const x = input.x + 1;
  const y = input.y + 1;
  const modifiers = Object.freeze({
    shift: input.modifiers.shift,
    alt: input.modifiers.alt,
    ctrl: input.modifiers.ctrl,
    super: false,
    hyper: false,
    meta: false,
    capsLock: false,
    numLock: false,
  });
  const event: SgrMouseEvent =
    input.type === "wheel"
      ? Object.freeze({
          type: "wheel",
          direction: input.direction,
          x,
          y,
          shift: input.modifiers.shift,
          meta: input.modifiers.alt,
          ctrl: input.modifiers.ctrl,
        })
      : Object.freeze({
          type: input.type,
          button: input.button,
          x,
          y,
          shift: input.modifiers.shift,
          meta: input.modifiers.alt,
          ctrl: input.modifiers.ctrl,
        });
  const wireButton =
    (input.type === "wheel" ? wheelCode(input.direction) : buttonCode(input.button)) |
    modifierCode(input.modifiers) |
    (input.type === "drag" ? 32 : 0);
  const final = input.type === "up" ? "m" : "M";
  const sequence = `\x1b[<${wireButton};${x};${y}${final}`;
  return Object.freeze({
    kind: "pointer",
    sequence,
    pointer: Object.freeze({
      protocol: "sgr",
      wireButton,
      x,
      y,
      final,
      modifiers,
      event,
    }),
  });
}
