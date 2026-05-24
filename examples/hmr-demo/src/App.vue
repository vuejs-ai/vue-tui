<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";
import Counter from "./Counter.vue";
import Clock from "./Clock.vue";

const title = "HMR Demo";
const hint = "Try editing Counter.vue (HMR) or App.vue (reload)";

const showClock = shallowRef(true);

useInput((input) => {
  if (input === "c") showClock.value = !showClock.value;
  if (input === "q") process.exit(0);
});
</script>

<template>
  <Box flexDirection="column" :paddingX="1">
    <Text bold color="cyan">{{ title }}</Text>
    <Text dimColor>{{ hint }}</Text>
    <Text dimColor>Press c=toggle clock, q=quit</Text>
    <Text> </Text>
    <Counter />
    <Clock v-if="showClock" />
  </Box>
</template>
