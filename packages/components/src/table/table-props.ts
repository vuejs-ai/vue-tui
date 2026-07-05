import type { ExtractPublicPropTypes, PropType } from "vue";

/** A single cell value in a table data row. */
export type Scalar = string | number | boolean | null | undefined;

/** A dictionary of scalar values representing one row of table data. */
export type ScalarDict = Record<string, Scalar>;

/** Alignment of cell content within a table column. */
export type ColumnAlign = "left" | "center" | "right";

/** Configuration for a single table column. */
export interface ColumnConfig {
  /** Display name shown in the header row. */
  label: string;
  /** Key used to look up values from each data row. */
  key: string;
  /** Horizontal alignment of cell content. Defaults to `"left"`. */
  align?: ColumnAlign;
  /**
   * Optional formatter that receives this column's config and returns a
   * formatted string. Applied to header text (replacing the default bold-blue
   * rendering) and to each data cell's string value.
   */
  formatter?: (column: ColumnConfig) => string;
  /**
   * Color of the header text. Overrides the default blue.
   * Has no effect when the `header` slot is used.
   */
  headerColor?: string;
}

export const tableProps = {
  /** Array of data objects, one per row. */
  data: {
    type: Array as PropType<ScalarDict[]>,
    required: true as const,
  },
  /** Optional column configuration. Auto-derived from data keys when omitted. */
  columns: { type: Array as PropType<ColumnConfig[]> },
  /** Horizontal padding (in spaces) on each side of every cell. */
  padding: { type: Number, default: 1 },
};

/** Props accepted by `<Table>`. */
export type TableProps = ExtractPublicPropTypes<typeof tableProps>;

/**
 * Helper to define column configs with full type-checking.
 * Enables excess property checking so typos like `align2` are caught early,
 * and lets `align` work without `as const`.
 */
export function defineTableColumns(cols: ColumnConfig[]): ColumnConfig[] {
  return cols;
}
