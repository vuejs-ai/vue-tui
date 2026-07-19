<script setup lang="ts">
// Type-only fixture (not run): pins that consumer TEMPLATES type-check vue-tui
// components under vue-tsc — props validated, slot children accepted — with the
// components exported as WithChildren-wrapped defineComponents.
//
// Scope note: Vue templates allow undeclared component attributes as possible
// fallthrough input, so a fat-fingered `<Box :bogusprop="1">` is not reliably a
// template diagnostic. The `.tsx` fixture catches excess props, while Runtime's
// closed Box/Text attribute check rejects every compiled-template remainder before
// creating a terminal node.
import { Box, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
</script>

<template>
  <!-- Valid: slot children + typed props -->
  <Box flex-direction="row"><Text color="green">ok</Text></Box>
  <Box
    flex-direction="column"
    align-items="stretch"
    justify-content="space-between"
    width="55.9%"
    :height="2"
    :padding-left="1"
    border-style="single"
    border-color="gray"
    overflow-y="hidden"
  >
    <Text color="initial" background-color="#12abEF" inverse wrap="truncate">narrowed props</Text>
  </Box>
  <Box v-show="true"><Text>v-show</Text></Box>
  <Static v-for="(item, index) in [1, 2, 3]" :key="item">
    <Text>{{ item.toFixed(0) }}:{{ index.toFixed(0) }}</Text>
  </Static>
  <Static>x</Static>

  <!-- @vue-expect-error display accepts "flex" | "none", not a number -->
  <Box :display="123">x</Box>
  <!-- @vue-expect-error bold accepts a boolean, not a string -->
  <Text :bold="'yes'">x</Text>
  <!-- @vue-expect-error reverse directions are not in the minimum Box vocabulary -->
  <Box flex-direction="row-reverse">x</Box>
  <!-- @vue-expect-error height is a cell count, not a percentage -->
  <Box height="100%">x</Box>
  <!-- @vue-expect-error only evidenced border presets remain public -->
  <Box border-style="double">x</Box>
  <!-- @vue-expect-error unknown color aliases are not public -->
  <Text color="grey">x</Text>
  <!-- @vue-expect-error only wrap and end-truncate behavior remain public -->
  <Text wrap="truncate-middle">x</Text>
</template>
