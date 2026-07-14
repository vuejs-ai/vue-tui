import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

createApp(App).mount({ mode: "fullscreen", clipboard: { kind: "osc52" } });
