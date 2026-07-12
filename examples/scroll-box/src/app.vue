<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted } from "vue";
import { Box, Text, useApp, useInput, useLayoutSize } from "@vue-tui/runtime";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";

const { exit } = useApp();
const { rows } = useLayoutSize();

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

useInput((event) => {
  if (event.kind === "text" && event.text === "q") {
    exit();
    return "consume";
  }
  if (event.kind !== "key" || event.key.phase === "release") return "continue";
  if (event.key.name === "up") box.value?.scrollByLines(-1);
  else if (event.key.name === "down") box.value?.scrollByLines(1);
  else if (event.key.name === "home") box.value?.scrollToTop();
  else if (event.key.name === "end") box.value?.scrollToBottom();
  else return "continue";
  return "consume";
});
</script>

<template>
  <Box flexDirection="column" :height="rows ?? undefined">
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
