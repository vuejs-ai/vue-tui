<script setup lang="ts">
import { computed, getCurrentInstance, inject, provide, useAttrs } from "vue";
import { TextContextKey } from "../context.ts";
import { textProps } from "./text-props.ts";
import { assertTextValid } from "./text-validate.ts";
import { assertNoUnsupportedAttrs } from "./unsupported-attrs.ts";
import { explicitHostProps } from "./explicit-host-props.ts";

// Renders the `<tui-text>` / `<tui-virtual-text>` host primitives. The `tui-` prefix
// keeps the host tags out of the component namespace, so the component can take its
// real name "Text" with no vue-tsc self-recursion. Public export wired in index.ts.
defineOptions({ name: "Text", inheritAttrs: false });
const props = defineProps(textProps);
const slots = defineSlots<{ default?: () => unknown }>();
const attrs = useAttrs();
const instance = getCurrentInstance();
if (!instance) throw new Error("<Text> must be created inside a Vue component instance");
const componentInstance = instance;

// Read whether an ANCESTOR established a text context BEFORE we provide our own —
// inject resolves up the parent chain, not our own provide, so a top-level <Text>
// provides true yet reads false here; descendants then see true and render inline.
provide(TextContextKey, true);
const insideText = inject(TextContextKey, false);
const hasContent = computed(() => slots.default != null);

function hostProps(): Record<string, unknown> {
  return explicitHostProps(props, componentInstance.vnode.props, textProps);
}
</script>

<template>
  <template v-if="assertNoUnsupportedAttrs('Text', attrs) && assertTextValid(props) && hasContent">
    <tui-virtual-text v-if="insideText" v-bind="hostProps()">
      <slot />
    </tui-virtual-text>
    <!-- Match Ink's <Text> defaults: flexShrink=1 so text nodes shrink when they
         overflow their container (e.g. in no-wrap flex rows). -->
    <tui-text v-else v-bind="{ ...hostProps(), flexShrink: 1 }">
      <slot />
    </tui-text>
  </template>
</template>
