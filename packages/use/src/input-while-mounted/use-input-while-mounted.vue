<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { assertInputType } from "./use-input-while-mounted.ts";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  readonly type?: TuiInputEvent["type"];
}>();
const emit = defineEmits<{
  input: [event: TuiInputEvent];
}>();
const mounted = shallowRef(false);

// Setup validation runs before the subscription can claim managed input.
if (props.type !== undefined) assertInputType(props.type, "<UseInputWhileMounted>");

useInput(
  (event) => {
    // Event-time validation sends invalid reactive props through Runtime's fatal-input path.
    if (props.type !== undefined) {
      assertInputType(props.type, "<UseInputWhileMounted>");
      if (event.type !== props.type) return;
    }
    emit("input", event);
  },
  { isActive: mounted },
);
onMounted(() => {
  mounted.value = true;
});
onBeforeUnmount(() => {
  mounted.value = false;
});
</script>

<template>
  <slot />
</template>
