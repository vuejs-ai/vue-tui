import { createApp } from "@vue-tui/runtime";
import { defineComponent } from "vue";

// Root setup() throws during the INITIAL mount. In a dev build Vue then emits
// its "[Vue warn]: Component is missing template or render function." line on
// stderr. patchConsole is at its default (on) and debug is off, so that warn
// must be filtered even though it fires during the first mount.
const App = defineComponent(() => {
  throw new Error("setup boom");
});

const app = createApp(App);
app.mount();

try {
  await app.waitUntilExit();
  console.log("waitUntilExit:resolved");
} catch (error: unknown) {
  console.log(`waitUntilExit:rejected:${(error as Error).message}`);
}
