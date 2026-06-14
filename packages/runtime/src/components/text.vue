<script setup lang="ts">
import { computed, inject, provide } from "vue";
import { AppContextKey, TextContextKey } from "../context.ts";
import { assertValidBackgroundColor, assertValidForegroundColor } from "../paint/text-style.ts";
import { textProps } from "./text-props.ts";

// Internal name != "Text" to avoid vue-tsc self-recursion on the `<text>` host tag.
// The public export name "Text" comes from index.ts.
defineOptions({ name: "TextImpl" });
const props = defineProps(textProps);
const slots = defineSlots<{ default?: () => unknown }>();

// Read whether an ANCESTOR established a text context BEFORE we provide our own —
// inject resolves up the parent chain, not our own provide, so a top-level <Text>
// provides true yet reads false here; descendants then see true and render inline.
provide(TextContextKey, true);
const insideText = inject(TextContextKey, false);
const appCtx = inject(AppContextKey, null);

const srEnabled = computed(() => appCtx?.isScreenReaderEnabled ?? false);
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
function validate(): true {
  assertValidForegroundColor(props.color);
  assertValidBackgroundColor(props.backgroundColor);
  return true;
}
</script>

<template>
  <template v-if="!srHidden && validate() && hasContent">
    <virtual-text v-if="insideText" v-bind="props">
      <template v-if="srLabel">{{ srLabel }}</template>
      <slot v-else />
    </virtual-text>
    <!-- Match Ink's <Text> defaults: flexShrink=1 so text nodes shrink when they
         overflow their container (e.g. in no-wrap flex rows). -->
    <text v-else v-bind="{ ...props, flexShrink: 1 }">
      <template v-if="srLabel">{{ srLabel }}</template>
      <slot v-else />
    </text>
  </template>
</template>
