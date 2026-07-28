import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    // @vue-tui/testing registers its cleanup hook through the test runner's
    // global afterEach when available.
    globals: true,
    // Files parallelize, but tests within a file run serially: many assert timing-sensitive
    // render/commit/flush counts that destabilize under in-file concurrency on a constrained
    // runner. E2E suites have their own configs; exclude them here so every
    // top-level verification kind has one collection boundary.
    exclude: ["e2e/**", "node_modules/**"],
  },
  lint: {
    ignorePatterns: [
      "e2e/pty/fixtures/**",
      "integration/{layout,lifecycle}/fixtures/*.{mjs,tsx}",
      "integration/types/fixtures/**",
    ],
  },
});
