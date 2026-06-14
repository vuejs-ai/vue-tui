<script setup lang="ts">
import { computed, inject } from "vue";
import { AppContextKey } from "../context.ts";
import { boxProps } from "./box-props.ts";
import { assertBoxValid } from "./box-validate.ts";

// Internal name != "Box" to avoid vue-tsc self-recursion on the `<box>` host tag.
// The public export name "Box" comes from index.ts.
defineOptions({ name: "BoxImpl" });
const props = defineProps(boxProps);
defineSlots<{ default?: () => unknown }>();
const appCtx = inject(AppContextKey, null);
const srEnabled = computed(() => appCtx?.isScreenReaderEnabled ?? false);
const srHidden = computed(() => srEnabled.value && props.ariaHidden);
</script>

<template>
  <!-- assertBoxValid runs every render and throws into the error boundary, exactly
       as the former render fn did; `!srHidden &&` short-circuits validation when the
       Box is screen-reader-hidden (mirrors box.ts ordering: a non-emitted node never
       colorizes). Under a screen reader with an ariaLabel, render the label text
       instead of the slot. The root `v-if` makes this a fragment, but $el still
       resolves to the real `box` host node, so measureElement/useBoxMetrics work. -->
  <box v-if="!srHidden && assertBoxValid(props)" v-bind="props">
    <text v-if="srEnabled && props.ariaLabel">{{ props.ariaLabel }}</text>
    <slot v-else />
  </box>
</template>
