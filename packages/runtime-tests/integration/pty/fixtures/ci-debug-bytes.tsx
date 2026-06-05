import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, h } from "vue";

// Function-slot form avoids Vue's dev-mode "Non-function value encountered for
// default slot" warning, so the captured byte stream is exactly the debug
// frames vue-tui writes (no warning noise interleaved). Renders "Hello" once.
const App = defineComponent(() => () => h(Text, () => "Hello"));

const app = createApp(App);
app.mount({ debug: true });
