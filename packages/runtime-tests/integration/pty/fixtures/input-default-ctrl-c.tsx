import process from "node:process";
import { createApp, useInput } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

// Any active semantic input route owns raw mode and bracketed-paste mode. A
// handler that allows the delayed default therefore exits on both legacy and
// Kitty Ctrl+C encodings without a separate mount option.
const DefaultCtrlC = defineComponent(() => {
  useInput(() => undefined);

  onMounted(() => {
    process.stdout.write("__READY__");
  });

  return () => null;
});

const app = createApp(DefaultCtrlC);
app.mount();
await app.waitUntilExit();
console.log("exited");
