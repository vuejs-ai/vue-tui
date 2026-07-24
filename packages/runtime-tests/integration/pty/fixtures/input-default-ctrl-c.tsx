import process from "node:process";
import { createApp, useInput } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

// Managed input owns raw and bracketed-paste mode. The explicit mount policy
// exits before either legacy or Kitty Ctrl+C reaches this handler.
const DefaultCtrlC = defineComponent(() => {
  useInput(() => {
    throw new Error("exitOnCtrlC must run before managed input delivery");
  });

  onMounted(() => {
    process.stdout.write("__READY__");
  });

  return () => null;
});

const app = createApp(DefaultCtrlC);
app.mount({ exitOnCtrlC: true });
await app.waitUntilExit();
console.log("exited");
