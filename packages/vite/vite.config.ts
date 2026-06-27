import { defineConfig } from "vite-plus";
export default defineConfig({
  pack: { entry: ["src/index.ts"], format: "esm", shims: true },
  test: {
    // chalk locks its color level at import time and disables color in non-TTY envs; force it on so
    // ANSI/color regressions (e.g. vue-tui#214 dev-mode color loss) can't hide from the dev-server
    // tests. CI:"false" because the runner sets CI=true, which flips vue-tui's interactive detection
    // (interactive = !isInCi && isTTY) off — matching the runtime-tests convention.
    env: { FORCE_COLOR: "3", CI: "false" },
  },
});
