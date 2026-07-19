import process from "node:process";
import { INTERNAL_KITTY_KEYBOARD } from "../../../../runtime/dist/internal.mjs";
import type { InternalMountOptions } from "../../../../runtime/dist/internal.mjs";
import {
  Box,
  createApp,
  Text,
  useApp,
  useInput,
  useLayoutWidth,
  useViewportHeight,
} from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";
import { inputText } from "./input-event.js";

const mode = process.argv.includes("fullscreen") ? "fullscreen" : "inline";
const marker = mode === "fullscreen" ? "FULLSCREEN_SNAPSHOT" : "INLINE_SNAPSHOT";

const App = defineComponent(() => {
  const { exit } = useApp();
  const width = useLayoutWidth();
  const viewportHeight = useViewportHeight();
  useInput((event) => {
    if (inputText(event) === "q") {
      exit();
    }
  });

  onMounted(() => {
    // Announce only after mount returns so the test starts from a fully painted
    // frame. Lifecycle handlers themselves are installed before terminal modes.
    setTimeout(() => console.error(`__READY__:${mode}:${process.pid}`), 50);
  });

  return () => (
    <Box flexDirection="column" width="100%">
      <Text>{`${marker}:${width.value}x${viewportHeight?.value ?? "unbounded"}`}</Text>
      {Array.from({ length: Math.max(0, (viewportHeight?.value ?? 1) - 1) }, (_, index) => (
        <Text key={index}>{`row-${String(index + 2).padStart(2, "0")}`}</Text>
      ))}
    </Box>
  );
});

const app = createApp(App);
app.mount({
  mode,
  maxFps: 0,
  [INTERNAL_KITTY_KEYBOARD]: { mode: "enabled" },
} as InternalMountOptions);

await app.waitUntilExit();
