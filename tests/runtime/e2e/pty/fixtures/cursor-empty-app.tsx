import process from "node:process";
import { createApp, useApp } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

// The no-input app owns no terminal-input state; it exits explicitly after
// signalling readiness so the PTY run resolves.
const App = defineComponent(() => {
  const { exit } = useApp();
  onMounted(() => {
    process.stdout.write("__READY__");
    setTimeout(() => exit(), 100);
  });
  return () => null;
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
console.log("exited");
