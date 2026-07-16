import type { ColumnConfig, Scalar, ScalarDict } from "./table-props.ts";

// =========================================================================
// Internal types for the Table component implementation.
// These are NOT part of the public API — consumers should never need them.
// =========================================================================

/** Resolved column with computed width and alignment. */
export type Column = {
  key: string;
  config: ColumnConfig;
  width: number;
  align: string;
};

export type SkeletonKind = "top" | "header" | "separator" | "data" | "bottom";

export type RowCell =
  | {
      type: "header";
      /** Padded header text for the default fallback (fills the full column width). */
      text: string;
      /** Raw (unpadded) header text passed to the slot — consistent with measurement. */
      rawText: string;
      /** Whether the header text comes from a user-provided headerFormatter. */
      hasHeaderFormatter: boolean;
      /** Column-level header color override (undefined = use default blue). */
      headerColor: string | undefined;
      column: Column;
      columnIndex: number;
    }
  | {
      type: "data";
      /** Padded cell text for the default fallback (fills the full column width). */
      text: string;
      /** Raw (unpadded) value string passed to the slot — consistent with measurement. */
      rawText: string;
      value: Scalar;
      column: Column;
      columnIndex: number;
      row: ScalarDict;
      rowIndex: number;
    };

export type BorderRow = {
  type: "border";
  kind: SkeletonKind;
  key: string;
  left: string;
  line: string;
  cross: string;
  right: string;
};

export type ContentRow = {
  type: "content";
  kind: SkeletonKind;
  key: string;
  cells: RowCell[];
};

export type TableRow = BorderRow | ContentRow;
