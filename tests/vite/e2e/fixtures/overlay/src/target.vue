<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from "vue";
import { Box, Text, useFocus } from "@vue-tui/runtime";
import { emitTestEvent } from "@vue-tui/runtime/internal/testing";

emitTestEvent("target:setup-ran");
const targetBox = shallowRef<InstanceType<typeof Box> | null>(null);
const focus = useFocus(targetBox);
onMounted(() => {
  emitTestEvent("target:mounted");
  focus.focus();
});
onUnmounted(() => {
  emitTestEvent("target:unmounted");
});
</script>

<template>
  <Box ref="targetBox" :width="7" :height="2">
    <Text>TARGET-A</Text>
  </Box>
</template>
