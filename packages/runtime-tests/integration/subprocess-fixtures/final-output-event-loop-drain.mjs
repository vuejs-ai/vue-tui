import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, h } from "vue";

// Put the tail marker on its own logical line so terminal-width wrapping cannot
// split the marker itself. The preceding payload is still large enough to force
// stdout backpressure when the fixture is captured through a pipe.
const payload = `${"x".repeat(256 * 1024)}\nFINAL_OUTPUT_TAIL_MARKER`;
const App = defineComponent(() => () => h(Text, null, { default: () => payload }));

const app = createApp(App);
app.mount({
  liveUpdates: false,
  rawMode: "auto",
  patchConsole: false,
  exitOnCtrlC: false,
});

// Deliberately do not call unmount(), exit(), or waitUntilExit(). The runtime's
// mount lifecycle must finalize and flush the final-output stream when the event
// loop naturally drains.
