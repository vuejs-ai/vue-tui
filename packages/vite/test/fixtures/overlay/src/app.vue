<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted } from "vue";
import { Box, Text } from "@vue-tui/runtime";
const count = shallowRef(0);
let t: ReturnType<typeof setInterval>;
onMounted(() => {
  t = setInterval(() => count.value++, 60);
});
onUnmounted(() => clearInterval(t));
</script>
<template>
  <Box borderStyle="round" flexDirection="column">
    <Text bold>LABEL-A</Text>
    <Text>count={{ count }}</Text>
  </Box>
</template>
