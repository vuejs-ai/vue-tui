<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, type TuiInputEvent } from "@vue-tui/runtime";
import { UseInputWhileMounted } from "../../src/components.ts";
import { useInputWhileMounted } from "../../src/index.ts";

type KeyInputEvent = Extract<TuiInputEvent, { readonly type: "key" }>;
type TextInputEvent = Extract<TuiInputEvent, { readonly type: "text" }>;
type KeyOrTextInputEvent = Extract<TuiInputEvent, { readonly type: "key" | "text" }>;

const selectedType = shallowRef<"key" | "text">("key");
const optionalSelectedType = shallowRef<"key" | undefined>(undefined);

const targetRef = useInputWhileMounted((event) => {
  if (event.type === "text") event.text.toUpperCase();
});
const keyTargetRef = useInputWhileMounted(
  (event) => {
    event.key.name?.toUpperCase();
  },
  { type: "key" },
);

function handleInput(event: TuiInputEvent): void {
  if (event.type === "paste") event.text.toUpperCase();
}

function handleWrongInput(_event: number): void {}

function handleKey(event: KeyInputEvent): void {
  event.key.name?.toUpperCase();
}

function handleText(event: TextInputEvent): void {
  event.text.toUpperCase();
}

function handleKeyOrText(event: KeyOrTextInputEvent): void {
  if (event.type === "key") event.key.name?.toUpperCase();
  else event.text.toUpperCase();
}
</script>

<template>
  <Box :ref="targetRef">
    <Text>hook</Text>
  </Box>
  <Box :ref="keyTargetRef">
    <Text>filtered hook</Text>
  </Box>
  <UseInputWhileMounted @input="handleInput">
    <Text>component</Text>
  </UseInputWhileMounted>
  <UseInputWhileMounted type="key" @input="handleKey" />
  <!-- @vue-expect-error A text-only handler cannot handle key events. -->
  <UseInputWhileMounted type="key" @input="handleText" />
  <UseInputWhileMounted type="key" @input="$event.key.name?.toUpperCase()" />
  <!-- @vue-expect-error A key event has no text value. -->
  <UseInputWhileMounted type="key" @input="$event.text.toUpperCase()" />
  <UseInputWhileMounted type="text" @input="handleText" />
  <UseInputWhileMounted :type="selectedType" @input="handleKeyOrText" />
  <UseInputWhileMounted :type="optionalSelectedType" @input="handleInput" />
  <!-- @vue-expect-error An omitted selector can emit an event without key data. -->
  <UseInputWhileMounted :type="optionalSelectedType" @input="$event.key.name?.toUpperCase()" />
  <UseInputWhileMounted type="text" @input="$event.text.toUpperCase()" />
  <!-- @vue-expect-error Text key data is optional. -->
  <UseInputWhileMounted type="text" @input="$event.key.name?.toUpperCase()" />
  <UseInputWhileMounted type="paste" @input="$event.text.toUpperCase()" />
  <!-- @vue-expect-error A paste event has no key value. -->
  <UseInputWhileMounted type="paste" @input="$event.key.name?.toUpperCase()" />
  <!-- @vue-expect-error The selector must be a public input event type. -->
  <UseInputWhileMounted type="mouse" />
  <!-- @vue-expect-error input emits TuiInputEvent, not number. -->
  <UseInputWhileMounted @input="handleWrongInput" />
</template>
