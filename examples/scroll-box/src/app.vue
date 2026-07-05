<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted } from "vue";
import { Box, Text, useApp, useInput, useWindowSize } from "@vue-tui/runtime";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";

const { exit } = useApp();
const { rows } = useWindowSize();

const box = shallowRef<ScrollBoxExpose>();

// ScrollBox follows the bottom on its own. It ships no built-in input — this app
// wires its own keys to the exposed handle: ↑/↓ scroll a line, Home/End jump to
// the ends, q quits.
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

useInput((input, key) => {
  if (input === "q") exit();
  else if (key.upArrow) box.value?.scrollByLines(-1);
  else if (key.downArrow) box.value?.scrollByLines(1);
  else if (key.home) box.value?.scrollToTop();
  else if (key.end) box.value?.scrollToBottom();
});
</script>

<template>
  <Box flexDirection="column" :height="rows">
    <Box borderStyle="round" :paddingX="1">
      <Text bold color="cyan">ScrollBox demo</Text>
      <Text dimColor> — ↑/↓ · Home/End · q to quit</Text>
    </Box>

    <Box :flexGrow="1" :minHeight="0" flexDirection="column" borderStyle="round" :paddingX="1">
      <ScrollBox ref="box">
        <Text v-for="line in lines" :key="line">{{ line }}</Text>
      </ScrollBox>
    </Box>

    <Box :paddingX="1">
      <Text dimColor>{{ lines.length }} lines · sticks to bottom until you scroll up</Text>
    </Box>
  </Box>
</template>
