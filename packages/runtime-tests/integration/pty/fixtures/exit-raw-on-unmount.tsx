import { createApp, Text, useInput } from "@vue-tui/runtime";
import { defineComponent } from "vue";

const App = defineComponent(() => {
  useInput(() => "continue");

  return () => <Text>Hello World</Text>;
});

const app = createApp(App);
app.mount();

setTimeout(() => {
  app.unmount();
}, 500);

await app.waitUntilExit();
console.log("exited");
