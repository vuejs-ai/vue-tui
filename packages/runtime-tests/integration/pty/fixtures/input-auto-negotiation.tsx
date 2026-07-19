import process from "node:process";
import { createApp, useApp, useInput } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const InputAutoNegotiation = defineComponent(() => {
  const { exit } = useApp();
  const observed: string[] = [];

  useInput((event) => {
    if (event.kind !== "text") {
      exit(new Error(`expected text input, received ${event.kind}`));
      return;
    }
    observed.push(event.text);
    if (event.text !== "b") return;

    setTimeout(() => {
      const serialized = JSON.stringify(observed);
      process.stdout.write(`__AUTO_INPUTS__:${serialized}`);
      if (serialized === '["a","b"]') exit();
      else exit(new Error(`unexpected input after private negotiation: ${serialized}`));
    }, 30);
  });

  onMounted(() => {
    process.stdout.write("__READY__");
  });

  return () => null;
});

const app = createApp(InputAutoNegotiation);
app.mount();
await app.waitUntilExit();
console.log("exited");
