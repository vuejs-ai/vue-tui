<script setup lang="ts">
import { onScopeDispose, shallowRef, watchPostEffect } from "vue";
import { Box, Text, useBoxPresence } from "@vue-tui/runtime";

const targetBox = shallowRef<InstanceType<typeof Box> | null>(null);
const presence = useBoxPresence(targetBox);
const targetGlobal = globalThis as { __VT_TARGET_PRESENCE__?: boolean };
watchPostEffect(() => {
  targetGlobal.__VT_TARGET_PRESENCE__ = presence.value;
});
onScopeDispose(() => {
  targetGlobal.__VT_TARGET_PRESENCE__ = false;
});
</script>

<template>
  <Box ref="targetBox" :width="7" :height="2">
    <Text>TARGET-A</Text>
  </Box>
</template>
