import { createApp, Text, useApp } from "@vue-tui/runtime";
import { defineComponent, onScopeDispose } from "vue";

let requestExit = (): void => {
  throw new Error("App setup did not expose exit");
};

const App = defineComponent(() => {
  requestExit = useApp().exit;
  // A leaked component scope keeps the child alive, so process exit proves
  // that exit() disposed the mounted tree as well as settling its promise.
  const keepAlive = setInterval(() => {}, 1_000);
  onScopeDispose(() => clearInterval(keepAlive));
  return () => <Text>Ready</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilRenderFlush();
requestExit();
await app.waitUntilExit();
console.log("exited");
