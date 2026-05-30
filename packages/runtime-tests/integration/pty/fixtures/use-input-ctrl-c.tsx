import process from "node:process";
import { createApp, useInput, useApp } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const UserInput = defineComponent(() => {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "c" && key.ctrl) {
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
app.mount({ exitOnCtrlC: false });
await app.waitUntilExit();
console.log("exited");
