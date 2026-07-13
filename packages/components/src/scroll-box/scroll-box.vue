<script setup lang="ts">
import { computed, getCurrentInstance, shallowRef, watch, type ComponentPublicInstance } from "vue";
import { Box, useElementGeometry, type ElementGeometry } from "@vue-tui/runtime";
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

const viewportRef = shallowRef<ComponentPublicInstance | null>(null);
const contentRef = shallowRef<ComponentPublicInstance | null>(null);
const viewport = useElementGeometry(viewportRef);
const content = useElementGeometry(contentRef);
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
  width: "100%",
}));
const maxScroll = computed(() =>
  Math.max(0, Math.ceil(contentHeight.value - viewportHeight.value)),
);

function resolvedHeight(geometry: ElementGeometry): number | null {
  return geometry.status === "zero-size" ||
    geometry.status === "fully-clipped" ||
    geometry.status === "visible"
    ? geometry.parent.height
    : null;
}

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
  () => [content.geometry.value, viewport.geometry.value] as const,
  ([nextContent, nextViewport]) => {
    const nextContentHeight = resolvedHeight(nextContent);
    const nextViewportHeight = resolvedHeight(nextViewport);
    if (nextContentHeight !== null) contentHeight.value = nextContentHeight;
    if (nextViewportHeight !== null) viewportHeight.value = nextViewportHeight;

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
