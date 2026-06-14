<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { staticProps } from "./static-props.ts";

// Internal name deliberately != "Static": vue-tsc 3.3.4 would bind the `<static>`
// host tag below to this component (self-recursion) if they matched. Public export
// name is "Static" (index.ts).
defineOptions({ name: "StaticImpl" });
const props = defineProps(staticProps);
defineSlots<{ default?: (slotProps: { item: unknown; index: number }) => unknown }>();

// Mirrors Ink's useState(0): only items at/after `cursor` render; the renderer
// advances the cursor post-paint via onWritten so written items unmount.
const cursor = shallowRef(0);
// GROW/steady-state: advance only AFTER paint. Assigning items.length is a
// reactivity no-op when unchanged (Object.is), so resync can't loop.
const onWritten = () => {
  cursor.value = (props.items as unknown[]).length;
};
// SHRINK: lower the cursor immediately so a later append isn't dropped.
watch(
  () => (props.items as unknown[]).length,
  (len) => {
    if (len < cursor.value) cursor.value = len;
  },
);
// internal_onWritten folded into the v-bind object so the exact prop key reaches
// the host `static` node (object keys are preserved verbatim).
const merged = computed(() => ({
  position: "absolute",
  flexDirection: "column",
  ...props.style,
  internal_onWritten: onWritten,
}));
const itemsToRender = computed(() => (props.items as unknown[]).slice(cursor.value));
</script>

<template>
  <static v-bind="merged">
    <template v-for="(item, i) in itemsToRender" :key="cursor + i">
      <slot :item="item" :index="cursor + i" />
    </template>
  </static>
</template>
