import { createApp } from "@vue-tui/runtime";
import { defineComponent } from "vue";

const App = defineComponent(() => {
  throw new Error("errored");
});

const app = createApp(App);
const exited = app.waitUntilExit();
let mountThrew = false;
let mountError: unknown;
try {
  app.mount();
} catch (error) {
  mountThrew = true;
  mountError = error;
}

if (!mountThrew) throw new Error("Expected the consumed mount to throw");
try {
  await exited;
  throw new Error("Expected waitUntilExit() to reject");
} catch (error: unknown) {
  if (error !== mountError) {
    throw new Error("mount() and waitUntilExit() did not preserve the same component error");
  }
  console.log((error as Error).message);
}
