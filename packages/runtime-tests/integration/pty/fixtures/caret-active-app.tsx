import process from "node:process";
import { Box, Text, createApp, useApp, useCaret, useFocus } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, shallowRef, type ComponentPublicInstance } from "vue";

// A focused editor requests a semantic caret at the trailing cell of "> ".
// The physical writer hides and then restores the terminal cursor within the
// same frame, so the last visibility change must be SHOW at column 2.
const App = defineComponent(() => {
  const { exit } = useApp();
  const target = shallowRef<ComponentPublicInstance | null>(null);
  const focus = useFocus(target, { autoFocus: true, tabIndex: -1 });
  useCaret(target, { focus, position: { x: 2, y: 0 } });

  onMounted(() => {
    process.stdout.write("__READY__");
    setTimeout(() => exit(), 100);
  });

  return () => h(Box, null, () => h(Text, { ref: target }, () => "> "));
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
console.log("exited");
