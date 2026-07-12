import process from "node:process";
import { createApp, Text, useInput, useApp, type TuiInputEvent } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, shallowRef } from "vue";
import { inputText } from "./input-event.js";

const App = defineComponent(() => {
  const { exit } = useApp();
  const input = shallowRef("");

  const handleInput = (event: TuiInputEvent) => {
    input.value += inputText(event) ?? "";
    return "continue" as const;
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
