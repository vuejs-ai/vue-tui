import { createApp, Text, useApp } from "@vue-tui/runtime";
import { defineComponent, onScopeDispose } from "vue";

let requestExit = (_error: Error): void => {
  throw new Error("App setup did not expose exit");
};

const App = defineComponent(() => {
  requestExit = useApp().exit;
  // Keep one real event-loop handle in the component scope. The child can
  // terminate only if the error exit disposes that scope.
  const keepAlive = setInterval(() => {}, 1_000);
  onScopeDispose(() => clearInterval(keepAlive));
  return () => <Text>Ready</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilRenderFlush();
requestExit(new Error("errored"));

try {
  await app.waitUntilExit();
} catch (error: unknown) {
  console.log((error as Error).message);
}
