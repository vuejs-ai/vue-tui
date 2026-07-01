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
}

/**
 * Helper to define table columns with strict type-checking on `align` without
 * needing `as const`. TypeScript infers literal types inside the function
 * argument, so `align: "center"` is validated against `ColumnAlign` while
 * `align: "foo"` produces a type error.
 *
 * @example
 * const columns = defineColumns([
 *   { label: "Name", key: "name", align: "center" },
 *   { label: "Age",  key: "age" },
 * ]);
 */
export function defineColumns<const T extends readonly ColumnConfig[]>(columns: T): ColumnConfig[] {
  return columns as unknown as ColumnConfig[];
}
