import { renderToString } from "@vue-tui/runtime";
import App from "./full.vue";

const html = renderToString(App);
console.log(html);
