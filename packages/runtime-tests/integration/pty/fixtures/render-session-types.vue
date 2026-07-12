<script setup lang="ts">
import { Text, useLayoutSize, useRenderSession, useStdin } from "@vue-tui/runtime";

const session = useRenderSession();
const { columns, rows } = useLayoutSize();
const { stdin } = useStdin();
void stdin;
// @ts-expect-error Raw-mode control is internal to semantic input demand.
useStdin().setRawMode(false);
</script>

<template>
  <Text>
    {{ session.host === "live" ? (session.mode.effective ?? "stream") : "document" }}:{{
      columns
    }}x{{ rows ?? "unbounded" }}
  </Text>
</template>
