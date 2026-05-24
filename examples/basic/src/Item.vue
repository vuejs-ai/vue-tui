<script setup lang="ts">
import { Box, Text, useFocus } from "@vue-tui/runtime";
const props = defineProps<{
  id: string;
  label: string;
}>();

const focusCtx = useFocus({ id: props.id });
</script>

<template>
  <Box>
    <Text :color="focusCtx.isFocused.value ? 'cyan' : 'undefined'"
      >{{ focusCtx.isFocused.value ? ">" : " " }} {{ props.label }}</Text
    >
  </Box>
</template>
