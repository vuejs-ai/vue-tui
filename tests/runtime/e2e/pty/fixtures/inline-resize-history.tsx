import process from "node:process";
import { Text, createApp, useApp, type TuiApp } from "@vue-tui/runtime";
import { defineComponent, nextTick, onMounted, onScopeDispose, shallowRef } from "vue";

const readyMarker = "\x1b]0;__READY__\x07";
const resizedMarker = "\x1b]0;INLINE_RESIZED\x07";

process.stdout.write("PRE_APP_HISTORY\n");
const frame = shallowRef(`OLD_REFLOW_FRAME_${"A".repeat(64)}\nOLD_TAIL`);
let app: TuiApp;

const App = defineComponent(() => {
  const { exit } = useApp();
  // This fixture waits for the parent PTY to resize it. Keep that external
  // rendezvous alive explicitly instead of relying on terminal-input ownership.
  const keepAlive = setInterval(() => {}, 1_000);

  const onResize = () => {
    void (async () => {
      frame.value = "NEW_FRAME";
      // Let every resize listener run, then wait for the runtime's synchronous
      // repaint and any queued Vue work before marking the byte boundary done.
      await nextTick();
      await app.waitUntilRenderFlush();
      process.stdout.write(resizedMarker);
      exit();
    })();
  };

  onMounted(() => {
    process.stdout.once("resize", onResize);
    void (async () => {
      await nextTick();
      await app.waitUntilRenderFlush();
      process.stdout.write(readyMarker);
    })();
  });
  onScopeDispose(() => {
    clearInterval(keepAlive);
    process.stdout.off("resize", onResize);
  });

  return () => <Text>{{ default: () => frame.value }}</Text>;
});

app = createApp(App);
app.mount({ mode: "inline" });
