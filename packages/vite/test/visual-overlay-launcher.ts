import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "../src/index.ts";

const root = fileURLToPath(new URL("./fixtures/overlay", import.meta.url));
const server = await createServer({
  root,
  logLevel: "silent",
  configFile: false,
  plugins: [vue(), vueTui()],
});
await server.listen();
