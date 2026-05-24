import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  pack: {
    dts: { tsgo: true },
    exports: true,
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {},
});
