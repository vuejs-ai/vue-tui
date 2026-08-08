import { defineConfig } from "vite";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { vueTui } from "@vue-tui/vite";
export default defineConfig({ input: "src/main.tsx", plugins: [vueJsx(), vueTui()] });
