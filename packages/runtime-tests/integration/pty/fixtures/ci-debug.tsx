import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent } from "vue";

const App = defineComponent(() => () => <Text>Hello</Text>);

const app = createApp(App);
app.mount({ debug: true });
