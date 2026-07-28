<script setup lang="ts">
import { Text, useLayoutSize, useStdin } from "@vue-tui/runtime";

const { width, height } = useLayoutSize();
const { stdin, isRawModeSupported, setRawMode } = useStdin();
void stdin;
void isRawModeSupported;
setRawMode(false);
</script>

<template>
  <Text>{{ width }}x{{ height === Infinity ? "unbounded" : height }}</Text>
</template>
