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

// In the setup body, ahead of useInput: Vue routes a throw from inside a watcher or
// computed to its error handler, which reports and continues in a production build,
// so this subscription would claim managed input and then filter every event away.
if (props.type !== undefined) assertInputType(props.type, "<UseInputWhileMounted>");

useInput(
  (event) => {
    // `type` is reactive, so a later unusable value cannot be caught during setup.
    // Failing here reaches the application through Runtime's fatal-input path
    // rather than silently dropping every event while raw mode is still held.
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
