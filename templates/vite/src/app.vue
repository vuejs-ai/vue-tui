<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from "vue";
import { Box, Text, useApp, useInput } from "@vue-tui/runtime";
import { Spinner } from "@vue-tui/components";

const ready = shallowRef(false);
const count = shallowRef(0);
const { exit } = useApp();

// Give the <Spinner> from @vue-tui/components a brief moment before we greet —
// a stand-in for whatever real startup work your app does. Always clear the
// timer on unmount so quitting (q) during loading exits immediately instead of
// waiting for a stray timer to keep the process alive.
let timer: ReturnType<typeof setTimeout>;
onMounted(() => {
  timer = setTimeout(() => {
    ready.value = true;
  }, 1500);
});
onUnmounted(() => clearTimeout(timer));

useInput((event) => {
  if (event.type !== "text") return;
  // Accept "=" as well as "+": on most keyboards "+" is Shift+"=", so taking the
  // bare "=" key too makes incrementing friction-free.
  if (event.text === "+" || event.text === "=") count.value++;
  if (event.text === "-") count.value--;
  if (event.text === "q") exit();
});
</script>

<template>
  <Box flexDirection="column" :padding="1" borderStyle="round" borderColor="green">
    <Spinner v-if="!ready" type="dots" color="cyan" label="Starting up" />
    <template v-else>
      <Text bold color="green">Hello from vue-tui 👋</Text>
      <Text
        >Count: <Text bold color="cyan">{{ count }}</Text></Text
      >
      <Text dimColor>Press + (or =) to add, - to subtract, q to quit.</Text>
      <Text dimColor>Edit src/app.vue and save to see HMR.</Text>
    </template>
  </Box>
</template>
