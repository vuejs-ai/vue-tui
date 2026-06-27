<template>
  <Table :data="rows">
    <template #header="{ column }">
      <Text color="yellow" bold>{{ getColumnCnName(column) }}</Text>
    </template>
  </Table>
</template>

<script setup lang="ts">
import { Text } from "@vue-tui/runtime";
import { Table } from "@vue-tui/components";

const rows = [{ name: "黎明", age: 18 }];

const getColumnCnName = (rawKey: string) => {
  if (rawKey === "name") {
    return "姓名";
  }
  if (rawKey === "age") {
    return "年龄";
  }
  return rawKey;
};
</script>
