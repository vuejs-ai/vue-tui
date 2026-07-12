<script setup lang="ts">
import { shallowRef, watchPostEffect, onMounted, onUnmounted } from "vue";
import { Box, Text, useBoxMetrics, useRenderSession } from "@vue-tui/runtime";
import Target from "./target.vue";

const session = useRenderSession();
const testGlobal = globalThis as { __VT_RENDER_SESSION__?: object };
const sessionIdentity =
  testGlobal.__VT_RENDER_SESSION__ === undefined || testGlobal.__VT_RENDER_SESSION__ === session
    ? "stable"
    : "changed";
testGlobal.__VT_RENDER_SESSION__ = session;

const label = "LABEL-A";
const count = shallowRef(0);
const target = shallowRef<InstanceType<typeof Target> | null>(null);
const {
  width: targetWidth,
  height: targetHeight,
  hasMeasured: targetMeasured,
} = useBoxMetrics(target);
const targetGlobal = globalThis as {
  __VT_TARGET_INSTANCE__?: object;
  __VT_TARGET_CURRENT__?: object | null;
};
watchPostEffect(() => {
  if (target.value && targetGlobal.__VT_TARGET_INSTANCE__ === undefined) {
    targetGlobal.__VT_TARGET_INSTANCE__ = target.value;
  }
  targetGlobal.__VT_TARGET_CURRENT__ = target.value;
});
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
    <Target ref="target" />
    <Text>target={{ targetWidth }}x{{ targetHeight }}:{{ targetMeasured }}</Text>
  </Box>
</template>
