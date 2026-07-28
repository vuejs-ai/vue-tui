import { defineConfig } from "vite";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { vueTui } from "@vue-tui/vite";

// This example's entry is a .tsx file, so the HMR-capable JSX transform
// (@vitejs/plugin-vue-jsx) is added alongside vueTui(). Production uses
// unplugin-vue-jsx through the separate tsdown config.
export default defineConfig({
  plugins: [vueJsx(), vueTui({ entry: "/src/main.tsx" })],
});
