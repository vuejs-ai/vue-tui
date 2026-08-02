<script setup lang="ts">
// Type-only fixture: the Vue 3.5 template-ref inference used in public SFC
// examples must preserve Runtime's target constraints without explicit generics.
import { useTemplateRef } from "vue";
import { Box, Text, useBoxMetrics, useFocus } from "@vue-tui/runtime";

const panel = useTemplateRef("panel");
useFocus(panel);
useBoxMetrics(panel);

const label = useTemplateRef("label");
useFocus(label);
// @ts-expect-error Text is a valid focus boundary but not a measurable Box.
useBoxMetrics(label);
</script>

<template>
  <Box ref="panel" />
  <Text ref="label">label</Text>
</template>
