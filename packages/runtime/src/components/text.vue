<script setup lang="ts">
import { computed, inject, provide } from "vue";
import { TextContextKey } from "../context.ts";
import { useInternalRenderSession } from "../render-session.ts";
import { assertValidBackgroundColor, assertValidForegroundColor } from "../paint/text-style.ts";
import { textProps } from "./text-props.ts";

// Renders the `<tui-text>` / `<tui-virtual-text>` host primitives. The `tui-` prefix
// keeps the host tags out of the component namespace, so the component can take its
// real name "Text" with no vue-tsc self-recursion. Public export wired in index.ts.
defineOptions({ name: "Text" });
const props = defineProps(textProps);
const slots = defineSlots<{ default?: () => unknown }>();

// Read whether an ANCESTOR established a text context BEFORE we provide our own —
// inject resolves up the parent chain, not our own provide, so a top-level <Text>
// provides true yet reads false here; descendants then see true and render inline.
provide(TextContextKey, true);
const insideText = inject(TextContextKey, false);
const renderSession = useInternalRenderSession();

const srEnabled = computed(() => renderSession.session.output.presentation === "screen-reader");
const srHidden = computed(() => srEnabled.value && props.ariaHidden);
const srLabel = computed(() => (srEnabled.value && props.ariaLabel ? props.ariaLabel : null));
const hasContent = computed(() => srLabel.value != null || slots.default != null);

// Validate color + backgroundColor every render (matches Box); throws into the
// error boundary. BEFORE the hasContent gate but after !srHidden, so a childless
// Text with an invalid color still throws (Phase-3 always-validate — an invalid
// color is invalid regardless of content; the content gate is a latent footgun).
// Validating during RENDER (not paint) means a value Ink's colorize.ts throws on —
// a chalk-modifier-name backgroundColor, or a foreground key chalk has but can't
// call like "level" — is caught by vue-tui's error boundary, not the post-flush
// paint pass where a throw wedges the scheduler. Returns true for the v-if.
//
// Skipped under GLOBAL screen-reader mode (`srEnabled ||` in the v-if below): under
// SR vue-tui (like Ink) linearizes the tree to PLAIN TEXT and never colorizes any
// node, so these color props are never painted — validating them would throw
// spuriously and crash a screen-reader user out of accessible content. Verified
// against Ink v7.0.4 (INK_SCREEN_READER=true → modifier-name bg renders plain text,
// does NOT throw; without it Ink throws in colorize). Mirrors box.vue.
function validate(): true {
  assertValidForegroundColor(props.color);
  assertValidBackgroundColor(props.backgroundColor);
  return true;
}
</script>

<template>
  <template v-if="!srHidden && (srEnabled || validate()) && hasContent">
    <tui-virtual-text v-if="insideText" v-bind="props">
      <template v-if="srLabel">{{ srLabel }}</template>
      <slot v-else />
    </tui-virtual-text>
    <!-- Match Ink's <Text> defaults: flexShrink=1 so text nodes shrink when they
         overflow their container (e.g. in no-wrap flex rows). -->
    <tui-text v-else v-bind="{ ...props, flexShrink: 1 }">
      <template v-if="srLabel">{{ srLabel }}</template>
      <slot v-else />
    </tui-text>
  </template>
</template>
