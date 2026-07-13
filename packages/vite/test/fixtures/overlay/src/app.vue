<script setup lang="ts">
import { computed, shallowRef, watchPostEffect, onMounted, onUnmounted } from "vue";
import {
  Box,
  Text,
  useCaret,
  useElementGeometry,
  useFocus,
  useRenderSession,
} from "@vue-tui/runtime";
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
const focus = useFocus(target, { autoFocus: true });
const { state: caretState } = useCaret(target, { focus, position: { x: 0, y: 0 } });
const { geometry: targetGeometry } = useElementGeometry(target);
const targetSize = computed(() => {
  const geometry = targetGeometry.value;
  return geometry.status === "zero-size" ||
    geometry.status === "fully-clipped" ||
    geometry.status === "visible"
    ? `${geometry.parent.width}x${geometry.parent.height}:true`
    : "0x0:false";
});
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
    <Text>target={{ targetSize }}</Text>
    <Text>caret={{ caretState.status }}</Text>
  </Box>
</template>
