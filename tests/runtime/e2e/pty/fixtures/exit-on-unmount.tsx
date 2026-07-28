import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, onScopeDispose } from "vue";

const App = defineComponent(() => {
  const keepAlive = setInterval(() => {}, 1_000);
  onScopeDispose(() => clearInterval(keepAlive));
  return () => <Text>Ready</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilRenderFlush();
app.unmount();
await app.waitUntilExit();
console.log("exited");
