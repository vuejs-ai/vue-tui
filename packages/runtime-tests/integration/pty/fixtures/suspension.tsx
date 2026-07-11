import process from "node:process";
import {
  Box,
  createApp,
  Text,
  useApp,
  useInput,
  usePaste,
  useStderr,
  useWindowSize,
} from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const mode = process.argv.includes("fullscreen") ? "fullscreen" : "inline";
const marker = mode === "fullscreen" ? "FULLSCREEN_SNAPSHOT" : "INLINE_SNAPSHOT";

const App = defineComponent(() => {
  const { exit } = useApp();
  const { write } = useStderr();
  const { columns, rows } = useWindowSize();

  useInput((input) => {
    if (input === "q") exit();
  });
  usePaste(() => {});

  onMounted(() => {
    // Announce only after mount returns so the test starts from a fully painted
    // frame. Lifecycle handlers themselves are installed before terminal modes.
    setTimeout(() => write(`__READY__:${mode}:${process.pid}\n`), 50);
  });

  return () => (
    <Box flexDirection="column" width="100%" onClick={mode === "fullscreen" ? () => {} : undefined}>
      <Text>{`${marker}:${columns.value}x${rows.value}`}</Text>
      {Array.from({ length: Math.max(0, rows.value - 1) }, (_, index) => (
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
