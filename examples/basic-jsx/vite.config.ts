import { defineConfig } from "vite";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { vueTui } from "@vue-tui/vite";

// This example's entry is a .tsx file, so the JSX transform (@vitejs/plugin-vue-jsx)
// is added alongside vueTui(); the `entry` option points both the dev launcher and
// the production build at src/main.tsx instead of the default src/main.ts.
export default defineConfig({
  plugins: [...vueTui({ entry: "/src/main.tsx" }), vueJsx()],
});
