import { Text, createApp, useAnimation, useApp } from "@vue-tui/runtime";
import { defineComponent, h, watch } from "vue";

const Spinner = defineComponent(() => {
  const { frame } = useAnimation({ interval: 8 });
  const { exit } = useApp();

  watch(frame, (value) => {
    if (value >= 3) {
      exit();
    }
  });

  return () => h(Text, null, String(frame.value));
});

const app = createApp(Spinner);
app.mount({ liveUpdates: false });

await app.waitUntilExit();
console.log("exited");
