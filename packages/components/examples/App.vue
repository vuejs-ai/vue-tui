<template>
  <Table :data="rows" :columns="columns"> </Table>
</template>

<script setup lang="ts">
import { Table, defineColumns } from "@vue-tui/components";
const rows = [{ name: "Michael Jackson", age: 18 }];
const columns = defineColumns([
  {
    label: "姓名",
    key: "name",
    align: "center",
  },
  {
    label: "年龄",
    key: "age",
  },
]);
</script>
