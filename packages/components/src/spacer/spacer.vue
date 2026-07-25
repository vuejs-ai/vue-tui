<script setup lang="ts">
// Spacer is ordinary composition over the public Runtime surface: a growing Box
// with no content. It exists for authoring convenience and discoverability, not
// because Runtime must own it. It fills the free space along its container's
// main axis, so it takes no props.
import { Box } from "@vue-tui/runtime";
</script>

<template>
  <Box :flexGrow="1" />
</template>
