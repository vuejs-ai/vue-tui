<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";
import Counter from "./counter.vue";
import Clock from "./clock.vue";

const showClock = shallowRef(true);

useInput((event) => {
  if (event.kind !== "text") return "continue";
  if (event.text === "c") {
    showClock.value = !showClock.value;
    return "consume";
  }
  if (event.text === "q") {
    process.exit(0);
    return "consume";
  }
  return "continue";
});
</script>

<template>
  <Box flexDirection="column" backgroundColor="blue" borderStyle="round" width="20">
    <Text bold color="cyan">vue-tui basic (template)</Text>
    <Text dimColor>Try editing counter.vue or app.vue</Text>
    <Text dimColor>Press c=toggle clock, q=quit</Text>
    <Text> </Text>
    <Counter />
    <Clock v-if="showClock" />
  </Box>
</template>
