import { computed, type ComputedRef } from "vue";
import type { ScalarDict } from "../table-props.ts";
import type { Column, RowCell, ContentRow, BorderRow, TableRow } from "../table-types.ts";
import { padCell, getRowKey, BORDER_CHARS } from "../table-utils.ts";

export interface UseTableRowsProps {
  data: ScalarDict[];
  padding: number;
}

export interface UseTableRowsReturn {
  allRows: ComputedRef<TableRow[]>;
}

export function useTableRows(
  tableColumns: ComputedRef<Column[]>,
  props: UseTableRowsProps,
): UseTableRowsReturn {
  const headerCells = computed<RowCell[]>(() =>
    tableColumns.value.map((column, columnIndex) => {
      const hasHeaderFormatter = column.config.headerFormatter != null;
      const rawText = hasHeaderFormatter
        ? column.config.headerFormatter!(column.config)
        : column.config.label;
      const text = padCell(rawText, column.width, column.align, props.padding);

      return {
        type: "header" as const,
        text,
        rawText,
        hasHeaderFormatter,
        headerColor: column.config.headerColor,
        column,
        columnIndex,
      };
    }),
  );

  const dataRows = computed<RowCell[][]>(() =>
    props.data.map((row, rowIndex) =>
      tableColumns.value.map((column, columnIndex) => {
        const value = row[column.key];

        if (value === undefined || value === null) {
          return {
            type: "data" as const,
            text: " ".repeat(column.width),
            rawText: "",
            value,
            column,
            columnIndex,
            row,
            rowIndex,
          };
        }

        // Strip newlines so multi-line values don't break the single-line row layout.
        const stringValue = String(value).replace(/\n/g, "");
        const text = padCell(stringValue, column.width, column.align, props.padding);

        return {
          type: "data" as const,
          text,
          rawText: stringValue,
          value,
          column,
          columnIndex,
          row,
          rowIndex,
        };
      }),
    ),
  );

  const allRows = computed<TableRow[]>(() => [
    // --- top border ---
    {
      type: "border",
      kind: "top",
      key: "top",
      ...BORDER_CHARS.top,
    } as BorderRow,

    // --- header ---
    {
      type: "content",
      kind: "header",
      key: "header",
      cells: headerCells.value,
    } as ContentRow,

    // --- data rows (each with a separator above) ---
    ...dataRows.value.flatMap((cells, rowIndex): TableRow[] => {
      const rowKey = getRowKey(props.data[rowIndex], rowIndex);
      return [
        {
          type: "border",
          kind: "separator",
          key: `separator-${rowKey}`,
          ...BORDER_CHARS.separator,
        } as BorderRow,
        {
          type: "content",
          kind: "data",
          key: `data-${rowKey}`,
          cells,
        } as ContentRow,
      ];
    }),

    // --- bottom border ---
    {
      type: "border",
      kind: "bottom",
      key: "bottom",
      ...BORDER_CHARS.bottom,
    } as BorderRow,
  ]);

  return { allRows };
}
