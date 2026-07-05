<template>
  <Table :data="rows" :columns="columns">
    <template #skeleton="{ text, kind }">
      <!-- Color-code borders by kind and render cross/left/right parts differently -->
      <Text
        :color="
          kind === 'top' || kind === 'bottom' ? 'cyan' : kind === 'header' ? 'yellow' : 'green'
        "
        >{{ text }}</Text
      >
    </template>
  </Table>
</template>

<script setup lang="ts">
import { Text } from "@vue-tui/runtime";
import { Table, defineTableColumns } from "@vue-tui/components";

// `skeleton` slot demo: customize border characters.
// The slot receives { text, kind, part } props.
//  - kind: 'top' | 'header' | 'separator' | 'data' | 'bottom'
//  - part: 'left' | 'line' | 'cross' | 'right'

const rows = [
  { name: "Alice", role: "Engineer" },
  { name: "Bob", role: "Designer" },
  { name: "Charlie", role: "Manager" },
];

const columns = defineTableColumns([
  { label: "Name", key: "name" },
  { label: "Role", key: "role" },
]);
</script>
