<script setup lang="ts">
import { computed, onScopeDispose, shallowRef } from "vue";
import { Box, Text, useInput, useLayoutSize, useStdin, type TuiInputEvent } from "@vue-tui/runtime";
import { emitTestEvent } from "@vue-tui/runtime/internal/testing";

const generation = "A";
const active = shallowRef(true);
const lastInput = shallowRef("none");
// The viewport is on screen because suspend/continue must prove the app measured
// a real terminal again after SIGCONT, not just that it repainted.
const { width, height } = useLayoutSize();
const viewport = computed(() => `${width.value}x${height.value}`);
const raw = useStdin();
raw.setRawMode(true);

function eventLabel(event: TuiInputEvent): string {
  if (event.type === "text" || event.type === "paste") return event.text;
  return event.key.name ?? event.key.character;
}

useInput(
  (event) => {
    const input = eventLabel(event);
    emitTestEvent("input:received", { input });
    // "u" and "z" drive suspension from the test and are not user text; keeping
    // them out of the label lets an assertion prove input still arrives after
    // resume without matching the key that caused the resume.
    if (input !== "u" && input !== "z") lastInput.value = input;
  },
  { isActive: active },
);

onScopeDispose(() => {
  active.value = false;
  raw.setRawMode(false);
});
</script>

<template>
  <Box>
    <Text
      >INPUT-LABEL-A generation={{ generation }} viewport={{ viewport }} last={{ lastInput }}</Text
    >
  </Box>
</template>
