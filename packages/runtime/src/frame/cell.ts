import { defaultStyle, type Style } from "./style.ts";

/** The semantically relevant parts of an OSC 8 hyperlink. */
export interface Hyperlink {
  readonly parameters: string;
  readonly target: string;
}

/** One terminal cell: its grapheme, displayed width, inline style, and optional OSC 8 link. */
export interface Cell {
  readonly grapheme: string;
  /**
   * The columns the grapheme displays. Inside a {@link Frame} a `0` marks the
   * trailing half of a wide grapheme and carries no grapheme of its own, so a
   * grapheme that displays nothing still enters a frame claiming its one column.
   */
  readonly width: number;
  readonly style: Style;
  readonly link: Hyperlink | undefined;
}

/** Shared baseline used for every unpainted cell. */
export const blankCell: Cell = Object.freeze({
  grapheme: " ",
  width: 1,
  style: defaultStyle,
  link: undefined,
});
