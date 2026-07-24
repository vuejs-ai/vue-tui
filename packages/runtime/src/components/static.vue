<script setup lang="ts">
import { shallowRef } from "vue";

// Renders the `<tui-static>` host primitive. The host tag's `tui-` prefix keeps it out
// of the component namespace, so the component can take its real name "Static" with no
// vue-tsc self-recursion on the tag. Public export wired in inline.ts.
defineOptions({ name: "Static", inheritAttrs: false });
defineSlots<{ default?: () => unknown }>();

// The component instance is the public write-once identity. Once Runtime has
// accepted its host subtree, remove that subtree (and its Yoga nodes) while
// keeping this component instance mounted so later reactive updates cannot
// replay terminal history. Remounting creates a fresh identity.
const accepted = shallowRef(false);
const hostProps = {
  position: "absolute",
  flexDirection: "column",
  internal_onAccepted: () => {
    accepted.value = true;
  },
};
</script>

<template>
  <tui-static v-if="!accepted" v-bind="hostProps">
    <slot />
  </tui-static>
</template>
