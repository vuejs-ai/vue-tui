import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, h } from "vue";

Object.assign(process.stdout, { isTTY: true, columns: 80, rows: 24 });

let renderCount = 0;
const App = defineComponent(() => () => h(Text, null, { default: () => "frame" }));
const app = createApp(App);
app.mount({
  mode: "fullscreen",
  liveUpdates: true,
  rawMode: "auto",
  patchConsole: false,
  exitOnCtrlC: false,
  maxFps: 0,
  onRender() {
    renderCount++;
    // The second render is normal unmount's final commit. process.exit() does
    // not return, so an already-running teardown must still restore the screen
    // before this callback's exit listener returns.
    if (renderCount === 2) process.exit(0);
  },
});
app.unmount();
