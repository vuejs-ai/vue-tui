<script setup lang="ts">
// Newline is ordinary composition over the public Runtime surface: Text content
// already carries explicit newlines, so this component exists for authoring
// convenience and discoverability, not because Runtime must own it. It must be
// used inside a <Text>, exactly like Ink's.
import { computed } from "vue";
import { Text } from "@vue-tui/runtime";
import { newlineProps } from "./newline-props.ts";

const props = defineProps(newlineProps);

const content = computed(() => {
  const { count } = props;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError(
      `<Newline> prop "count" must be a non-negative safe integer, received ${String(count)}.`,
    );
  }
  return "\n".repeat(count);
});
</script>

<template>
  <Text>{{ content }}</Text>
</template>
