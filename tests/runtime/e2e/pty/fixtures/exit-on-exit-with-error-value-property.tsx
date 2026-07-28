import { createApp, Text, useApp } from "@vue-tui/runtime";
import { defineComponent } from "vue";

let requestExit = (_error: Error): void => {
  throw new Error("App setup did not expose exit");
};

const App = defineComponent(() => {
  requestExit = useApp().exit;
  return () => <Text>Testing</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilRenderFlush();
const exitError = new Error("errored");
(exitError as Error & { value: string }).value = "hello from error";
requestExit(exitError);

try {
  await app.waitUntilExit();
} catch (error: unknown) {
  console.log((error as Error).message);
}
