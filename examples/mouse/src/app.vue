<script setup lang="ts">
import { shallowRef, type ComponentPublicInstance } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";
import {
  useMouseDrag,
  useMouseEvent,
  type TuiMouseClickEvent,
  type TuiMouseDragEvent,
  type TuiMouseWheelEvent,
} from "@vue-tui/runtime/fullscreen";

const clicks = shallowRef(0);
const lastClick = shallowRef("none");
const lastWheel = shallowRef("none");
const panelRef = shallowRef<ComponentPublicInstance | null>(null);
const dragRef = shallowRef<ComponentPublicInstance | null>(null);
const dragLeft = shallowRef(2);
const dragTop = shallowRef(7);

useInput((event) => {
  if (event.kind === "text" && event.text === "q") {
    process.exit(0);
    return "consume";
  }
  return "continue";
});

function onPanelClick(event: TuiMouseClickEvent) {
  clicks.value += 1;
  lastClick.value = `${event.button} @ ${event.local.x},${event.local.y}`;
  return "consume" as const;
}

function onPanelWheel(event: TuiMouseWheelEvent) {
  lastWheel.value = `${event.delta.x},${event.delta.y} @ ${event.local.x},${event.local.y}`;
  return "consume" as const;
}

function onDrag(event: TuiMouseDragEvent) {
  if (event.phase === "cancel") return;
  dragLeft.value += event.movement.x;
  dragTop.value += event.movement.y;
}

useMouseEvent(panelRef, "click", onPanelClick);
useMouseEvent(panelRef, "wheel", onPanelWheel);
useMouseDrag(dragRef, onDrag);
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
      ref="panelRef"
      :marginTop="1"
      :width="50"
      :height="10"
      borderStyle="single"
      borderColor="gray"
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
