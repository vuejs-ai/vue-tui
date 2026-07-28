<script setup lang="ts">
import { computed, shallowRef, onMounted, onUnmounted } from "vue";
import { Box, Text, useBoxMetrics, useLayoutSize } from "@vue-tui/runtime";
import { emitTestEvent } from "@vue-tui/runtime/internal/testing";
import Target from "./target.vue";

emitTestEvent("app:setup-ran");
const label = "LABEL-A";
const count = shallowRef(0);
const { width: layoutWidth, height: viewportHeight } = useLayoutSize();
const layoutSize = computed(() => `${layoutWidth.value}x${viewportHeight.value}`);
const boxTarget = shallowRef<InstanceType<typeof Box> | null>(null);
const boxMetrics = useBoxMetrics(boxTarget);
const acceptedBoxSize = computed(() =>
  boxMetrics.hasMeasured.value ? `${boxMetrics.width.value}x${boxMetrics.height.value}` : "pending",
);
function renderProbe(shouldThrow: boolean): string {
  if (shouldThrow) throw new Error("RENDER-PROBE-FAIL");
  return "render-ok";
}
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
    <Text>{{ renderProbe(false) }}</Text>
    <Box ref="boxTarget" :width="7" :height="2"><Text>BOX</Text></Box>
    <Text>box={{ acceptedBoxSize }}</Text>
    <Target />
  </Box>
</template>
