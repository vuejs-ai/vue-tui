<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { Text } from "@vue-tui/runtime";
import { spinnerProps } from "./spinner-props.ts";
import { resolveSpinner } from "./spinners.ts";

const props = defineProps(spinnerProps);

const set = computed(() => resolveSpinner(props));

const frame = shallowRef(0);

// Raw prop sources let Vue clean up the old timer before validation can throw.
watch(
  [() => props.type, () => props.frames?.length, () => props.interval],
  (_value, _previous, onCleanup) => {
    const interval = set.value.interval;
    frame.value = 0;
    const timer = setInterval(() => {
      frame.value += 1;
    }, interval);
    onCleanup(() => clearInterval(timer));
  },
  { immediate: true },
);

const glyph = computed(() => set.value.frames[frame.value % set.value.frames.length]);

// One outer Text keeps the glyph and label inline; interpolation preserves their
// separating space through Vue's whitespace condensation.
</script>

<template>
  <Text
    ><Text :color="color">{{ glyph }}</Text
    ><Text v-if="label">{{ " " + label }}</Text></Text
  >
</template>
