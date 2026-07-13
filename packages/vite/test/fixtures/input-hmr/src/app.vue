<script setup lang="ts">
import { onScopeDispose, shallowRef, type ComponentPublicInstance } from "vue";
import { Box, Text, useFocus, useFocusedInput, useInput } from "@vue-tui/runtime";

const generation = "A";
const testGlobal = globalThis as {
  __VT_INPUT_ACTIVE_MOUNT__?: number;
  __VT_INPUT_CALLS__?: string[];
  __VT_INPUT_SETUPS__?: string[];
  __VT_INPUT_START__?: () => void;
  __VT_INPUT_STOP__?: () => void;
};
const mountGeneration = testGlobal.__VT_INPUT_ACTIVE_MOUNT__;
if (mountGeneration === undefined) throw new Error("missing input HMR mount generation");
const active = shallowRef(true);
const focusDisabled = shallowRef(false);
const host = shallowRef<ComponentPublicInstance | null>(null);
const target = useFocus(host, { autoFocus: true, disabled: focusDisabled });
useInput(
  (event) => {
    testGlobal.__VT_INPUT_CALLS__?.push(
      `${mountGeneration}:${generation}:global:${event.sequence}`,
    );
    return "continue";
  },
  { isActive: active },
);
useFocusedInput(target, (event) => {
  testGlobal.__VT_INPUT_CALLS__?.push(`${mountGeneration}:${generation}:focus:${event.sequence}`);
  return "continue";
});
const stopRoute = () => {
  active.value = false;
  focusDisabled.value = true;
};
const startRoute = () => {
  focusDisabled.value = false;
  active.value = true;
};
testGlobal.__VT_INPUT_START__ = startRoute;
testGlobal.__VT_INPUT_STOP__ = stopRoute;
testGlobal.__VT_INPUT_SETUPS__?.push(`${mountGeneration}:${generation}`);

onScopeDispose(() => {
  active.value = false;
  if (testGlobal.__VT_INPUT_START__ === startRoute) delete testGlobal.__VT_INPUT_START__;
  if (testGlobal.__VT_INPUT_STOP__ === stopRoute) delete testGlobal.__VT_INPUT_STOP__;
});
</script>

<template>
  <Box ref="host">
    <Text>INPUT-LABEL-A generation={{ mountGeneration }}:{{ generation }}</Text>
  </Box>
</template>
