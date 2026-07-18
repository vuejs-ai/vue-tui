<script setup lang="ts">
// Type-only fixture (not run): pins that consumer TEMPLATES type-check vue-tui
// components under vue-tsc — props validated, slot children accepted — with the
// components exported as WithChildren-wrapped defineComponents.
//
// Scope note: without `strictTemplates`, vue-tsc catches WRONG-TYPE and
// MISSING-REQUIRED prop errors in templates (exercised below) but NOT excess/unknown
// prop NAMES — a fat-fingered `<Box :bogusprop="1">` is not flagged here. That gap is
// intentional (strictTemplates off); the `.tsx` JSX fixture does catch excess props.
import { Box, Text, Transform } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
</script>

<template>
  <!-- Valid: slot children + typed props -->
  <Box flex-direction="row"><Text color="green">ok</Text></Box>
  <Box v-show="true"><Text>v-show</Text></Box>
  <Static v-for="(item, index) in [1, 2, 3]" :key="item">
    <Text>{{ item.toFixed(0) }}:{{ index.toFixed(0) }}</Text>
  </Static>
  <Static>x</Static>
  <Transform :transform="(line: string) => line"><Text>x</Text></Transform>

  <!-- @vue-expect-error display accepts "flex" | "none", not a number -->
  <Box :display="123">x</Box>
  <!-- @vue-expect-error bold accepts a boolean, not a string -->
  <Text :bold="'yes'">x</Text>
</template>
