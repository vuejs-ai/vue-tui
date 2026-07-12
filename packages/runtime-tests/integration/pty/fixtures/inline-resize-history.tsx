import process from "node:process";
import { Text, createApp, useApp } from "@vue-tui/runtime";
import { defineComponent, nextTick, onMounted, onScopeDispose, shallowRef } from "vue";

const presentation = process.argv[3] === "screen-reader" ? "screen-reader" : "visual";
const readyMarker = "\x1b]0;__READY__\x07";
const resizedMarker = "\x1b]0;INLINE_RESIZED\x07";

process.stdout.write("PRE_APP_HISTORY\n");
const frame = shallowRef(`OLD_REFLOW_FRAME_${"A".repeat(64)}\nOLD_TAIL`);

const App = defineComponent(() => {
  const { exit, waitUntilRenderFlush } = useApp();
  // This fixture waits for the parent PTY to resize it. Keep that external
  // rendezvous alive explicitly instead of relying on terminal-input ownership.
  const keepAlive = setInterval(() => {}, 1_000);

  const onResize = () => {
    void (async () => {
      frame.value = "NEW_FRAME";
      // Let every resize listener run, then wait for the runtime's synchronous
      // repaint and any queued Vue work before marking the byte boundary done.
      await nextTick();
      await waitUntilRenderFlush();
      process.stdout.write(resizedMarker);
      exit();
    })();
  };

  onMounted(() => {
    process.stdout.once("resize", onResize);
    void (async () => {
      await nextTick();
      await waitUntilRenderFlush();
      process.stdout.write(readyMarker);
    })();
  });
  onScopeDispose(() => {
    clearInterval(keepAlive);
    process.stdout.off("resize", onResize);
  });

  return () => <Text>{frame.value}</Text>;
});

createApp(App).mount({
  mode: presentation === "screen-reader" ? "fullscreen" : "inline",
  isScreenReaderEnabled: presentation === "screen-reader",
  exitOnCtrlC: false,
  maxFps: 0,
});
