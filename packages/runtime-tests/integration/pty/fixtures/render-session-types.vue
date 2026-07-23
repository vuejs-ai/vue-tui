<script setup lang="ts">
import { Text, useLayoutWidth, useStdin, useViewportHeight } from "@vue-tui/runtime";

const width = useLayoutWidth();
const viewportHeight = useViewportHeight();
const { stdin, isRawModeSupported, setRawMode } = useStdin();
void stdin;
void isRawModeSupported;
setRawMode(false);
</script>

<template>
  <Text>{{ width }}x{{ viewportHeight ?? "unbounded" }}</Text>
</template>
