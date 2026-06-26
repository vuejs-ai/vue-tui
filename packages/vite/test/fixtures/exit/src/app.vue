<script setup lang="ts">
import { onMounted } from "vue";
import { Text, useApp } from "@vue-tui/runtime";
const app = useApp();
// Exit shortly after mount to exercise the in-process app-exit -> dev-server-close
// teardown path (useApp().exit() settles the app's exit promise).
onMounted(() => {
  setTimeout(() => app.exit(), 50);
});
</script>
<template>
  <Text>EXIT-FIXTURE</Text>
</template>
