import { createApp, Text } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../runtime/dist/internal.mjs";
import { defineComponent, h } from "vue";

// Put the durable marker on the first modeled line so the fixed 80×24 non-TTY
// document host cannot clip it away while still writing a large final payload
// that can back-pressure a pipe.
const payload = `FINAL_OUTPUT_TAIL_MARKER\n${"x".repeat(256 * 1024)}`;
const App = defineComponent(() => () => h(Text, null, { default: () => payload }));

const app = createApp(App);
app.mount(
  createInternalMountOptions({
    liveUpdates: false,
    patchConsole: false,
  }),
);

// Deliberately do not call unmount(), exit(), or waitUntilExit(). The runtime's
// mount lifecycle must finalize and flush the final-output stream when the event
// loop naturally drains.
