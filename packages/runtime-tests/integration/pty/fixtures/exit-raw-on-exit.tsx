import { createApp, Text, useApp, useInput } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const App = defineComponent(() => {
  const { exit } = useApp();
  useInput(() => {});

  onMounted(() => {
    setTimeout(exit, 500);
  });

  return () => <Text>Hello World</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
console.log("exited");
