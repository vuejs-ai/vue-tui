import { createApp } from "@vue-tui/runtime";
import { defineComponent } from "vue";

const App = defineComponent(() => {
  throw new Error("errored");
});

const app = createApp(App);
app.mount();

try {
  await app.waitUntilExit();
} catch (error: unknown) {
  console.log((error as Error).message);
}
