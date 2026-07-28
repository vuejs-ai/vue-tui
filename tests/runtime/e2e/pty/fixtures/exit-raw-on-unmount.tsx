import { createApp, Text, useStdin } from "@vue-tui/runtime";
import { defineComponent } from "vue";

const App = defineComponent(() => {
  useStdin().setRawMode(true);

  return () => <Text>Hello World</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilRenderFlush();
app.unmount();
await app.waitUntilExit();
console.log("exited");
