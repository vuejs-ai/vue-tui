import { createApp, Text, useStdin } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const App = defineComponent(() => {
  const { setRawMode } = useStdin();

  onMounted(() => {
    setRawMode(true);
  });

  return () => <Text>Hello World</Text>;
});

const app = createApp(App);
app.mount();

setTimeout(() => {
  app.unmount();
}, 500);

await app.waitUntilExit();
console.log("exited");
