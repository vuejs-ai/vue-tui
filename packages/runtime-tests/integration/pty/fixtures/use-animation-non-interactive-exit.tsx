import { Text, createApp, useAnimation, useExit } from "@vue-tui/runtime";
import { defineComponent, watch } from "vue";

const Spinner = defineComponent(() => {
  const { frame } = useAnimation({ interval: 8 });
  const exit = useExit();

  watch(frame, (value) => {
    if (value >= 3) {
      exit();
    }
  });

  return () => <Text>{String(frame.value)}</Text>;
});

const app = createApp(Spinner);
app.mount();

await app.waitUntilExit();
console.log("exited");
