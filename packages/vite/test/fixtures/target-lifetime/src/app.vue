<script setup lang="ts">
import { computed, shallowRef, watchPostEffect, onMounted, onUnmounted } from "vue";
import { Box, Text, useBoxMetrics, useLayoutSize } from "@vue-tui/runtime";
import Target from "./target.vue";

const label = "LABEL-A";
const count = shallowRef(0);
const { width: layoutWidth, height: viewportHeight } = useLayoutSize();
const layoutSize = computed(() => `${layoutWidth.value}x${viewportHeight.value}`);
const boxTarget = shallowRef<InstanceType<typeof Box> | null>(null);
const boxMetrics = useBoxMetrics(boxTarget);
const acceptedBoxSize = computed(() =>
  boxMetrics.hasMeasured.value ? `${boxMetrics.width.value}x${boxMetrics.height.value}` : "pending",
);
const target = shallowRef<InstanceType<typeof Target> | null>(null);
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
    <Text>layout={{ layoutSize }}</Text>
    <Box ref="boxTarget" :width="7" :height="2"><Text>BOX</Text></Box>
    <Text>box={{ acceptedBoxSize }}</Text>
    <Target ref="target" />
  </Box>
</template>
