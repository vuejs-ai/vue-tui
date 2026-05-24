<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, useFocusManager, useInput } from "@vue-tui/runtime";
import Item from "./Item.vue";

const items = ["apple", "banana", "orange", "grape", "watermelon"];
const selected = shallowRef<null | string>(null);

const focusManager = useFocusManager();

useInput((input, key) => {
  if (key.upArrow) {
    focusManager.focusPrevious();
  } else if (key.downArrow) {
    focusManager.focusNext();
  } else if (key.return) {
    console.log("Selected:", focusManager.activeId);
    selected.value = focusManager.activeId;
  }
  if (input === "q") {
    process.exit(0);
  }
});
</script>

<template>
  <Box>
    <Item v-for="item in items" :key="item" :id="item" :label="item" />
    <Text>You selected: {{ focusManager.activeId }}</Text>
  </Box>
</template>
