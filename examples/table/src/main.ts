import { renderToString } from "@vue-tui/runtime";
import App from "./app.vue";

const html = renderToString(App);
console.log(html);
