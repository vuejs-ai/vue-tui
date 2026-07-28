<script setup lang="ts">
import { onUnmounted, shallowRef } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import { emitTestEvent } from "@vue-tui/runtime/internal/testing";

emitTestEvent("app:setup-ran");
const label = "FULLSCREEN-A";
const count = shallowRef(0);
const timer = setInterval(() => {
  count.value += 1;
}, 32);
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <Box flexDirection="column">
    <Text>{{ label }}</Text>
    <Text>count={{ count }}</Text>
    <Text>STABLE-ROW-1</Text>
    <Text>STABLE-ROW-2</Text>
  </Box>
</template>
