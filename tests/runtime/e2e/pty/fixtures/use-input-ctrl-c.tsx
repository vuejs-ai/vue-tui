import process from "node:process";
import { createApp, useInput, useApp } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const UserInput = defineComponent(() => {
  const { exit } = useApp();

  useInput((event) => {
    if (event.type === "key" && event.key.character === "c" && event.key.ctrl && !event.key.shift) {
      exit();
      return;
    }

    throw new Error("Crash");
  });

  onMounted(() => {
    process.stdout.write("__READY__");
  });

  return () => null;
});

const app = createApp(UserInput);
app.mount();
await app.waitUntilExit();
console.log("exited");
