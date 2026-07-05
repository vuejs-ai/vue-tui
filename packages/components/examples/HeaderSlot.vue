<template>
  <Table :data="rows" :columns="columns">
    <template #header="{ text }">
      <!-- Custom header: left-align text, add column index badge -->
      <Text color="magenta" bold>{{ text }}</Text>
    </template>
  </Table>
</template>

<script setup lang="ts">
import { Text } from "@vue-tui/runtime";
import { Table, defineTableColumns } from "@vue-tui/components";

// `header` slot demo: customize header cell rendering.
// The slot receives { text, column, columnIndex, width } props.
// Without this slot, headers render as bold blue text (or via formatter).

const rows = [
  { city: "New York", population: 8_336_000 },
  { city: "London", population: 8_982_000 },
  { city: "Tokyo", population: 13_960_000 },
];

const columns = defineTableColumns([
  { label: "City", key: "city" },
  { label: "Population", key: "population", align: "right" },
]);
</script>
