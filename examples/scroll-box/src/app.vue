<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted, type ComponentPublicInstance } from "vue";
import {
  Box,
  Text,
  useApp,
  useElementGeometry,
  useFocus,
  useFocusedInput,
  useLayoutSize,
  type InputRouteDecision,
} from "@vue-tui/runtime";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";

const { exit } = useApp();
const { rows } = useLayoutSize();

const box = shallowRef<ScrollBoxExpose>();
const scrollTarget = shallowRef<ComponentPublicInstance | null>(null);
const focus = useFocus(scrollTarget, { autoFocus: true });
const { geometry } = useElementGeometry(scrollTarget);
const lastRoute = shallowRef("ready");
const stopAtEdge: InputRouteDecision = {
  action: "none",
  routing: "stop",
  defaultAction: "prevent",
  external: "block",
};

// ScrollBox follows the bottom on its own. It ships no built-in input — this app
// wires focused keys to the exposed handle. A nested owner would return a
// routing:"continue" decision at an edge so an ancestor could try the same key;
// this single-owner example stops recognized navigation after recording it.
const lines = shallowRef<string[]>([]);
let n = 0;
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    n += 1;
    lines.value = [
      ...lines.value,
      `#${String(n).padStart(3, "0")}  streaming log line — the quick brown fox jumps over the lazy dog`,
    ];
  }, 350);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function pageLines(): number {
  const current = geometry.value;
  return current.status === "visible" ? Math.max(1, current.parent.height) : 1;
}

useFocusedInput(focus, (event) => {
  if (event.kind === "text" && event.text === "q") {
    exit();
    return "consume";
  }
  if (event.kind !== "key" || event.key.phase === "release") return "continue";
  const handle = box.value;
  if (!handle) return stopAtEdge;
  let moved: boolean;
  if (event.key.name === "up") moved = handle.scrollByLines(-1);
  else if (event.key.name === "down") moved = handle.scrollByLines(1);
  else if (event.key.name === "pageup") moved = handle.scrollByLines(-pageLines());
  else if (event.key.name === "pagedown") moved = handle.scrollByLines(pageLines());
  else if (event.key.name === "home") moved = handle.scrollToTop();
  else if (event.key.name === "end") moved = handle.scrollToBottom();
  else return "continue";
  lastRoute.value = `${event.key.name}:${moved ? "moved" : "edge"}`;
  return moved ? "consume" : stopAtEdge;
});
</script>

<template>
  <Box flexDirection="column" :height="rows ?? undefined">
    <Box borderStyle="round" :paddingLeft="1" :paddingRight="1">
      <Text bold color="cyan">ScrollBox demo</Text>
      <Text dimColor> — ↑/↓ · PageUp/PageDown · Home/End · q</Text>
    </Box>

    <Box
      :flexGrow="1"
      :minHeight="0"
      flexDirection="column"
      borderStyle="round"
      :paddingLeft="1"
      :paddingRight="1"
    >
      <Box ref="scrollTarget" :flexGrow="1" :minHeight="0" flexDirection="column">
        <ScrollBox ref="box">
          <Text v-for="line in lines" :key="line">{{ line }}</Text>
        </ScrollBox>
      </Box>
    </Box>

    <Box :paddingLeft="1" :paddingRight="1">
      <Text dimColor>
        {{ lines.length }} lines · focus={{ focus.isFocused.value ? "yes" : "no" }} ·
        {{ lastRoute }}
      </Text>
    </Box>
  </Box>
</template>
