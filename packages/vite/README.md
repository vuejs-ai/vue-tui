# @vue-tui/vite

Vite plugin for [vue-tui](https://github.com/vuejs-ai/vue-tui): an in-process terminal dev server
with HMR, plus a production build, for Vue apps that render to the terminal via `@vue-tui/runtime`.

## Install

```sh
npm install -D @vue-tui/vite
# peer deps: vite ^8, @vue-tui/runtime
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  plugins: [vueTui()],
});
```

- `vite` (dev) — boots the app in-process through Vite's SSR module runner and renders it to the
  terminal, with state-preserving HMR.
- `vite build` — bundles a single Node entry (`dist/main.js`).

### Options

```ts
vueTui({
  entry: "src/main.ts", // default; the app entry (a .ts/.tsx file, not an index.html)
  vue: {
    // options forwarded to @vitejs/plugin-vue
    /* … */
  },
});
```

For a JSX/TSX entry, add `@vitejs/plugin-vue-jsx` alongside it and point `entry` at the `.tsx` file:

```ts
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueTui({ entry: "/src/main.tsx" }), vueJsx()],
});
```

## Build output

By default the production build **externalizes** bare dependencies (`vue`, `@vue-tui/runtime`, …) —
Node resolves them from `node_modules` at runtime. This is the right shape for a library, or an app
shipped alongside its `node_modules`.

Distribution shape is yours to choose: to produce a **self-contained** single file (everything
bundled but Node builtins — e.g. toward a standalone binary), set your own build options in
`vite.config.ts` and the plugin yields to them:

```ts
import { isBuiltin } from "node:module";

export default defineConfig({
  plugins: [vueTui()],
  build: {
    // Vite 8 is Rolldown-powered: the field is `rolldownOptions` (`rollupOptions` is the alias).
    rolldownOptions: {
      external: (id) => isBuiltin(id), // only Node builtins stay external
      platform: "node", // real createRequire for any CJS dependency
      output: { inlineDynamicImports: true }, // fold into one file
    },
  },
});
```

## License

MIT
