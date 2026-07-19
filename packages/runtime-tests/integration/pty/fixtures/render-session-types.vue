<script setup lang="ts">
import { Text, useLayoutWidth, useStdin, useViewportHeight } from "@vue-tui/runtime";

const width = useLayoutWidth();
const viewportHeight = useViewportHeight();
const { stdin } = useStdin();
void stdin;
// @ts-expect-error Raw-mode control is internal to semantic input demand.
useStdin().setRawMode(false);
</script>

<template>
  <Text>{{ width }}x{{ viewportHeight ?? "unbounded" }}</Text>
</template>
