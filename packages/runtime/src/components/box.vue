<script setup lang="ts">
import { computed, inject } from "vue";
import { AppContextKey } from "../context.ts";
import { boxProps } from "./box-props.ts";
import { assertBoxValid } from "./box-validate.ts";

// Renders the `<tui-box>` host primitive. The host tag's `tui-` prefix keeps it out
// of the component namespace, so the component can take its real name "Box" with no
// vue-tsc self-recursion on the tag. Public export wired in index.ts.
defineOptions({ name: "Box" });
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
       resolves to the real `tui-box` host node, so measureElement/useBoxMetrics work. -->
  <tui-box v-if="!srHidden && assertBoxValid(props)" v-bind="props">
    <tui-text v-if="srEnabled && props.ariaLabel">{{ props.ariaLabel }}</tui-text>
    <slot v-else />
  </tui-box>
</template>
