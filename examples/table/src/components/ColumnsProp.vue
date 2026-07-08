<template>
  <Table :data="rows" :columns="columns" />
</template>

<script setup lang="ts">
import { Table, defineTableColumns } from "@vue-tui/components";

// `columns` prop demo: explicit column config with custom labels,
// alignment, and a formatter that appends a unit suffix.
const rows = [
  { id: 1, product: "Widget", price: 9.99, stock: 150 },
  { id: 2, product: "Gadget", price: 24.5, stock: 42 },
  { id: 3, product: "Doohickey", price: 3.0, stock: 2000 },
];

const columns = defineTableColumns([
  { label: "#", key: "id", align: "right" as const },
  { label: "Product", key: "product", align: "left" as const },
  { label: "Price", key: "price", align: "right" as const },
  {
    label: "Stock",
    key: "stock",
    align: "right" as const,
    // formatter receives the ColumnConfig and returns the formatted header text;
    // it also applies to each cell value via padCell.
    headerFormatter: (_col) => "Stock (units)",
  },
]);
</script>
