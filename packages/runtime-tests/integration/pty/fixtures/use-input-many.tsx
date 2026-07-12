import process from "node:process";
import { createApp, Text, useInput, useApp } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

// Detect MaxListenersExceededWarning
process.on("warning", (warning: Error) => {
  if (warning.name === "MaxListenersExceededWarning") {
    console.log("MaxListenersExceededWarning");
  }
});

const InputHandler = defineComponent(() => {
  useInput(() => "continue");
  return () => null;
});

const App = defineComponent(() => {
  const { exit } = useApp();

  onMounted(() => {
    setTimeout(exit, 100);
  });

  return () => (
    <>
      <InputHandler />
      <InputHandler />
      <InputHandler />
      <InputHandler />
      <InputHandler />
      <InputHandler />
      <InputHandler />
      <InputHandler />
      <InputHandler />
      <InputHandler />
      <InputHandler />
      {h(Text, null, "ready")}
    </>
  );
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
console.log("exited");
