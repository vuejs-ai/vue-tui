import process from "node:process";
import { Box, Text, createApp, useCaret, useFocus, useInput } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, shallowRef, type ComponentPublicInstance } from "vue";
import { inputText } from "./input-event.js";

// Sibling-topology storyboard for the persistent-cursor-re-assertion divergence.
//
// The spinner state (`spin`) lives in a sibling of the focused editor
// component, so a spinner tick re-renders only the sibling — the input child's
// own deps do not change. Under the old value/reference gate the input never
// re-declared its caret on that commit, so the caret zombied to the bottom-left
// corner. The fix re-emits the last-declared caret at the end of EVERY commit,
// so the caret survives the unrelated spinner repaint.
//
// Flow: type "hi" (element-local caret x = 2 + 2 = 4; paint maps it to row 1), then a spinner-only
// repaint fires with NO further keystroke. The final frame must still end at the
// declared column, not the corner.

const SPIN = ["|", "/", "-", "\\"];

const spin = shallowRef(0);
const typed = shallowRef("");

// The spinner — a SIBLING of the input. Its repaint must not orphan the caret.
const Spinner = defineComponent(
  () => () => h(Text, null, () => `${SPIN[spin.value % 4]} working...`),
);

// The input owns one focus-bound semantic caret.
const Input = defineComponent(() => {
  const target = shallowRef<ComponentPublicInstance | null>(null);
  const focus = useFocus(target, { autoFocus: true, tabIndex: -1 });
  useCaret(target, {
    focus,
    position: () => ({ x: 2 + typed.value.length, y: 0 }),
  });
  useInput((event) => {
    if (event.kind !== "text") return "continue";
    const text = inputText(event);
    if (!text) return "continue";
    typed.value += text;
    return "consume";
  });
  return () => h(Text, { ref: target }, () => `> ${typed.value}`);
});

const App = defineComponent(() => {
  onMounted(() => {
    process.stdout.write("__READY__");
  });
  return () => h(Box, { flexDirection: "column" }, [h(Spinner), h(Input)]);
});

const app = createApp(App);
app.mount({ stdout: process.stdout });

// Drive the storyboard once the app is mounted: the test writes "hi" to stdin,
// we wait for it to land, fire ONE spinner-only repaint (no keystroke), then
// exit so the captured byte stream ends right after the unrelated repaint.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
void (async () => {
  // Wait long enough for the two keystrokes to be processed and committed.
  await sleep(400);
  spin.value++; // spinner-only repaint — the caret must NOT zombie here
  await sleep(200);
  app.unmount();
})();

await app.waitUntilExit();
console.log("exited");
