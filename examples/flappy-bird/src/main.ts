// Flappy Bird example for @vue-tui/runtime.
//
//   pnpm --filter @vue-tui/example-flappy-bird start
//
// Controls: space / ↑ / w to flap, q or Ctrl-C to quit, r to restart after dying.

import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

createApp(App).mount({ exitOnCtrlC: true });
