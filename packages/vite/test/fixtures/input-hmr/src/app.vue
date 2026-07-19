<script setup lang="ts">
import { onScopeDispose, shallowRef } from "vue";
import { Box, Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";

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

function eventLabel(event: TuiInputEvent): string {
  if (event.kind === "text" || event.kind === "paste") return event.text;
  return event.name ?? event.character;
}

useInput(
  (event) => {
    testGlobal.__VT_INPUT_CALLS__?.push(
      `${mountGeneration}:${generation}:global:${eventLabel(event)}`,
    );
  },
  { isActive: active },
);
const stopRoute = () => {
  active.value = false;
};
const startRoute = () => {
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
  <Box>
    <Text>INPUT-LABEL-A generation={{ mountGeneration }}:{{ generation }}</Text>
  </Box>
</template>
