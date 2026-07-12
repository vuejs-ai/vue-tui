import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, h } from "vue";

// Model a complete terminal on the real stdout fd so the parent can inspect
// every acquire/restore byte after this process exits.
Object.assign(process.stdout, { isTTY: true, columns: 80, rows: 24 });

const App = defineComponent(() => () => h(Text, null, { default: () => "frame" }));
const app = createApp(App);
app.mount({
  mode: "fullscreen",
  liveUpdates: true,
  patchConsole: false,
  maxFps: 0,
  // process.exit() synchronously emits `exit` and then terminates without
  // returning to this commit. Its listener must therefore restore immediately,
  // rather than deferring cleanup until the surrounding transaction unwinds.
  onRender() {
    process.exit(0);
  },
});
