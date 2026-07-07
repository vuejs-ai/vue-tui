<script setup lang="ts">
import { useSlots } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import { tableProps, type ColumnConfig, type Scalar, type ScalarDict } from "./table-props.ts";
import { justifyFromAlign } from "./table-utils.ts";
import { useTableColumns } from "./composable/use-table-columns.ts";
import { useTableRows } from "./composable/use-table-rows.ts";

defineOptions({ name: "Table" });
const props = defineProps(tableProps);

// Validate padding: must be a non-negative integer.
if (!Number.isInteger(props.padding) || props.padding < 0) {
  throw new Error(`[Table] padding must be a non-negative integer, got ${props.padding}`);
}

defineSlots<{
  header?: (props: {
    text: string;
    column: ColumnConfig;
    columnIndex: number;
    width: number;
  }) => unknown;
  default?: (props: {
    text: string;
    value: Scalar;
    column: ColumnConfig;
    columnIndex: number;
    width: number;
    row: ScalarDict;
    rowIndex: number;
  }) => unknown;
}>();

const slots = useSlots();
const { tableColumns } = useTableColumns(props, slots);
const { allRows } = useTableRows(tableColumns, props);
</script>

<template>
  <Box flexDirection="column">
    <template v-for="row in allRows" :key="row.key">
      <!-- ===== Border row (top / separator / bottom) ===== -->
      <Box v-if="row.type === 'border'" flexDirection="row">
        <!-- Left edge -->
        <Text bold>{{ row.left }}</Text>

        <!-- Columns with interspersed crosses -->
        <template v-for="(column, idx) in tableColumns" :key="`${row.key}-line-${idx}`">
          <Text bold>{{ row.line.repeat(column.width) }}</Text>
          <Text v-if="idx < tableColumns.length - 1" bold>{{ row.cross }}</Text>
        </template>

        <!-- Right edge -->
        <Text bold>{{ row.right }}</Text>
      </Box>

      <!-- ===== Content row (header / data) ===== -->
      <Box v-else flexDirection="row">
        <!-- Left border -->
        <Text bold>│</Text>

        <!-- Cells with interspersed separators -->
        <template v-for="(cell, idx) in row.cells" :key="`${row.key}-cell-${idx}`">
          <!-- Header cell -->
          <Box
            v-if="cell.type === 'header'"
            :width="cell.column.width"
            :paddingX="props.padding"
            :justifyContent="justifyFromAlign(cell.column.align)"
          >
            <slot
              name="header"
              :text="cell.rawText"
              :column="cell.column.config"
              :column-index="cell.columnIndex"
              :width="cell.column.width"
            >
              <Text v-if="cell.hasHeaderFormatter" :color="cell.headerColor">{{
                cell.rawText
              }}</Text>
              <Text v-else bold :color="cell.headerColor ?? 'blue'">{{ cell.rawText }}</Text>
            </slot>
          </Box>

          <!-- Data cell (default slot) -->
          <Box
            v-else
            :width="cell.column.width"
            :paddingX="props.padding"
            :justifyContent="justifyFromAlign(cell.column.align)"
          >
            <slot
              :text="cell.rawText"
              :value="cell.value"
              :column="cell.column.config"
              :column-index="cell.columnIndex"
              :width="cell.column.width"
              :row="cell.row"
              :row-index="cell.rowIndex"
            >
              <Text>{{ cell.rawText }}</Text>
            </slot>
          </Box>

          <!-- Separator between cells (skip after last) -->
          <Text v-if="idx < row.cells.length - 1" bold>│</Text>
        </template>

        <!-- Right border -->
        <Text bold>│</Text>
      </Box>
    </template>
  </Box>
</template>
