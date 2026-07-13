<script setup lang="ts">
import { shallowRef, type ComponentPublicInstance } from "vue";
import {
  Box,
  Text,
  useExternalInput,
  useFocus,
  useFocusedInput,
  useFocusManager,
  useFocusScope,
  useFocusScopeInput,
} from "@vue-tui/runtime";

const host = shallowRef<ComponentPublicInstance | null>(null);
const scope = useFocusScope({ trapped: true });
const target = useFocus(host, { scope, autoFocus: true, tabIndex: 0 });
const manager = useFocusManager();
useFocusedInput(target, () => "continue");
useFocusScopeInput(scope, () => "continue");
useExternalInput(target, ({ event, sequence, fidelity }) => {
  void event;
  void sequence;
  void fidelity;
});

// @ts-expect-error String identity was removed from the clean-slate focus API.
useFocus(host, { id: "legacy" });
// @ts-expect-error The manager exposes the exact opaque target instead of an active string ID.
void manager.activeId;
</script>

<template>
  <Box ref="host">
    <Text>{{ target.isFocused.value }}:{{ scope.containsFocus.value }}</Text>
  </Box>
</template>
