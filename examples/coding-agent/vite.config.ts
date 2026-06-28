import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  plugins: [vueTui(), vue()],
});
