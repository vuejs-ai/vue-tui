import { renderToString } from "@vue-tui/runtime";
import App from "./App.vue";

const html = renderToString(App);
console.log(html);
