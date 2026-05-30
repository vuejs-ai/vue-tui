import { createApp, Text, useApp } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const App = defineComponent(() => {
  const { exit } = useApp();

  onMounted(() => {
    setTimeout(() => {
      const error = new Error("errored");
      (error as Error & { value: string }).value = "hello from error";
      exit(error);
    }, 500);
  });

  return () => <Text>Testing</Text>;
});

const app = createApp(App);
app.mount();

try {
  await app.waitUntilExit();
} catch (error: unknown) {
  console.log((error as Error).message);
}
