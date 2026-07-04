/** A single cell value in a table data row. */
type Scalar = string | number | boolean | null | undefined;

/** A dictionary of scalar values representing one row of table data. */
type ScalarDict = Record<string, Scalar>;

/** Alignment of cell content within a table column. */
type ColumnAlign = "left" | "center" | "right";

/** Configuration for a single table column. */
interface ColumnConfig {
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

export interface TableProps {
  data: ScalarDict[];
  columns?: ColumnConfig[];
  padding?: number;
}
