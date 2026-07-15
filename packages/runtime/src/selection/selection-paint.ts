import type { TuiText, TuiVirtualText } from "../host/nodes.ts";
import type {
  InternalSelectionCell,
  InternalSelectionRange,
  InternalSelectionSnapshot,
} from "./selection-policy.ts";

export interface InternalSelectionTraceCell extends InternalSelectionCell {
  readonly text: string;
}

export interface InternalTextSelectionTrace {
  readonly text: string;
  readonly boundaries: readonly number[];
  /** Surface translation for the origin-independent document mapping below. */
  readonly surfaceOrigin: { readonly x: number; readonly y: number };
  readonly stops: readonly { readonly offset: number; readonly x: number; readonly y: number }[];
  readonly cells: readonly InternalSelectionTraceCell[];
}

export interface InternalSelectionPaintTarget {
  readonly key: object;
  readonly node: TuiText | TuiVirtualText;
}

export interface InternalSelectionPaintFrame {
  targetsFor(node: TuiText): readonly InternalSelectionPaintTarget[];
  record(target: InternalSelectionPaintTarget, trace: InternalTextSelectionTrace | null): void;
  prepare(
    target: InternalSelectionPaintTarget,
    snapshot: InternalSelectionSnapshot,
  ): InternalSelectionRange | null;
  accept(): void;
  discard(): void;
}
