import type { ExtractPublicPropTypes, PropType } from "vue";

/** A single cell value in a table data row. */
export type Scalar = string | number | boolean | null | undefined;

/** A dictionary of scalar values representing one row of table data. */
export type ScalarDict = Record<string, Scalar>;

/** Alignment of cell content within a table column. */
export type ColumnAlign = "left" | "center" | "right";

/**
 * Subset of column config fields visible to a `headerFormatter` callback.
 * Separated from `ColumnConfig` so the callback type doesn't cause
 * self-referential generic variance issues.
 */
export interface ColumnConfigBase {
  /** Display name shown in the header row. */
  label: string;
  /** Key used to look up values from each data row. */
  key: string;
  /** Horizontal alignment of cell content. Defaults to `"left"`. */
  align?: ColumnAlign;
  /**
   * Color of the header text. Overrides the default blue.
   * Has no effect when the `header` slot is used.
   */
  headerColor?: string;
}

/**
 * Configuration for a single table column.
 *
 * Non-generic by design — the `key` field is always `string`. Row-type-specific
 * key narrowing is applied at the `TableProps` / `defineTableColumns` level via
 * intersection (`ColumnConfig & { key: keyof T & string }`), which avoids the
 * invariance trap that a generic `ColumnConfig<T>` with `key: keyof T` creates.
 */
export interface ColumnConfig extends ColumnConfigBase {
  /**
   * Optional formatter that receives this column's config and returns a
   * formatted string. Applied to header text only, replacing the default
   * bold-blue rendering.
   */
  headerFormatter?: (column: ColumnConfigBase) => string;
}

export const tableProps = {
  /** Array of data objects, one per row. */
  data: {
    type: Array as PropType<ScalarDict[]>,
    required: true as const,
  },
  /**
   * Optional column configuration. Auto-derived from data keys when omitted.
   * Accepts anything structurally compatible with `ColumnConfig` — the SFC
   * treats the `key` field as `string` internally, so `ColumnConfigTyped<T>`
   * (where `key` is narrowed to `keyof T`) is assignable here.
   */
  columns: { type: Array as PropType<ColumnConfig[]> },
  /** Horizontal padding (in spaces) on each side of every cell. */
  padding: { type: Number, default: 1 },
};

type TableBaseProps = ExtractPublicPropTypes<Omit<typeof tableProps, "data" | "columns">>;

/** Column config narrowed to the concrete row type `T`. */
export type ColumnConfigTyped<T> = ColumnConfig & { key: keyof T & string };

/**
 * Props accepted by `<Table>`.
 *
 * Generic over the row type `T` so `data: T[]` flows into scoped slots
 * (`row`, `value`, `column`). Defaults to `ScalarDict` for untyped usage.
 */
export type TableProps<T = ScalarDict> = TableBaseProps & {
  data: T[];
  columns?: ColumnConfigTyped<T>[];
};

/** Props a `<Table>` default scoped slot receives per data cell. */
export interface TableDefaultSlotProps<T = ScalarDict> {
  /** Already-padded cell text. */
  text: string;
  /** Raw cell value from the data row. */
  value: T[keyof T];
  /** Column configuration for this cell. */
  column: ColumnConfigTyped<T>;
  /** Zero-based column index. */
  columnIndex: number;
  /** Computed column width in characters. */
  width: number;
  /** The full data row object. */
  row: T;
  /** Zero-based row index. */
  rowIndex: number;
}

/** Props a `<Table>` header scoped slot receives per header cell. */
export interface TableHeaderSlotProps<T = ScalarDict> {
  /** Already-padded, already-formatted header text. */
  text: string;
  /** Column configuration for this header. */
  column: ColumnConfigTyped<T>;
  /** Zero-based column index. */
  columnIndex: number;
  /** Computed column width in characters. */
  width: number;
}

/**
 * Helper to define column configs with full type-checking.
 *
 * Enables excess property checking so typos like `align2` are caught early,
 * and lets `align` work without `as const`. Generic over the row type `T`
 * so keys are constrained to actual data keys.
 */
export function defineTableColumns<T = ScalarDict>(
  cols: ColumnConfigTyped<T>[],
): ColumnConfigTyped<T>[] {
  return cols;
}
