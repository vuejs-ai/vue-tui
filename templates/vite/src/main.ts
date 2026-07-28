import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

const app = createApp(App);
app.mount({ exitOnCtrlC: true });
await app.waitUntilExit();
process.exit(0);
