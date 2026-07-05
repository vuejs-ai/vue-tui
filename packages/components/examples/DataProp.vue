<template>
  <Table :data="rows" />
</template>

<script setup lang="ts">
import { Table } from "@vue-tui/components";

// `data` prop demo: auto-derived columns from data keys.
// Columns are discovered by scanning all keys across all rows.
const rows = [
  { name: "Alice", age: 28, active: true },
  { name: "Bob", age: 35, active: false },
  { name: "Charlie", age: 42, active: true },
  { name: "Diana", age: null, active: undefined },
];
</script>
