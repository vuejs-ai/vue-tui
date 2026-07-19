<script setup lang="ts">
import { computed, shallowRef, onMounted, onUnmounted } from "vue";
import { Box, Text, useApp, useBoxSize, useInput, useViewportHeight } from "@vue-tui/runtime";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";

const { exit } = useApp();
const viewportHeight = useViewportHeight();
const rootHeight = computed(() => viewportHeight?.value);

const box = shallowRef<ScrollBoxExpose>();
const scrollTarget = shallowRef<InstanceType<typeof Box> | null>(null);
const scrollTargetSize = useBoxSize(scrollTarget);
const lastScroll = shallowRef("ready");

// ScrollBox follows the bottom on its own. It ships no built-in input — this app
// wires one application-wide input handler to its only scroll target. A nested
// application can use the boolean result to decide whether its own higher-level
// router should offer an edge event to an ancestor.
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

function pageLines(): number {
  return Math.max(1, scrollTargetSize.value?.height ?? 1);
}

useInput((event) => {
  if (event.kind === "text" && event.text === "q") {
    exit();
    return;
  }
  if (event.kind !== "key") return;
  const handle = box.value;
  if (!handle) return;
  let moved: boolean;
  if (event.name === "up") moved = handle.scrollByLines(-1);
  else if (event.name === "down") moved = handle.scrollByLines(1);
  else if (event.name === "page-up") moved = handle.scrollByLines(-pageLines());
  else if (event.name === "page-down") moved = handle.scrollByLines(pageLines());
  else if (event.name === "home") moved = handle.scrollToTop();
  else if (event.name === "end") moved = handle.scrollToBottom();
  else return;
  lastScroll.value = `${event.name}:${moved ? "moved" : "edge"}`;
});
</script>

<template>
  <Box flexDirection="column" :height="rootHeight">
    <Box borderStyle="round" :paddingLeft="1" :paddingRight="1">
      <Text bold color="cyan">ScrollBox demo</Text>
      <Text dimColor> — ↑/↓ · PageUp/PageDown · Home/End · q</Text>
    </Box>

    <Box
      :flexGrow="1"
      :minHeight="0"
      flexDirection="column"
      borderStyle="round"
      :paddingLeft="1"
      :paddingRight="1"
    >
      <Box ref="scrollTarget" :flexGrow="1" :minHeight="0" flexDirection="column">
        <ScrollBox ref="box">
          <Text v-for="line in lines" :key="line">{{ line }}</Text>
        </ScrollBox>
      </Box>
    </Box>

    <Box :paddingLeft="1" :paddingRight="1">
      <Text dimColor>{{ lines.length }} lines · {{ lastScroll }}</Text>
    </Box>
  </Box>
</template>
