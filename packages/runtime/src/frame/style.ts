/** One terminal color stored independently from its ANSI encoding. */
export type Color =
  | { readonly kind: "default" }
  | { readonly kind: "ansi16"; readonly index: number }
  | { readonly kind: "ansi256"; readonly index: number }
  | { readonly kind: "rgb"; readonly red: number; readonly green: number; readonly blue: number };

/** One active authored SGR sequence and the sequence that ends it. */
export interface SgrPair {
  readonly code: string;
  readonly endCode: string;
}

/** SGR attributes Runtime currently carries through Text content. */
export const StyleAttribute = {
  bold: 1 << 0,
  dim: 1 << 1,
  italic: 1 << 2,
  underline: 1 << 3,
  blink: 1 << 4,
  rapidBlink: 1 << 5,
  inverse: 1 << 6,
  conceal: 1 << 7,
  strikethrough: 1 << 8,
  overline: 1 << 9,
} as const;

/** Inline visual state for one cell. */
export interface Style {
  readonly foreground: Color;
  readonly background: Color;
  readonly attrs: number;
  readonly extraSgr: readonly SgrPair[];
}

export const defaultColor: Color = Object.freeze({ kind: "default" });
export const noExtraSgr: readonly SgrPair[] = Object.freeze([]);

export const defaultStyle: Style = Object.freeze({
  foreground: defaultColor,
  background: defaultColor,
  attrs: 0,
  extraSgr: noExtraSgr,
});
