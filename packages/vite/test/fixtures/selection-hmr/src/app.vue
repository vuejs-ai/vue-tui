<script setup lang="ts">
import { computed, shallowRef, watchPostEffect, type ComponentPublicInstance } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import { useTextSelection, type TextSelectionCommands } from "@vue-tui/runtime/fullscreen";

const generation = "A";
const target = shallowRef<ComponentPublicInstance | null>(null);
const selection = useTextSelection(target, { pointer: false });
const testGlobal = globalThis as {
  __VT_SELECTION_COMMANDS__?: TextSelectionCommands[];
  __VT_SELECTION_CURRENT__?: TextSelectionCommands;
  __VT_SELECTION_TARGET_FIRST__?: object;
  __VT_SELECTION_TARGET_CURRENT__?: object | null;
};
(testGlobal.__VT_SELECTION_COMMANDS__ ??= []).push(selection);
testGlobal.__VT_SELECTION_CURRENT__ = selection;
watchPostEffect(() => {
  if (target.value && testGlobal.__VT_SELECTION_TARGET_FIRST__ === undefined) {
    testGlobal.__VT_SELECTION_TARGET_FIRST__ = target.value;
  }
  testGlobal.__VT_SELECTION_TARGET_CURRENT__ = target.value;
});

const status = computed(() => {
  const state = selection.state.value;
  return `${generation}:${state.status}:selected=${state.selectedText || "<empty>"}`;
});
</script>

<template>
  <Box flexDirection="column">
    <Text ref="target" :key="'cold'">DOC-A</Text>
    <Text>selection={{ status }}</Text>
  </Box>
</template>
