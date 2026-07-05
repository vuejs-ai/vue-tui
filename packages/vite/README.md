# @vue-tui/vite

Vite plugin for [vue-tui](https://github.com/vuejs-ai/vue-tui): an in-process terminal dev server
with HMR, for Vue apps that render to the terminal via `@vue-tui/runtime`.

## Install

```sh
npm install -D @vue-tui/vite @vitejs/plugin-vue
# peer deps: vite ^8, @vue-tui/runtime
```

## Usage

`vueTui()` adds the terminal dev server (HMR). Bring your own SFC/JSX compiler alongside it —
`@vitejs/plugin-vue` for SFCs (or `@vitejs/plugin-vue-jsx` for JSX):

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  plugins: [vue(), vueTui()],
});
```

- `vite` (dev) — boots the app in-process through Vite's SSR module runner and renders it to the
  terminal, with state-preserving HMR.

### Options

```ts
vueTui({
  entry: "src/main.ts", // default; the app entry (a .ts/.tsx file, not an index.html)
});
```

For a JSX/TSX entry, use `@vitejs/plugin-vue-jsx` and point `entry` at the `.tsx` file:

```ts
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx(), vueTui({ entry: "/src/main.tsx" })],
});
```

## Production build

`vueTui()` is **dev only** — it does not touch the production build. `vite build` is browser-first
and the wrong tool for a Node program, so build with [`tsdown`](https://tsdown.dev) instead: it
bundles the whole app into one self-contained Node file that runs with no `node_modules` present.

```ts
// tsdown.config.ts
import { defineConfig } from "tsdown";
import vue from "unplugin-vue/rolldown"; // or unplugin-vue-jsx/rolldown for a .tsx entry

export default defineConfig({
  entry: ["src/main.ts"],
  platform: "node", // keep Node builtins external; real createRequire for CJS deps
  format: "esm",
  deps: { alwaysBundle: [/./], onlyBundle: false }, // inline every dep into the one file
  plugins: [vue()],
});
```

```sh
npm install -D tsdown unplugin-vue
tsdown # → dist/main.mjs, self-contained
```

See the [starter](https://github.com/vuejs-ai/vue-tui-starter) and this repo's `examples/` for
complete setups.

## License

MIT
