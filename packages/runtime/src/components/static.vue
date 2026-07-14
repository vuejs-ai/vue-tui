<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { staticProps } from "./static-props.ts";

// Renders the `<tui-static>` host primitive. The host tag's `tui-` prefix keeps it out
// of the component namespace, so the component can take its real name "Static" with no
// vue-tsc self-recursion on the tag. Public export wired in index.ts.
defineOptions({ name: "Static" });
const props = defineProps(staticProps);
defineSlots<{ default?: (slotProps: { item: unknown; index: number }) => unknown }>();

// Mirrors Ink's useState(0): only items at/after `cursor` render; the renderer
// advances the cursor only after output acceptance so written items unmount.
const cursor = shallowRef(0);
// GROW/steady-state: advance only through the prefix represented by the accepted
// host render. The items array can grow synchronously inside stdout.write(), so
// reading its current length at acceptance would skip the re-entrant append.
const onWritten = (renderedThrough: number) => {
  cursor.value = Math.max(
    cursor.value,
    Math.min(renderedThrough, (props.items as unknown[]).length),
  );
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
  internal_renderedThrough: (props.items as unknown[]).length,
}));
const itemsToRender = computed(() => (props.items as unknown[]).slice(cursor.value));
</script>

<template>
  <tui-static v-bind="merged">
    <template v-for="(item, i) in itemsToRender" :key="cursor + i">
      <slot :item="item" :index="cursor + i" />
    </template>
  </tui-static>
</template>
