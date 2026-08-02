<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

const count = shallowRef(0);

useInput((event) => {
  if (event.type === "key") {
    if (event.key.name === "up") {
      count.value++;
    } else if (event.key.name === "down") {
      count.value--;
    }
  }
});
</script>

<template>
  <Box>
    <Text>Count: </Text>
    <Text bold color="green">{{ count }}</Text>
    <Text dimColor> (↑/↓ to change)</Text>
  </Box>
</template>
