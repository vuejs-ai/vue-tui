import process from "node:process";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

// A non-empty interactive app. The first visible frame must lazily hide the
// cursor before it renders.
const App = defineComponent(() => {
  const { exit } = useApp();
  onMounted(() => {
    process.stdout.write("__READY__");
    setTimeout(() => exit(), 100);
  });
  return () => h(Text, null, () => "hello");
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
console.log("exited");
