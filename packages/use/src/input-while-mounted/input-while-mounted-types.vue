<script setup lang="ts">
import { Box, Text, type TuiInputEvent } from "@vue-tui/runtime";
import { UseInputWhileMounted } from "../components.ts";
import { useInputWhileMounted } from "../index.ts";

const targetRef = useInputWhileMounted((event) => {
  if (event.type === "text") event.text.toUpperCase();
});

function handleInput(event: TuiInputEvent): void {
  if (event.type === "paste") event.text.toUpperCase();
}

function handleWrongInput(_event: number): void {}
</script>

<template>
  <Box :ref="targetRef">
    <Text>hook</Text>
  </Box>
  <UseInputWhileMounted @input="handleInput">
    <Text>component</Text>
  </UseInputWhileMounted>
  <!-- @vue-expect-error input emits TuiInputEvent, not number. -->
  <UseInputWhileMounted @input="handleWrongInput" />
</template>
