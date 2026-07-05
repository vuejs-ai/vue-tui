<template>
  <Box flexDirection="column">
    <Text>padding=1 (default):</Text>
    <Table :data="rows" :columns="columns" :padding="1" />

    <Text> </Text>

    <Text>padding=4:</Text>
    <Table :data="rows" :columns="columns" :padding="4" />
  </Box>
</template>

<script setup lang="ts">
import { Box, Text } from "@vue-tui/runtime";
import type { ColumnConfig } from "@vue-tui/components";
import { Table } from "@vue-tui/components";

// `padding` prop demo: horizontal padding in spaces added on each
// side of every cell. Larger padding creates wider columns.

const rows = [
  { name: "Alice", score: 95 },
  { name: "Bob", score: 87 },
  { name: "Charlie", score: 100 },
];

const columns: ColumnConfig[] = [
  { label: "Name", key: "name" },
  { label: "Score", key: "score", align: "right" },
];
</script>
