<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted } from "vue";
import { Box, Text } from "@vue-tui/runtime";

const time = shallowRef(new Date().toLocaleTimeString());
let timer: ReturnType<typeof setInterval>;

onMounted(() => {
  timer = setInterval(() => {
    time.value = new Date().toLocaleTimeString();
  }, 1000);
});

onUnmounted(() => {
  clearInterval(timer);
});
</script>

<template>
  <Box>
    <Text>Clock: </Text>
    <Text bold color="yellow">{{ time }}</Text>
  </Box>
</template>
