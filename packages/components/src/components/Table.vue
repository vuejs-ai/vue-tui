<template>
  <Box flexDirection="column">
    <template v-for="row in allRows" :key="row.key">
      <!-- ===== Border row (top / separator / bottom) ===== -->
      <Box v-if="row.type === 'border'" flexDirection="row">
        <!-- Left edge -->
        <slot name="skeleton" :text="row.left" :kind="row.kind" :part="'left'">
          <Text bold>{{ row.left }}</Text>
        </slot>

        <!-- Columns with interspersed crosses -->
        <template v-for="(column, idx) in tableColumns" :key="`${row.key}-line-${idx}`">
          <slot
            name="skeleton"
            :text="row.line.repeat(column.width)"
            :kind="row.kind"
            :part="'line'"
          >
            <Text bold>{{ row.line.repeat(column.width) }}</Text>
          </slot>
          <slot
            v-if="idx < tableColumns.length - 1"
            name="skeleton"
            :text="row.cross"
            :kind="row.kind"
            :part="'cross'"
          >
            <Text bold>{{ row.cross }}</Text>
          </slot>
        </template>

        <!-- Right edge -->
        <slot name="skeleton" :text="row.right" :kind="row.kind" :part="'right'">
          <Text bold>{{ row.right }}</Text>
        </slot>
      </Box>

      <!-- ===== Content row (header / data) ===== -->
      <Box v-else flexDirection="row">
        <!-- Left border -->
        <slot name="skeleton" :text="'|'" :kind="row.kind" :part="'left'">
          <Text bold>|</Text>
        </slot>

        <!-- Cells with interspersed separators -->
        <template v-for="(cell, idx) in row.cells" :key="`${row.key}-cell-${idx}`">
          <!-- Header cell -->
          <slot
            v-if="cell.type === 'header'"
            name="header"
            :text="cell.text"
            :column="cell.column.column"
            :column-index="cell.columnIndex"
            :width="cell.column.width"
          >
            <Text bold color="blue">{{ cell.text }}</Text>
          </slot>

          <!-- Data cell -->
          <slot
            v-else
            name="cell"
            :text="cell.text"
            :value="cell.value"
            :column="cell.column.column"
            :column-index="cell.columnIndex"
            :width="cell.column.width"
            :row="cell.row"
            :row-index="cell.rowIndex"
          >
            <Text>{{ cell.text }}</Text>
          </slot>

          <!-- Separator between cells (skip after last) -->
          <slot
            v-if="idx < row.cells.length - 1"
            name="skeleton"
            :text="'|'"
            :kind="row.kind"
            :part="'cross'"
          >
            <Text bold>|</Text>
          </slot>
        </template>

        <!-- Right border -->
        <slot name="skeleton" :text="'|'" :kind="row.kind" :part="'right'">
          <Text bold>|</Text>
        </slot>
      </Box>
    </template>
  </Box>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import type { Scalar, ScalarDict } from "../types.ts";

// =========================================================================
// Internal types
// =========================================================================

type Column = {
  key: string;
  column: string;
  width: number;
};

type SkeletonKind = "top" | "header" | "separator" | "data" | "bottom";

type RowCell =
  | {
      type: "header";
      text: string;
      column: Column;
      columnIndex: number;
    }
  | {
      type: "data";
      text: string;
      value: Scalar;
      column: Column;
      columnIndex: number;
      row: ScalarDict;
      rowIndex: number;
    };

type BorderRow = {
  type: "border";
  kind: SkeletonKind;
  key: string;
  left: string;
  line: string;
  cross: string;
  right: string;
};

type ContentRow = {
  type: "content";
  kind: SkeletonKind;
  key: string;
  cells: RowCell[];
};

type TableRow = BorderRow | ContentRow;

// =========================================================================
// Props
// =========================================================================

const props = withDefaults(
  defineProps<{
    data: ScalarDict[];
    columns?: string[];
    padding?: number;
  }>(),
  {
    padding: 1,
  },
);

// =========================================================================
// Helpers
// =========================================================================

function getDataKeys(data: ScalarDict[]): string[] {
  const keys = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

function getRowKey(row: ScalarDict, index: number): string {
  const summary = Object.keys(row)
    .sort()
    .map((key) => `${key}:${String(row[key])}`)
    .join("|");
  return `row-${index}-${summary}`;
}

// =========================================================================
// Computed: column definitions
// =========================================================================

const resolvedColumns = computed(() => props.columns ?? getDataKeys(props.data));

const tableColumns = computed<Column[]>(() =>
  resolvedColumns.value.map((key) => {
    const headerWidth = String(key).length;
    const dataWidths = props.data.map((row) => {
      const value = row[key];
      return value === undefined || value === null ? 0 : String(value).length;
    });

    return {
      column: key,
      key,
      width: Math.max(headerWidth, ...dataWidths) + props.padding * 2,
    };
  }),
);

// =========================================================================
// Computed: cells
// =========================================================================

const headerCells = computed<RowCell[]>(() =>
  tableColumns.value.map((column, columnIndex) => ({
    type: "header" as const,
    text: `${" ".repeat(props.padding)}${column.column}${" ".repeat(
      column.width - column.column.length - props.padding,
    )}`,
    column,
    columnIndex,
  })),
);

const dataRows = computed<RowCell[][]>(() =>
  props.data.map((row, rowIndex) =>
    tableColumns.value.map((column, columnIndex) => {
      const value = row[column.column];

      if (value === undefined || value === null) {
        return {
          type: "data" as const,
          text: " ".repeat(column.width),
          value,
          column,
          columnIndex,
          row,
          rowIndex,
        };
      }

      const stringValue = String(value);
      const rightPadding = column.width - stringValue.length - props.padding;

      return {
        type: "data" as const,
        text: `${" ".repeat(props.padding)}${stringValue}${" ".repeat(rightPadding)}`,
        value,
        column,
        columnIndex,
        row,
        rowIndex,
      };
    }),
  ),
);

// =========================================================================
// Computed: flat row list for the template to iterate
// =========================================================================

const BORDER_CHARS = { left: "+", line: "-", cross: "+", right: "+" } as const;

const allRows = computed<TableRow[]>(() => [
  // --- top border ---
  {
    type: "border",
    kind: "top",
    key: "top",
    ...BORDER_CHARS,
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
        ...BORDER_CHARS,
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
    ...BORDER_CHARS,
  } as BorderRow,
]);
</script>
