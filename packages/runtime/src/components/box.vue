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

// Keep the template root free of comments. A root-level template comment makes
// the SFC compiler emit a development-root Fragment: Vue unwraps that Fragment
// for component directives in development, but production `v-show` never
// reaches the host. One conditional host root works in both builds.
function hostProps(): Record<string, unknown> {
  return explicitHostProps(props, componentInstance.vnode.props, boxProps);
}
</script>

<template>
  <tui-box
    v-if="assertNoUnsupportedAttrs('Box', attrs) && assertBoxValid(props)"
    v-bind="hostProps()"
  >
    <slot />
  </tui-box>
</template>
