<script setup lang="ts">
import { onMounted, onScopeDispose, shallowRef, watchPostEffect } from "vue";
import { Box, Text, useFocus } from "@vue-tui/runtime";

const targetBox = shallowRef<InstanceType<typeof Box> | null>(null);
const focus = useFocus(targetBox);
const targetGlobal = globalThis as { __VT_TARGET_FOCUSED__?: boolean };
onMounted(() => {
  focus.focus();
});
watchPostEffect(() => {
  targetGlobal.__VT_TARGET_FOCUSED__ = focus.isFocused.value;
});
onScopeDispose(() => {
  targetGlobal.__VT_TARGET_FOCUSED__ = false;
});
</script>

<template>
  <Box ref="targetBox" :width="7" :height="2">
    <Text>TARGET-A</Text>
  </Box>
</template>
