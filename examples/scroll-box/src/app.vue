<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted } from "vue";
import { Box, Text, useApp, useInput, useWindowSize } from "@vue-tui/runtime";
import { ScrollBox } from "@vue-tui/components";

const { exit } = useApp();
const { rows } = useWindowSize();

// Streaming log: a new line every ~350ms. ScrollBox sticks to the bottom while
// you're at the bottom; scroll up (wheel / PageUp) and it holds your position
// while new lines keep arriving.
const lines = shallowRef<string[]>([]);
let n = 0;
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    n += 1;
    lines.value = [
      ...lines.value,
      `#${String(n).padStart(3, "0")}  streaming log line — the quick brown fox jumps over the lazy dog`,
    ];
  }, 350);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

useInput((input) => {
  if (input === "q") exit();
});
</script>

<template>
  <Box flexDirection="column" :height="rows">
    <Box borderStyle="round" :paddingX="1">
      <Text bold color="cyan">ScrollBox demo</Text>
      <Text dimColor> — wheel · PageUp/PageDown · q to quit</Text>
    </Box>

    <Box :flexGrow="1" :minHeight="0" flexDirection="column" borderStyle="round" :paddingX="1">
      <ScrollBox wheel keyboard>
        <Text v-for="line in lines" :key="line">{{ line }}</Text>
      </ScrollBox>
    </Box>

    <Box :paddingX="1">
      <Text dimColor>{{ lines.length }} lines · sticks to bottom until you scroll up</Text>
    </Box>
  </Box>
</template>
