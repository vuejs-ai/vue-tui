import process from "node:process";
import { createApp, Text, useApp, useInput, useStdin } from "@vue-tui/runtime";
import { defineComponent, h } from "vue";

const App = defineComponent(() => {
  const { exit } = useApp();
  useStdin().setRawMode(true);
  useStdin().setRawMode(true);
  useInput((event) => {
    if (event.type === "text" && event.text === "q") {
      exit();
    }
  });

  return () => h(Text, null, "Hello World");
});

const app = createApp(App);
app.mount();
await app.waitUntilRenderFlush();
process.stdout.write("__READY__");
await app.waitUntilExit();
console.log("exited");
