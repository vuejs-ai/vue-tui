import process from "node:process";
import { createApp, Text, useStdin } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

const App = defineComponent(() => {
  const { setRawMode } = useStdin();

  onMounted(() => {
    setRawMode(true);

    setTimeout(() => {
      setRawMode(false);
      setRawMode(true);

      process.stdout.write("__READY__");
    }, 500);
  });

  return () => h(Text, null, "Hello World");
});

const app = createApp(App);
app.mount();

process.stdin.on("data", (data) => {
  if (String(data) === "q") {
    app.unmount();
  }
});

await app.waitUntilExit();
console.log("exited");
