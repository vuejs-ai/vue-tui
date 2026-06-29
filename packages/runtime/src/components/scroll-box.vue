<script setup lang="ts">
import {
  computed,
  inject,
  onMounted,
  onUnmounted,
  shallowRef,
  watch,
  type WatchStopHandle,
} from "vue";
import Box from "./box.vue";
import { useBoxMetrics } from "../composables/useBoxMetrics.ts";
import { useInput, type Key } from "../composables/useInput.ts";
import { useStdout } from "../composables/useStdout.ts";
import { AppContextKey } from "../context.ts";
import { scrollBoxProps } from "./scroll-box-props.ts";

defineOptions({ name: "ScrollBox" });
const props = defineProps(scrollBoxProps);
defineSlots<{ default?: () => unknown }>();

const ENABLE_SGR_MOUSE = "\x1b[?1000h\x1b[?1006h";
const DISABLE_SGR_MOUSE = "\x1b[?1000l\x1b[?1006l";
const SGR_MOUSE_INPUT = /^\[<(\d+);\d+;\d+[mM]$/;

const viewportRef = shallowRef<unknown>();
const contentRef = shallowRef<unknown>();
const viewport = useBoxMetrics(viewportRef);
const content = useBoxMetrics(contentRef);
const appCtx = inject(AppContextKey, null);
const { stdout } = useStdout();
const scrollTop = shallowRef(0);
const sticky = shallowRef(true);
const sgrMouseEnabled = shallowRef(false);
let stopMouseModeWatch: WatchStopHandle | undefined;

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
const inputActive = computed(() => props.isActive && (props.enableMouse || props.enableKeyboard));

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

function handleMouse(input: string): boolean {
  const match = SGR_MOUSE_INPUT.exec(input);
  if (!match) return false;

  const button = Number(match[1]);
  if (button === 64) {
    scrollBy(-wheelLines());
    return true;
  }
  if (button === 65) {
    scrollBy(wheelLines());
    return true;
  }
  return true;
}

function handleKey(input: string, key: Key): void {
  if (!props.isActive) return;
  if (props.enableMouse && handleMouse(input)) return;
  if (!props.enableKeyboard) return;

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

function canWriteMouseMode(): boolean {
  return Boolean(appCtx?.interactive && stdout.isTTY) && !stdout.destroyed && !stdout.writableEnded;
}

function setSgrMouseMode(enabled: boolean): void {
  if (enabled) {
    if (sgrMouseEnabled.value || !canWriteMouseMode()) return;
    stdout.write(ENABLE_SGR_MOUSE);
    sgrMouseEnabled.value = true;
    return;
  }

  if (!sgrMouseEnabled.value) return;
  sgrMouseEnabled.value = false;
  if (canWriteMouseMode()) stdout.write(DISABLE_SGR_MOUSE);
}

useInput(handleKey, { isActive: inputActive });

watch(
  () => [content.height.value, viewport.height.value, maxScroll.value] as const,
  () => {
    if (sticky.value) scrollTop.value = maxScroll.value;
    else scrollTop.value = clampScrollTop(scrollTop.value);
  },
  { flush: "sync" },
);

onMounted(() => {
  stopMouseModeWatch = watch(
    () => props.isActive && props.enableMouse,
    (enabled) => setSgrMouseMode(enabled),
    { immediate: true, flush: "sync" },
  );
});

onUnmounted(() => {
  stopMouseModeWatch?.();
  setSgrMouseMode(false);
});
</script>

<template>
  <Box ref="viewportRef" v-bind="viewportStyle">
    <Box ref="contentRef" v-bind="contentStyle">
      <slot />
    </Box>
  </Box>
</template>
