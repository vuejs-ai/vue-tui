<template>
  <Box flexDirection="column">
    <!-- ================================================================= -->
    <!-- DataProp: auto-derived columns from data keys                      -->
    <!-- ================================================================= -->
    <Text bold>DataProp Demo（自动推导列）:</Text>
    <DataProp />

    <Text> </Text>

    <!-- ================================================================= -->
    <!-- ColumnsProp: explicit column config                                -->
    <!-- ================================================================= -->
    <Text bold>ColumnsProp Demo（显式列配置）:</Text>
    <ColumnsProp />

    <Text> </Text>

    <!-- ================================================================= -->
    <!-- PaddingProp: horizontal cell padding                               -->
    <!-- ================================================================= -->
    <Text bold>PaddingProp Demo（单元格内边距）:</Text>
    <PaddingProp />

    <Text> </Text>

    <!-- ================================================================= -->
    <!-- HeaderSlot: custom header rendering                                -->
    <!-- ================================================================= -->
    <Text bold>HeaderSlot Demo（自定义表头插槽）:</Text>
    <HeaderSlot />

    <Text> </Text>

    <!-- ================================================================= -->
    <!-- CellSlot: custom data cell rendering via default slot              -->
    <!-- ================================================================= -->
    <Text bold>CellSlot Demo（自定义单元格插槽）:</Text>
    <CellSlot />
  </Box>
</template>

<script setup lang="ts">
import { Box, Text } from "@vue-tui/runtime";
import CellSlot from "./components/CellSlot.vue";
import ColumnsProp from "./components/ColumnsProp.vue";
import DataProp from "./components/DataProp.vue";
import HeaderSlot from "./components/HeaderSlot.vue";
import PaddingProp from "./components/PaddingProp.vue";
</script>
