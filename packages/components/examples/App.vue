<template>
  <Box flexDirection="column">
    <Text bold color="green">=== Table Component Demos ===</Text>
    <Text> </Text>

    <Text bold underline>1. data prop — auto-derived columns from data keys</Text>
    <DataProp />
    <Text> </Text>

    <Text bold underline>2. columns prop — explicit labels, alignment &amp; formatter</Text>
    <ColumnsProp />
    <Text> </Text>

    <Text bold underline>3. padding prop — cell horizontal padding (1 vs 4)</Text>
    <PaddingProp />
    <Text> </Text>

    <Text bold underline>4. skeleton slot — custom border colors</Text>
    <SkeletonSlot />
    <Text> </Text>

    <Text bold underline>5. header slot — custom header cell rendering</Text>
    <HeaderSlot />
    <Text> </Text>

    <Text bold underline>6. cell slot — custom data cell rendering (typed colors)</Text>
    <CellSlot />
  </Box>
</template>

<script setup lang="ts">
import { Box, Text } from "@vue-tui/runtime";
import CellSlot from "./CellSlot.vue";
import ColumnsProp from "./ColumnsProp.vue";
import DataProp from "./DataProp.vue";
import HeaderSlot from "./HeaderSlot.vue";
import PaddingProp from "./PaddingProp.vue";
import SkeletonSlot from "./SkeletonSlot.vue";
</script>
