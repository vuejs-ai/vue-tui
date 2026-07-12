import { createApp, Text, useApp, useInput } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const App = defineComponent(() => {
  const { exit } = useApp();
  useInput(() => "continue");

  onMounted(() => {
    setTimeout(() => {
      exit(new Error("errored"));
    }, 500);
  });

  return () => <Text>Hello World</Text>;
});

const app = createApp(App);
app.mount();

try {
  await app.waitUntilExit();
} catch (error: unknown) {
  console.log((error as Error).message);
}
