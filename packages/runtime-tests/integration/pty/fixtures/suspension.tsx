import process from "node:process";
import { Box, createApp, Text, useApp, useInput, useLayoutSize, useStderr } from "@vue-tui/runtime";
import { useMouseDrag } from "@vue-tui/runtime/fullscreen";
import { defineComponent, onMounted, shallowRef, type ComponentPublicInstance } from "vue";
import { inputText } from "./input-event.js";

const mode = process.argv.includes("fullscreen") ? "fullscreen" : "inline";
const marker = mode === "fullscreen" ? "FULLSCREEN_SNAPSHOT" : "INLINE_SNAPSHOT";

const App = defineComponent(() => {
  const { exit } = useApp();
  const { write } = useStderr();
  const { columns, rows } = useLayoutSize();
  const mouseTarget = shallowRef<ComponentPublicInstance | null>(null);
  useMouseDrag(mouseTarget, () => {}, { isActive: mode === "fullscreen" });

  useInput((event) => {
    if (inputText(event) === "q") {
      exit();
      return "consume";
    }
    return "continue";
  });

  onMounted(() => {
    // Announce only after mount returns so the test starts from a fully painted
    // frame. Lifecycle handlers themselves are installed before terminal modes.
    setTimeout(() => write(`__READY__:${mode}:${process.pid}\n`), 50);
  });

  return () => (
    <Box ref={mouseTarget} flexDirection="column" width="100%">
      <Text>{`${marker}:${columns.value}x${rows.value ?? "unbounded"}`}</Text>
      {Array.from({ length: Math.max(0, (rows.value ?? 1) - 1) }, (_, index) => (
        <Text key={index}>{`row-${String(index + 2).padStart(2, "0")}`}</Text>
      ))}
    </Box>
  );
});

const app = createApp(App);
app.mount({
  mode,
  maxFps: 0,
  kittyKeyboard: { mode: "enabled" },
});

await app.waitUntilExit();
