import { createApp } from "@vue-tui/runtime";
import { reportFixtureLifecycle } from "../../../harness/fixture-lifecycle.ts";
import App from "./app.tsx";

const app = createApp(App);
reportFixtureLifecycle(app);
app.mount();
