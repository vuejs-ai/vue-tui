<script setup lang="ts">
import { computed, onScopeDispose, shallowRef, watch } from "vue";
import { Text } from "@vue-tui/runtime";
import { spinnerProps } from "./spinner-props.ts";
import { resolveSpinner } from "./spinners.ts";

const props = defineProps(spinnerProps);

const set = computed(() => resolveSpinner(props));

// Read it here, in the setup body, so an unusable prop aborts setup before a timer
// exists. Vue routes a throw from inside a computed or a watcher getter through its
// error handler, which in a production build reports and continues — the immediate
// watcher callback would then run with `undefined` and hand that straight to
// `setInterval`, which fires about every millisecond.
void set.value;
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
    timer = setInterval(() => {
      frame.value += 1;
    }, interval);
  },
  { immediate: true },
);

onScopeDispose(stopTimer);

const glyph = computed(() => set.value.frames[frame.value % set.value.frames.length]);

// The outer <Text> establishes a shared text context (runtime TextContextKey) so
// both inner spans render INLINE as <tui-virtual-text> (one line, `⠋ Loading`).
// Two bare sibling top-level <Text> would each be a block <tui-text> node and stack
// vertically under the root's column direction. The outer Text carries no color, so
// only the glyph span is tinted; the label span stays default. The separating space
// is an interpolation so Vue's whitespace:'condense' keeps it. Keep this explanation
// out of the template root: a root comment creates a development-root Fragment and
// prevents component directives from reaching <Text> in production.
</script>

<template>
  <Text
    ><Text :color="color">{{ glyph }}</Text
    ><Text v-if="label">{{ " " + label }}</Text></Text
  >
</template>
