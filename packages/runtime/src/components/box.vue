<script setup lang="ts">
import { computed, getCurrentInstance } from "vue";
import { useInternalRenderSession } from "../render-session.ts";
import { boxProps } from "./box-props.ts";
import { assertBoxValid } from "./box-validate.ts";
import { assertNoRejectedMouseListeners } from "./rejected-mouse-listeners.ts";

// Renders the `<tui-box>` host primitive. The host tag's `tui-` prefix keeps it out
// of the component namespace, so the component can take its real name "Box" with no
// vue-tsc self-recursion on the tag. Public export wired in index.ts.
defineOptions({ name: "Box" });
const props = defineProps(boxProps);
defineSlots<{ default?: () => unknown }>();
const instance = getCurrentInstance();
if (!instance) throw new Error("<Box> must be created inside a Vue component instance");
const componentInstance = instance;
const renderSession = useInternalRenderSession();
const srEnabled = computed(() => renderSession.session.output.presentation === "screen-reader");
const srHidden = computed(() => srEnabled.value && props.ariaHidden);

function validateRejectedListeners(): true {
  return assertNoRejectedMouseListeners("Box", componentInstance.vnode.props);
}
</script>

<template>
  <!-- assertBoxValid runs every render and throws into the error boundary, exactly
       as the former render fn did. It is skipped in two cases, both because the Box's
       visual props (bg/border colors, border shape) are then never painted, so there
       is nothing to validate and a throw would be spurious:
         - `!srHidden`: a screen-reader-hidden Box emits no node (mirrors box-validate.ts
           ordering: a non-emitted node never colorizes).
         - `srEnabled ||`: under GLOBAL screen-reader mode vue-tui (like Ink) linearizes
           the whole tree to PLAIN TEXT — it never colorizes / never draws borders for ANY
           node. Ink's render-node-to-output (the colorize path) is bypassed entirely under
           SR, so it never throws on an invalid color; verified against Ink v7.0.4 (with
           INK_SCREEN_READER=true a modifier-name backgroundColor renders plain text and
           does NOT throw; without it Ink throws in colorize). So we short-circuit to `true`
           under SR and render the box's accessible content instead of crashing.
       Under a screen reader with an ariaLabel, render the label text instead of the slot.
       The root `v-if` makes this component a Vue Fragment, so its `$el` is the fragment's
       boundary anchor — NOT the `tui-box` host node; a Box ref is resolved to its host node
       by the shared rendered-target resolver. -->
  <tui-box
    v-if="validateRejectedListeners() && !srHidden && (srEnabled || assertBoxValid(props))"
    v-bind="props"
  >
    <tui-text v-if="srEnabled && props.ariaLabel">{{ props.ariaLabel }}</tui-text>
    <slot v-else />
  </tui-box>
</template>
