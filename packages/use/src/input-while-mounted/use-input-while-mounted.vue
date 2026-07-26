<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";

defineOptions({ inheritAttrs: false });

const emit = defineEmits<{
  input: [event: TuiInputEvent];
}>();
const mounted = shallowRef(false);

useInput((event) => emit("input", event), { isActive: mounted });
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
