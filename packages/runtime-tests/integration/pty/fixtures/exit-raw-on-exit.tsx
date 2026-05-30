import { createApp, Text, useAppContext, useStdin } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const App = defineComponent(() => {
  const { exit } = useAppContext();
  const { setRawMode } = useStdin();

  onMounted(() => {
    setRawMode(true);
    setTimeout(exit, 500);
  });

  return () => <Text>Hello World</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
console.log("exited");
