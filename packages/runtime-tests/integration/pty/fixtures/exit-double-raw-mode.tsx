import process from "node:process";
import { createApp, Text, useApp, useInput } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

const App = defineComponent(() => {
  const { exit } = useApp();
  useInput((event) => {
    if (event.kind === "text" && event.text === "q") {
      exit();
    }
  });

  onMounted(() => {
    setTimeout(() => {
      process.stdout.write("__READY__");
    }, 500);
  });

  return () => h(Text, null, "Hello World");
});

const app = createApp(App);
app.mount();

await app.waitUntilExit();
console.log("exited");
