import { createApp } from "@vue-tui/runtime";
import { reportFixtureLifecycle } from "../../../harness/fixture-lifecycle.ts";
import App from "./app.vue";

const app = createApp(App);
reportFixtureLifecycle(app);
// Fullscreen owns the alternate screen and commits by line diff, which is the
// case the old frame oracle could not read.
app.mount({ mode: "fullscreen" });
