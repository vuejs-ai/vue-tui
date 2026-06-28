<script setup lang="ts">
import { computed } from "vue";
import { useAnimation, Text } from "@vue-tui/runtime";
import { spinnerProps } from "./spinner-props.ts";
import { resolveSpinner } from "./spinners.ts";

defineOptions({ name: "Spinner" });
const props = defineProps(spinnerProps);

const set = computed(() => resolveSpinner(props));
const { frame } = useAnimation({ interval: () => set.value.interval });
const glyph = computed(() => set.value.frames[frame.value % set.value.frames.length]);
</script>

<template>
  <Text :color="color">{{ glyph }}</Text>
</template>
