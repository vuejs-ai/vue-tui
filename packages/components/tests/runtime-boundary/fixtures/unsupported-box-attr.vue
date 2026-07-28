<script setup lang="ts">
import { Box, Text } from "@vue-tui/runtime";
</script>

<template>
  <!-- Runtime must still diagnose this in JavaScript projects or when template
       strictness is enabled: Vue intentionally permits undeclared component
       attributes as possible fallthrough inputs, so typing alone cannot protect
       this migration. -->
  <Box display="none"><Text>x</Text></Box>
</template>
