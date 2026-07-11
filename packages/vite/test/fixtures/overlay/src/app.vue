<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted } from "vue";
import { Box, Text, useRenderSession } from "@vue-tui/runtime";

const session = useRenderSession();
const testGlobal = globalThis as { __VT_RENDER_SESSION__?: object };
const sessionIdentity =
  testGlobal.__VT_RENDER_SESSION__ === undefined || testGlobal.__VT_RENDER_SESSION__ === session
    ? "stable"
    : "changed";
testGlobal.__VT_RENDER_SESSION__ = session;

const label = "LABEL-A";
const count = shallowRef(0);
let t: ReturnType<typeof setInterval>;
onMounted(() => {
  t = setInterval(() => count.value++, 60);
});
onUnmounted(() => clearInterval(t));
</script>
<template>
  <Box borderStyle="round" flexDirection="column">
    <Text bold>{{ label }}</Text>
    <Text>count={{ count }}</Text>
    <Text>session={{ sessionIdentity }}</Text>
  </Box>
</template>
