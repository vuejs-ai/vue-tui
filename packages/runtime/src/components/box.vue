<script setup lang="ts">
import { getCurrentInstance, useAttrs } from "vue";
import { boxProps } from "./box-props.ts";
import { assertBoxValid } from "./box-validate.ts";
import { assertNoUnsupportedAttrs } from "./unsupported-attrs.ts";
import { explicitHostProps } from "./explicit-host-props.ts";

// Renders the `<tui-box>` host primitive. The host tag's `tui-` prefix keeps it out
// of the component namespace, so the component can take its real name "Box" with no
// vue-tsc self-recursion on the tag. Public export wired in index.ts.
defineOptions({ name: "Box", inheritAttrs: false });
const props = defineProps(boxProps);
defineSlots<{ default?: () => unknown }>();
const attrs = useAttrs();
const instance = getCurrentInstance();
if (!instance) throw new Error("<Box> must be created inside a Vue component instance");
const componentInstance = instance;

function hostProps(): Record<string, unknown> {
  return explicitHostProps(props, componentInstance.vnode.props, boxProps);
}
</script>

<template>
  <!-- The root `v-if` makes this component a Vue Fragment, so its `$el` is the fragment's
       boundary anchor — NOT the `tui-box` host node; a Box ref is resolved to its host node
       by the shared rendered-target resolver. -->
  <tui-box
    v-if="assertNoUnsupportedAttrs('Box', attrs) && assertBoxValid(props)"
    v-bind="hostProps()"
  >
    <slot />
  </tui-box>
</template>
