<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { Box, useBoxMetrics } from "@vue-tui/runtime";
import { scrollBoxProps, type ScrollBoxExpose } from "./scroll-box-props.ts";

defineOptions({ name: "ScrollBox" });
defineProps(scrollBoxProps);
defineSlots<{ default?: () => unknown }>();

const viewportRef = shallowRef<unknown>();
const contentRef = shallowRef<unknown>();
const viewport = useBoxMetrics(viewportRef);
const content = useBoxMetrics(contentRef);
const scrollTop = shallowRef(0);
const sticky = shallowRef(true);

const viewportStyle = {
  flexDirection: "column",
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  minHeight: 0,
  overflowY: "hidden",
  width: "100%",
} as const;
const contentStyle = computed(() => ({
  flexDirection: "column" as const,
  flexShrink: 0,
  marginTop: -scrollTop.value,
  width: "100%",
}));
const maxScroll = computed(() =>
  Math.max(0, Math.ceil(content.height.value - viewport.height.value)),
);

function clampScrollTop(value: number): number {
  return Math.max(0, Math.min(maxScroll.value, Math.floor(value)));
}

function scrollToLine(value: number, nextSticky = false): void {
  const next = clampScrollTop(value);
  scrollTop.value = next;
  sticky.value = nextSticky || next >= maxScroll.value;
}

function scrollByLines(delta: number): void {
  scrollToLine(scrollTop.value + delta);
}

function scrollToTop(): void {
  scrollToLine(0);
}

function scrollToBottom(): void {
  scrollToLine(maxScroll.value, true);
}

const exposed: ScrollBoxExpose = { scrollToLine, scrollByLines, scrollToTop, scrollToBottom };
defineExpose(exposed);

watch(
  () => [content.height.value, viewport.height.value, maxScroll.value] as const,
  () => {
    if (sticky.value) scrollTop.value = maxScroll.value;
    else scrollTop.value = clampScrollTop(scrollTop.value);
  },
  { flush: "sync" },
);
</script>

<template>
  <Box ref="viewportRef" v-bind="viewportStyle">
    <Box ref="contentRef" v-bind="contentStyle">
      <slot />
    </Box>
  </Box>
</template>
