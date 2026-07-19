<script setup lang="ts">
import { shallowRef, type ComponentPublicInstance } from "vue";
import { Box, Text, useClipboard, useInput } from "@vue-tui/runtime";
import {
  useMouseDrag,
  useMouseEvent,
  useTextSelection,
  type TextSelectionMove,
  type TuiMouseClickEvent,
  type TuiMouseDragEvent,
  type TuiMouseWheelEvent,
} from "@vue-tui/runtime/fullscreen";

const clicks = shallowRef(0);
const lastClick = shallowRef("none");
const lastWheel = shallowRef("none");
const panelRef = shallowRef<ComponentPublicInstance | null>(null);
const dragRef = shallowRef<ComponentPublicInstance | null>(null);
const selectionRef = shallowRef<ComponentPublicInstance | null>(null);
const dragLeft = shallowRef(2);
const dragTop = shallowRef(2);
const copyStatus = shallowRef("not requested");
const manualFallback = shallowRef("");
const instructions =
  "Drag text to select. a: all · c: copy · arrows: move · Shift+arrows: extend · Esc: clear · q: quit";
const selectionLead = "Select complete graphemes like 你🙂 across ";
const selectionTail = " and soft wraps.";
const selectionMoves: Readonly<Record<string, TextSelectionMove>> = {
  left: "backward",
  right: "forward",
  up: "up",
  down: "down",
  home: "line-start",
  end: "line-end",
};

const clipboard = useClipboard();
const clipboardAvailability = clipboard.availability;
const selection = useTextSelection(selectionRef);
const selectionState = selection.state;

async function copySelection() {
  const result = await selection.copy();
  copyStatus.value = result.status;
  manualFallback.value =
    result.status === "unavailable" || result.status === "rejected" ? result.text : "";
}

useInput((event) => {
  if (event.kind === "key") {
    const direction = event.name === undefined ? undefined : selectionMoves[event.name];
    if (direction) {
      selection.move(direction, { extend: event.shift });
      return;
    }
    if (event.name === "escape") {
      selection.clear();
      return;
    }
  }

  const text = event.kind === "text" ? event.text : null;
  if (text === "q") {
    process.exit(0);
    return;
  }
  if (text === "a") {
    selection.selectAll();
    return;
  }
  if (text === "c") {
    void copySelection();
  }
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
  <Box
    flexDirection="column"
    width="100%"
    :flexGrow="1"
    :paddingTop="1"
    :paddingBottom="1"
    :paddingLeft="1"
    :paddingRight="1"
  >
    <Text bold color="cyan">vue-tui mouse, selection, and copy</Text>
    <Text dimColor>{{ instructions }}</Text>

    <Box :marginTop="1" flexDirection="column">
      <Text>Clicks: {{ clicks }}</Text>
      <Text>Last click: {{ lastClick }}</Text>
      <Text>Last wheel: {{ lastWheel }}</Text>
      <Text>Selection: {{ JSON.stringify(selectionState.selectedText) }}</Text>
      <Text>Clipboard: {{ clipboardAvailability.status }} · copy result: {{ copyStatus }}</Text>
      <Text v-if="manualFallback" color="yellow">Manual fallback: {{ manualFallback }}</Text>
    </Box>

    <Box :marginTop="1" :width="50" :height="4" borderStyle="single" borderColor="cyan">
      <Text ref="selectionRef"
        >{{ selectionLead }}<Text color="yellow">nested styles</Text>{{ selectionTail }}</Text
      >
    </Box>

    <Box
      ref="panelRef"
      :marginTop="1"
      :width="50"
      :height="5"
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
