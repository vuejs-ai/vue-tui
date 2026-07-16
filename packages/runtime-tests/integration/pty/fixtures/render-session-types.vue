<script setup lang="ts">
import { Text, useLayoutSize, useRenderSession } from "@vue-tui/runtime";

const session = useRenderSession();
const { columns, rows } = useLayoutSize();
</script>

<template>
  <Text>
    {{ session.host === "live" ? (session.mode.effective ?? "stream") : "document" }}:{{
      columns
    }}x{{ rows ?? "unbounded" }}
  </Text>
</template>
