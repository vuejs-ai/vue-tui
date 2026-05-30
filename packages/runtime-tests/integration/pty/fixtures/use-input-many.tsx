import process from "node:process";
import { createApp, Text, useInput, useAppContext } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

// Detect MaxListenersExceededWarning
process.on("warning", (warning: Error) => {
  if (warning.name === "MaxListenersExceededWarning") {
    console.log("MaxListenersExceededWarning");
  }
});

const InputHandler = defineComponent(() => {
  useInput(() => {});
  return () => null;
});

const App = defineComponent(() => {
  const { exit } = useAppContext();

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
