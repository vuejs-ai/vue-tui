import process from "node:process";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

// A non-empty interactive app. The first frame has content, so log-update's
// render() runs and its lazy hide fires — the cursor MUST be hidden on the first
// render, matching Ink. This proves the lazy hide fully covers the non-empty
// case once the eager mount-time hide is removed.
const App = defineComponent(() => {
  const { exit } = useApp();
  onMounted(() => {
    process.stdout.write("__READY__");
    setTimeout(() => exit(), 100);
  });
  return () => h(Text, null, () => "hello");
});

const app = createApp(App);
app.mount({ rawMode: "auto", exitOnCtrlC: false });
await app.waitUntilExit();
console.log("exited");
