import { defineConfig } from "vite";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { vueTui } from "../../../src/index.ts";
export default defineConfig({ plugins: [vueJsx(), vueTui({ entry: "/src/main.tsx" })] });
