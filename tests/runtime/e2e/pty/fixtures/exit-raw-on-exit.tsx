import { createApp, Text, useApp, useStdin } from "@vue-tui/runtime";
import { defineComponent } from "vue";

let requestExit = (): void => {
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
requestExit();
await app.waitUntilExit();
console.log("exited");
