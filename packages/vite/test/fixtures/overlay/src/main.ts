import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";
const stdout =
  (globalThis as { __VT_TEST_STDOUT__?: NodeJS.WriteStream }).__VT_TEST_STDOUT__ ?? process.stdout;
const app = createApp(App);
(globalThis as { __VT_TEST_APP__?: typeof app }).__VT_TEST_APP__ = app;
app.mount({ liveUpdates: true, patchConsole: false, maxFps: 0, stdout });
