<template>
  <Box flexDirection="column">
    <Text bold>CellSlot Demo:</Text>
    <CellSlot />

    <!-- <Text> </Text>
    <Text bold>HeaderSlot Demo:</Text>
    <HeaderSlot /> -->
  </Box>
</template>

<script setup lang="ts">
import { Box, Text } from "@vue-tui/runtime";
import CellSlot from "./components/CellSlot.vue";
import HeaderSlot from "./components/HeaderSlot.vue";
</script>

<style lang="scss" scoped></style>
