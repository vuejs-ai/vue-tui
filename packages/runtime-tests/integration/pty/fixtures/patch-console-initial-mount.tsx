import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, inject } from "vue";

// A real Vue warning emitted during initial setup must be intercepted before
// the first user component runs and forwarded without content filtering.
const App = defineComponent(() => {
  inject("intentionally-missing-injection");
  return () => <Text>{{ default: () => "mounted after warning" }}</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilRenderFlush();
app.unmount();
await app.waitUntilExit();
console.log("waitUntilExit:resolved");
