import { createApp } from "@vue-tui/runtime";
import App from "./App";

if (!process.env["DEEPSEEK_API_KEY"]) {
  console.error("Error: DEEPSEEK_API_KEY environment variable is required.");
  console.error("Usage: DEEPSEEK_API_KEY=sk-xxx node dist/agent.mjs [--yolo]");
  process.exit(1);
}

createApp(App).mount();
