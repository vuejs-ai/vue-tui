import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent } from "vue";

const App = defineComponent(() => () => <Text>Hello World</Text>);
const app = createApp(App);
app.mount();
await app.waitUntilExit();
console.log("exited");
