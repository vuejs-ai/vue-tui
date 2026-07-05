<script setup lang="ts">
import { computed } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import stringWidth from "string-width";
import { tableProps, type ColumnConfig, type Scalar, type ScalarDict } from "./table-props.ts";

defineOptions({ name: "Table" });
const props = defineProps(tableProps);

defineSlots<{
  skeleton?: (props: {
    text: string;
    kind: "top" | "header" | "separator" | "data" | "bottom";
    part: "left" | "line" | "cross" | "right";
  }) => unknown;
  header?: (props: {
    text: string;
    column: ColumnConfig;
    columnIndex: number;
    width: number;
  }) => unknown;
  cell?: (props: {
    text: string;
    value: Scalar;
    column: ColumnConfig;
    columnIndex: number;
    width: number;
    row: ScalarDict;
    rowIndex: number;
  }) => unknown;
}>();

// =========================================================================
// Internal types
// =========================================================================

type Column = {
  key: string;
  config: ColumnConfig;
  width: number;
  align: string;
};

type SkeletonKind = "top" | "header" | "separator" | "data" | "bottom";

type RowCell =
  | {
      type: "header";
      text: string;
      /** Whether the header text comes from a user-provided formatter. */
      hasFormatter: boolean;
      /** Column-level header color override (undefined = use default blue). */
      headerColor: string | undefined;
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
// Helpers
// =========================================================================

function getDataKeys(data: ScalarDict[]): ColumnConfig[] {
  const keys = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return Array.from(keys).map((key) => ({ label: key, key }));
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
  resolvedColumns.value.map((config) => {
    const headerText = config.formatter ? config.formatter(config) : config.label;
    const headerWidth = stringWidth(headerText);
    const dataWidths = props.data.map((row) => {
      const value = row[config.key];
      return value === undefined || value === null ? 0 : stringWidth(String(value));
    });

    return {
      config,
      key: config.key,
      width: Math.max(headerWidth, ...dataWidths) + props.padding * 2,
      align: config.align ?? "left",
    };
  }),
);

// =========================================================================
// Helpers (continued)
// =========================================================================

/**
 * Pad `text` inside a cell of `width` according to `align`, with at least
 * `padSize` spaces on the outer edge(s).
 */
function padCell(text: string, width: number, align: string, padSize: number): string {
  const textWidth = stringWidth(text);
  if (align === "left") {
    const rightPad = width - textWidth - padSize;
    return `${" ".repeat(padSize)}${text}${" ".repeat(Math.max(0, rightPad))}`;
  }
  if (align === "center") {
    const totalPad = width - textWidth;
    const leftPad = Math.floor(totalPad / 2);
    const rightPad = totalPad - leftPad;
    return `${" ".repeat(Math.max(0, leftPad))}${text}${" ".repeat(Math.max(0, rightPad))}`;
  }
  // right
  const leftPad = width - textWidth - padSize;
  return `${" ".repeat(Math.max(0, leftPad))}${text}${" ".repeat(padSize)}`;
}

// =========================================================================
// Computed: cells
// =========================================================================

const headerCells = computed<RowCell[]>(() =>
  tableColumns.value.map((column, columnIndex) => {
    const hasFormatter = column.config.formatter != null;
    const rawText = hasFormatter ? column.config.formatter!(column.config) : column.config.label;
    const text = padCell(rawText, column.width, column.align, props.padding);

    return {
      type: "header" as const,
      text,
      hasFormatter,
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
          value,
          column,
          columnIndex,
          row,
          rowIndex,
        };
      }

      const stringValue = String(value);
      const text = padCell(stringValue, column.width, column.align, props.padding);

      return {
        type: "data" as const,
        text,
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

const BORDER_CHARS: Record<
  SkeletonKind,
  { left: string; line: string; cross: string; right: string }
> = {
  top: { left: "┌", line: "─", cross: "┬", right: "┐" },
  separator: { left: "├", line: "─", cross: "┼", right: "┤" },
  bottom: { left: "└", line: "─", cross: "┴", right: "┘" },
  header: { left: "", line: "", cross: "", right: "" },
  data: { left: "", line: "", cross: "", right: "" },
};

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
</script>

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
        <slot name="skeleton" :text="'│'" :kind="row.kind" :part="'left'">
          <Text bold>│</Text>
        </slot>

        <!-- Cells with interspersed separators -->
        <template v-for="(cell, idx) in row.cells" :key="`${row.key}-cell-${idx}`">
          <!-- Header cell -->
          <Box v-if="cell.type === 'header'" :width="cell.column.width">
            <slot
              name="header"
              :text="cell.text"
              :column="cell.column.config"
              :column-index="cell.columnIndex"
              :width="cell.column.width"
            >
              <Text v-if="cell.hasFormatter" :color="cell.headerColor">{{ cell.text }}</Text>
              <Text v-else bold :color="cell.headerColor ?? 'blue'">{{ cell.text }}</Text>
            </slot>
          </Box>

          <!-- Data cell -->
          <Box v-else :width="cell.column.width">
            <slot
              name="cell"
              :text="cell.text"
              :value="cell.value"
              :column="cell.column.config"
              :column-index="cell.columnIndex"
              :width="cell.column.width"
              :row="cell.row"
              :row-index="cell.rowIndex"
            >
              <Text>{{ cell.text }}</Text>
            </slot>
          </Box>

          <!-- Separator between cells (skip after last) -->
          <slot
            v-if="idx < row.cells.length - 1"
            name="skeleton"
            :text="'│'"
            :kind="row.kind"
            :part="'cross'"
          >
            <Text bold>│</Text>
          </slot>
        </template>

        <!-- Right border -->
        <slot name="skeleton" :text="'│'" :kind="row.kind" :part="'right'">
          <Text bold>│</Text>
        </slot>
      </Box>
    </template>
  </Box>
</template>
