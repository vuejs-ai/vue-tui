/** A single cell value in a table data row. */
export type Scalar = string | number | boolean | null | undefined;

/** A dictionary of scalar values representing one row of table data. */
export type ScalarDict = Record<string, Scalar>;
