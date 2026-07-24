<script setup lang="ts">
import { computed, getCurrentInstance, shallowRef, watch } from "vue";
import { Box, useBoxMetrics } from "@vue-tui/runtime";
import {
  assertNoRejectedMouseListeners,
  scrollBoxProps,
  type ScrollBoxExpose,
} from "./scroll-box-props.ts";

defineOptions({ name: "ScrollBox", inheritAttrs: false });
defineProps(scrollBoxProps);
defineSlots<{ default?: () => unknown }>();
const instance = getCurrentInstance();
if (!instance) throw new Error("<ScrollBox> must be created inside a Vue component instance");
const componentInstance = instance;

const viewportRef = shallowRef<InstanceType<typeof Box> | null>(null);
const contentRef = shallowRef<InstanceType<typeof Box> | null>(null);
const viewportMetrics = useBoxMetrics(viewportRef);
const contentMetrics = useBoxMetrics(contentRef);
const viewportHeight = shallowRef(0);
const contentHeight = shallowRef(0);
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
  width: "100%" as const,
}));
const maxScroll = computed(() =>
  Math.max(0, Math.ceil(contentHeight.value - viewportHeight.value)),
);

function clampScrollTop(value: number): number {
  return Math.max(0, Math.min(maxScroll.value, Math.floor(value)));
}

function assertFiniteMovement(value: number, method: "scrollToLine" | "scrollByLines"): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    const parameter = method === "scrollToLine" ? "line" : "lines";
    throw new TypeError(`<ScrollBox>.${method}() ${parameter} must be a finite number.`);
  }
}

function applyScrollTop(value: number, nextSticky: boolean): boolean {
  const next = clampScrollTop(value);
  const moved = next !== scrollTop.value;
  scrollTop.value = next;
  sticky.value = nextSticky || next >= maxScroll.value;
  return moved;
}

function scrollToLine(value: number): boolean {
  assertFiniteMovement(value, "scrollToLine");
  return applyScrollTop(value, false);
}

function scrollByLines(delta: number): boolean {
  assertFiniteMovement(delta, "scrollByLines");
  return applyScrollTop(scrollTop.value + delta, false);
}

function scrollToTop(): boolean {
  return applyScrollTop(0, false);
}

function scrollToBottom(): boolean {
  return applyScrollTop(maxScroll.value, true);
}

const exposed: ScrollBoxExpose = { scrollToLine, scrollByLines, scrollToTop, scrollToBottom };
defineExpose(exposed);

watch(
  () =>
    [
      contentMetrics.hasMeasured.value,
      contentMetrics.height.value,
      viewportMetrics.hasMeasured.value,
      viewportMetrics.height.value,
    ] as const,
  ([contentMeasured, nextContentHeight, viewportMeasured, nextViewportHeight]) => {
    // Keep the last accepted dimensions while an ancestor is hidden. Runtime
    // already retains them across a suspended or temporarily unavailable paint.
    if (contentMeasured) contentHeight.value = nextContentHeight;
    if (viewportMeasured) viewportHeight.value = nextViewportHeight;

    if (sticky.value) scrollTop.value = maxScroll.value;
    else scrollTop.value = clampScrollTop(scrollTop.value);
  },
  { flush: "post", immediate: true },
);
</script>

<template>
  <template v-if="assertNoRejectedMouseListeners(componentInstance.vnode.props)">
    <Box ref="viewportRef" v-bind="viewportStyle">
      <Box ref="contentRef" v-bind="contentStyle">
        <slot />
      </Box>
    </Box>
  </template>
</template>
