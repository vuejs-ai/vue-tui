import process from "node:process";
import { createApp, Text, useInput, useApp, type TuiInputEvent } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, shallowRef } from "vue";

const App = defineComponent(() => {
  const { exit } = useApp();
  const input = shallowRef("");

  const handleInput = (event: TuiInputEvent) => {
    if (event.type === "text" || event.type === "paste") input.value += event.text;
  };

  useInput(handleInput);
  useInput(handleInput, { isActive: false });

  onMounted(() => {
    process.stdout.write("__READY__");

    setTimeout(exit, 100);
  });

  return () => h(Text, null, input.value);
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
console.log("exited");
