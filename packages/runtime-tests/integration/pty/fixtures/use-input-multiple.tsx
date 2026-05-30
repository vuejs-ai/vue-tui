import process from "node:process";
import { createApp, Text, useInput, useAppContext } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, shallowRef } from "vue";

const App = defineComponent(() => {
  const { exit } = useAppContext();
  const input = shallowRef("");

  const handleInput = (char: string) => {
    input.value = input.value + char;
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
