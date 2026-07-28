import { createApp, Text, useApp, useStdin } from "@vue-tui/runtime";
import { defineComponent } from "vue";

let requestExit = (_error: Error): void => {
  throw new Error("App setup did not expose exit");
};

const App = defineComponent(() => {
  requestExit = useApp().exit;
  useStdin().setRawMode(true);
  return () => <Text>Hello World</Text>;
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
