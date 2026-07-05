<template>
  <Table :data="rows" :columns="columns">
    <template #cell="{ text, value }">
      <!-- Custom cells: color numbers by sign, dim nulls -->
      <Text
        :color="
          value == null
            ? 'gray'
            : typeof value === 'number'
              ? value >= 0
                ? 'green'
                : 'red'
              : undefined
        "
        :dimColor="value == null"
        >{{ text }}</Text
      >
    </template>
  </Table>
</template>

<script setup lang="ts">
import { Text } from "@vue-tui/runtime";
import { Table } from "@vue-tui/components";

// `cell` slot demo: customize data cell rendering.
// The slot receives { text, value, column, columnIndex, width, row, rowIndex }.
// Here we color numbers (green positive, red negative) and dim null cells.

const rows = [
  { account: "Savings", balance: 5_200 },
  { account: "Checking", balance: -150 },
  { account: "Credit", balance: -2_400 },
  { account: "Closed", balance: null },
];

const columns = [
  { label: "Account", key: "account" },
  { label: "Balance", key: "balance", align: "left" as const },
];
</script>
