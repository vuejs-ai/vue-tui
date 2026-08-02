<script setup lang="ts">
import { getCurrentInstance, inject, provide, useAttrs } from "vue";
import { TextContextKey } from "../context.ts";
import { textProps } from "./text-props.ts";
import { assertTextValid } from "./text-validate.ts";
import { assertNoUnsupportedAttrs } from "./unsupported-attrs.ts";
import { explicitHostProps } from "./explicit-host-props.ts";

// The `tui-` prefix keeps these internal host primitives out of the public
// component namespace, avoiding vue-tsc self-recursion.
defineOptions({ inheritAttrs: false });
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

// A childless Text intentionally renders no host so it cannot introduce a flex
// gap. Do not cache this check: render functions may add or remove the default
// slot on the same component instance, and Vue forwards component directives to
// that render's current root.
function hasContent(): boolean {
  return slots.default != null;
}

function hostProps(): Record<string, unknown> {
  return explicitHostProps(props, componentInstance.vnode.props, textProps);
}

// Keep the template as one comment-free conditional root chain. A root-level
// template comment makes the SFC compiler emit a development-root Fragment:
// Vue unwraps that Fragment for component directives in development, but
// production `v-show` never reaches the concrete Text host.
function topLevelHostProps(): Record<string, unknown> {
  // Match Ink's <Text> defaults: text nodes shrink when they overflow a
  // no-wrap flex row.
  return { ...hostProps(), flexShrink: 1 };
}
</script>

<template>
  <tui-virtual-text
    v-if="
      insideText &&
      assertNoUnsupportedAttrs('Text', attrs) &&
      assertTextValid(props) &&
      hasContent()
    "
    v-bind="hostProps()"
  >
    <slot />
  </tui-virtual-text>
  <tui-text
    v-else-if="
      !insideText &&
      assertNoUnsupportedAttrs('Text', attrs) &&
      assertTextValid(props) &&
      hasContent()
    "
    v-bind="topLevelHostProps()"
  >
    <slot />
  </tui-text>
</template>
