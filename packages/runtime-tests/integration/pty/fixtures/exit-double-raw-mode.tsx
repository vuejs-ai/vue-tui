import process from "node:process";
import { createApp, Text, useStdin } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const App = defineComponent(() => {
  const { setRawMode } = useStdin();

  onMounted(() => {
    setRawMode(true);

    setTimeout(() => {
      setRawMode(false);
      setRawMode(true);

      // Start the test
      process.stdout.write("s");
    }, 500);
  });

  return () => <Text>Hello World</Text>;
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
