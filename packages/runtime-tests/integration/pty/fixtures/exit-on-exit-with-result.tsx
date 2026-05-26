import { createApp, Text, useExit } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const App = defineComponent(() => {
  const exit = useExit();

  onMounted(() => {
    setTimeout(() => {
      exit("hello from vue-tui");
    }, 500);
  });

  return () => <Text>Testing</Text>;
});

const app = createApp(App);
app.mount();
const result = await app.waitUntilExit();
console.log(`result:${String(result)}`);
