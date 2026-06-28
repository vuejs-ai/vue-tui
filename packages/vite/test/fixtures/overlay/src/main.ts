import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";
const stdout =
  (globalThis as { __VT_TEST_STDOUT__?: NodeJS.WriteStream }).__VT_TEST_STDOUT__ ?? process.stdout;
createApp(App).mount({ debug: true, stdout });
