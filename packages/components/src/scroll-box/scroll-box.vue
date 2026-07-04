<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { Box, useBoxMetrics, useInput, useMouseInput, useStdin, type Key } from "@vue-tui/runtime";
import { scrollBoxProps } from "./scroll-box-props.ts";

defineOptions({ name: "ScrollBox" });
const props = defineProps(scrollBoxProps);
defineSlots<{ default?: () => unknown }>();

const viewportRef = shallowRef<unknown>();
const contentRef = shallowRef<unknown>();
const viewport = useBoxMetrics(viewportRef);
const content = useBoxMetrics(contentRef);
const { isRawModeSupported } = useStdin();
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
const wheelActive = computed(() => props.wheel && isRawModeSupported);
const keyboardActive = computed(() => props.keyboard && isRawModeSupported);

function clampScrollTop(value: number): number {
  return Math.max(0, Math.min(maxScroll.value, Math.floor(value)));
}

function scrollTo(value: number, nextSticky = false): void {
  const next = clampScrollTop(value);
  scrollTop.value = next;
  sticky.value = nextSticky || next >= maxScroll.value;
}

function scrollBy(delta: number): void {
  scrollTo(scrollTop.value + delta);
}

function scrollToBottom(): void {
  scrollTo(maxScroll.value, true);
}

function pageSize(): number {
  return Math.max(1, Math.floor(Math.max(1, viewport.height.value) / 2));
}

function wheelLines(): number {
  return Math.max(1, Math.floor(props.wheelLines));
}

function handleKey(_input: string, key: Key): void {
  if (key.pageUp) {
    scrollBy(-pageSize());
    return;
  }
  if (key.pageDown) {
    scrollBy(pageSize());
    return;
  }
  if (key.home && (key.ctrl || key.meta)) {
    scrollTo(0);
    return;
  }
  if (key.end && (key.ctrl || key.meta)) {
    scrollToBottom();
  }
}

useMouseInput(
  (event) => {
    scrollBy(event.direction === "up" ? -wheelLines() : wheelLines());
  },
  { isActive: wheelActive },
);
useInput(handleKey, { isActive: keyboardActive });

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
