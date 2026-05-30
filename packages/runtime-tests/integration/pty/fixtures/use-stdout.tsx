import { createApp, Text, useStdout, useAppContext } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

const WriteToStdout = defineComponent(() => {
  const { write } = useStdout();
  const { exit } = useAppContext();

  onMounted(() => {
    write("Hello from vue-tui to stdout\n");
    exit();
  });

  return () => h(Text, null, { default: () => "Hello World" });
});

const app = createApp(WriteToStdout);
app.mount();
await app.waitUntilExit();
console.log("exited");
