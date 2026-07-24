<script setup lang="ts">
import { computed, onScopeDispose, shallowRef, watch } from "vue";
import { Text } from "@vue-tui/runtime";
import { spinnerProps } from "./spinner-props.ts";
import { resolveSpinner } from "./spinners.ts";

defineOptions({ name: "Spinner" });
const props = defineProps(spinnerProps);

const set = computed(() => resolveSpinner(props));
const frame = shallowRef(0);
let timer: ReturnType<typeof setInterval> | undefined;

function stopTimer(): void {
  if (timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
}

watch(
  () => set.value.interval,
  (interval) => {
    stopTimer();
    frame.value = 0;
    const delay = Number.isFinite(interval) ? Math.min(Math.max(1, interval), 2_147_483_647) : 100;
    timer = setInterval(() => {
      frame.value += 1;
    }, delay);
  },
  { immediate: true },
);

onScopeDispose(stopTimer);

const glyph = computed(() => set.value.frames[frame.value % set.value.frames.length]);
</script>

<template>
  <!-- The outer <Text> establishes a shared text context (runtime TextContextKey) so
       both inner spans render INLINE as <tui-virtual-text> (one line, `⠋ Loading`).
       Two bare sibling top-level <Text> would each be a block <tui-text> node and stack
       vertically under the root's column direction. The outer Text carries no color, so
       only the glyph span is tinted; the label span stays default. The separating space
       is an interpolation so Vue's whitespace:'condense' keeps it. -->
  <Text
    ><Text :color="color">{{ glyph }}</Text
    ><Text v-if="label">{{ " " + label }}</Text></Text
  >
</template>
