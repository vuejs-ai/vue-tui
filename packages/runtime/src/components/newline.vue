<script setup lang="ts">
import { computed, inject } from "vue";
import { TextContextKey } from "../context.ts";
import { newlineProps } from "./newline-props.ts";

defineOptions({ name: "Newline" });
const props = defineProps(newlineProps);
// Inside a text context (Text/Transform provide TextContextKey) render an inline
// virtual-text; standalone render a yoga `text` so Newline participates in layout.
const insideText = inject(TextContextKey, false);
const content = computed(() => "\n".repeat(props.count));
</script>

<template>
  <tui-virtual-text v-if="insideText">{{ content }}</tui-virtual-text>
  <tui-text v-else>{{ content }}</tui-text>
</template>
