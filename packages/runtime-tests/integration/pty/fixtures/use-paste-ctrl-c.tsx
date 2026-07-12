import process from "node:process";
import { createApp, usePaste } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

// Regression fixture for the kitty-protocol Ctrl+C exit gap: an app that
// enables raw mode via usePaste() — which turns off the tty's Ctrl+C -> SIGINT
// translation — but never mounts useInput, so it carries no Ctrl+C exit guard
// of its own. Its usePaste demand keeps the shared controller active, so
// exitOnCtrlC must still exit on Ctrl+C under BOTH the legacy (\x03) and kitty
// (CSI-u) encodings. See .agents/docs/ink-divergences.md.
const PasteOnly = defineComponent(() => {
  usePaste(() => {});

  onMounted(() => {
    process.stdout.write("__READY__");
  });

  return () => null;
});

const app = createApp(PasteOnly);
app.mount({ exitOnCtrlC: true });
await app.waitUntilExit();
console.log("exited");
