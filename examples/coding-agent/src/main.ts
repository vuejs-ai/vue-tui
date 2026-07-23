import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

if (!process.env["DEEPSEEK_API_KEY"]) {
  console.error("Error: DEEPSEEK_API_KEY environment variable is required.");
  console.error("Usage: DEEPSEEK_API_KEY=sk-xxx node dist/main.js [--yolo]");
  process.exit(1);
}

createApp(App).mount({ exitOnCtrlC: true });
