import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";
export default defineConfig({ plugins: [vue(), vueTui()] });
