<script setup lang="ts">
import { shallowRef } from "vue";

// The `tui-` prefix keeps this internal host primitive out of the public
// component namespace, avoiding vue-tsc self-recursion.
defineOptions({ inheritAttrs: false });
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
