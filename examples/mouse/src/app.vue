<script setup lang="ts">
import { shallowRef } from "vue";
import {
  Box,
  Text,
  useDraggable,
  useInput,
  type TuiMouseEvent,
  type TuiWheelEvent,
} from "@vue-tui/runtime";

const clicks = shallowRef(0);
const lastClick = shallowRef("none");
const lastWheel = shallowRef("none");
const dragRef = shallowRef<InstanceType<typeof Box> | null>(null);

useInput((event) => {
  if (event.kind === "text" && event.text === "q") {
    process.exit(0);
    return "consume";
  }
  return "continue";
});

const { x: dragLeft, y: dragTop } = useDraggable(dragRef, {
  initialValue: { x: 2, y: 7 },
});

function onPanelClick(event: TuiMouseEvent) {
  clicks.value += 1;
  lastClick.value = `${event.button} @ ${event.offsetX},${event.offsetY} (${event.detail})`;
}

function onPanelWheel(event: TuiWheelEvent) {
  lastWheel.value = `${event.deltaX},${event.deltaY} @ ${event.offsetX},${event.offsetY}`;
}
</script>

<template>
  <Box flexDirection="column" width="100%" height="100%" :paddingX="1" :paddingY="1">
    <Text bold color="cyan">vue-tui mouse input</Text>
    <Text dimColor>Click, wheel, or drag the block. Press q to quit.</Text>

    <Box :marginTop="1" flexDirection="column">
      <Text>Clicks: {{ clicks }}</Text>
      <Text>Last click: {{ lastClick }}</Text>
      <Text>Last wheel: {{ lastWheel }}</Text>
    </Box>

    <Box
      :marginTop="1"
      :width="50"
      :height="10"
      borderStyle="single"
      borderColor="gray"
      @click="onPanelClick"
      @wheel="onPanelWheel"
    >
      <Box
        ref="dragRef"
        position="absolute"
        :left="dragLeft"
        :top="dragTop"
        :width="8"
        :height="3"
        borderStyle="round"
        borderColor="green"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="green">drag</Text>
      </Box>
    </Box>
  </Box>
</template>
