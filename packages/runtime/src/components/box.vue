<script setup lang="ts">
import { computed, getCurrentInstance, useAttrs } from "vue";
import { useInternalRenderSession } from "../render-session.ts";
import { boxProps } from "./box-props.ts";
import { assertBoxValid, snapshotAriaState } from "./box-validate.ts";
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
const renderSession = useInternalRenderSession();
const srEnabled = computed(() => renderSession.session.output.presentation === "screen-reader");
const srHidden = computed(() => srEnabled.value && props.ariaHidden);
let acceptedAriaState: ReturnType<typeof snapshotAriaState>;

function validateProps(): true {
  acceptedAriaState = snapshotAriaState(props.ariaState);
  return assertBoxValid(props, !srEnabled.value);
}

function hostProps(): Record<string, unknown> {
  const forwarded = explicitHostProps(props, componentInstance.vnode.props, boxProps);
  if (Object.prototype.hasOwnProperty.call(forwarded, "ariaState")) {
    forwarded["ariaState"] = acceptedAriaState;
  }
  return forwarded;
}
</script>

<template>
  <!-- Structural props validate before any hidden-content branch. Paint-only color
       and border values are skipped for a screen-reader document because they are
       never consumed there. Under a screen reader with an ariaLabel, render the
       label text instead of the slot.
       The root `v-if` makes this component a Vue Fragment, so its `$el` is the fragment's
       boundary anchor — NOT the `tui-box` host node; a Box ref is resolved to its host node
       by the shared rendered-target resolver. -->
  <tui-box
    v-if="assertNoUnsupportedAttrs('Box', attrs) && validateProps() && !srHidden"
    v-bind="hostProps()"
  >
    <tui-text v-if="srEnabled && props.ariaLabel">{{ props.ariaLabel }}</tui-text>
    <slot v-else />
  </tui-box>
</template>
