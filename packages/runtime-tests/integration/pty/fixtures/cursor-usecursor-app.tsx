import process from "node:process";
import { Box, Text, createApp, useApp, useCursor } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

// A useCursor app. log-update hides-then-shows the cursor within a single
// render(): it lazily hides at the top, then emits the cursor SHOW + cursorTo
// suffix for the active position. So the LAST cursor visibility change on the
// first frame must be a SHOW (cursor visible at the requested position), with no
// trailing re-hide — exactly Ink's ordering, and unchanged by removing the eager
// mount-time hide.
const App = defineComponent(() => {
  const { exit } = useApp();
  const { setCursorPosition } = useCursor();
  onMounted(() => {
    process.stdout.write("__READY__");
    setTimeout(() => exit(), 100);
  });
  return () => {
    setCursorPosition({ x: 2, y: 0 });
    return h(Box, null, () => h(Text, null, () => "> "));
  };
});

const app = createApp(App);
app.mount({ exitOnCtrlC: false });
await app.waitUntilExit();
console.log("exited");
