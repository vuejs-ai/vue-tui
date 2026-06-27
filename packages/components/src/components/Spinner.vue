<template>
  <Text :color="color">{{ characters[frame % characters.length] + " " }}</Text>
</template>

<script setup lang="ts">
import { Text, useAnimation } from "@vue-tui/runtime";

const props = withDefaults(
  defineProps<{
    color?: string;
    interval?: number;
  }>(),
  {
    color: "blue",
    interval: 100,
  },
);

const { frame } = useAnimation({ interval: props.interval });
const characters = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
</script>
