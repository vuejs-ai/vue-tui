<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { staticProps } from "./static-props.ts";

// Renders the `<tui-static>` host primitive. The host tag's `tui-` prefix keeps it out
// of the component namespace, so the component can take its real name "Static" with no
// vue-tsc self-recursion on the tag. Public export wired in inline.ts.
defineOptions({ name: "Static" });
const props = defineProps(staticProps);
defineSlots<{ default?: (slotProps: { item: unknown; index: number }) => unknown }>();

const APPEND_ONLY_ERROR =
  "[vue-tui] <Static> items must preserve every committed prefix item by Object.is identity; append new items or remount <Static> to start a new history region.";

// Each accepted render snapshot is the immutable positional identity contract
// for this mounted history region. Object fields may change, but the array may
// only gain an uncommitted tail.
let committedItems: readonly unknown[] = [];
const cursor = shallowRef(0);
const renderState = computed(() => {
  const items = props.items as unknown[];
  // cursor is the reactive invalidator for an accepted longer snapshot;
  // committedItems itself stays plain so an output-free acceptance of the same
  // logical prefix cannot create a new-array rerender loop.
  void cursor.value;
  const committed = committedItems;
  if (items.length < committed.length) throw new Error(APPEND_ONLY_ERROR);
  for (let index = 0; index < committed.length; index++) {
    if (!Object.is(items[index], committed[index])) throw new Error(APPEND_ONLY_ERROR);
  }

  // The renderer accepts this exact render-time snapshot. Reading props.items
  // after stdout.write() returns would incorrectly consume a re-entrant append
  // or replacement that was not represented by the bytes just handed off.
  const renderedItems = items.slice();
  return {
    renderedItems,
    pendingItems: renderedItems.slice(committed.length),
  };
});
const onWritten = (renderedItems: readonly unknown[]) => {
  committedItems = renderedItems;
  if (cursor.value !== renderedItems.length) cursor.value = renderedItems.length;
};
// internal_onWritten folded into the v-bind object so the exact prop key reaches
// the host `static` node (object keys are preserved verbatim).
const merged = computed(() => ({
  position: "absolute",
  flexDirection: "column",
  ...props.style,
  internal_onWritten: onWritten,
  internal_renderedItems: renderState.value.renderedItems,
}));
const itemsToRender = computed(() => renderState.value.pendingItems);
</script>

<template>
  <tui-static v-bind="merged">
    <template v-for="(item, i) in itemsToRender" :key="cursor + i">
      <slot :item="item" :index="cursor + i" />
    </template>
  </tui-static>
</template>
