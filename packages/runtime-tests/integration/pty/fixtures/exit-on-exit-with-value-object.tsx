import { createApp, Text, useExit } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const App = defineComponent(() => {
  const exit = useExit();

  onMounted(() => {
    setTimeout(() => {
      exit({ message: "hello from vue-tui object" });
    }, 500);
  });

  return () => <Text>Testing</Text>;
});

const app = createApp(App);
app.mount();
const result = await app.waitUntilExit();
console.log(`result:${(result as { message: string }).message}`);
