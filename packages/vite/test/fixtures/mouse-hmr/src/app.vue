<script setup lang="ts">
import { shallowRef, watchPostEffect } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import { useMouseEvent } from "@vue-tui/runtime/fullscreen";
import Target from "./target.vue";

const clicks = shallowRef(0);
const target = shallowRef<InstanceType<typeof Target> | null>(null);
useMouseEvent(target, "click", () => {
  clicks.value++;
  return "consume";
});

const testGlobal = globalThis as {
  __VT_MOUSE_TARGET_FIRST__?: object;
  __VT_MOUSE_TARGET_CURRENT__?: object | null;
};
watchPostEffect(() => {
  if (target.value && testGlobal.__VT_MOUSE_TARGET_FIRST__ === undefined) {
    testGlobal.__VT_MOUSE_TARGET_FIRST__ = target.value;
  }
  testGlobal.__VT_MOUSE_TARGET_CURRENT__ = target.value;
});
</script>

<template>
  <Box flexDirection="column">
    <Target ref="target" />
    <Text>clicks={{ clicks }}</Text>
  </Box>
</template>
