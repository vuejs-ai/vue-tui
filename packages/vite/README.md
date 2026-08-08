# @vue-tui/vite

Vite plugin for [vue-tui](https://github.com/vuejs-ai/vue-tui): an in-process terminal dev server with HMR, for Vue apps that render to the terminal via `@vue-tui/runtime`.

## Install

```sh
npm install @vue-tui/runtime vue
npm install -D @vue-tui/vite unplugin-vue vite
```

## Usage

`vueTui()` adds the terminal dev server (HMR). Bring your own compiler alongside it: `unplugin-vue/vite` for SFCs, or `@vitejs/plugin-vue-jsx` for JSX. The SFC compiler's default `ssr: false` setting emits the client render functions required by the terminal renderer even though Vite evaluates the app through its SSR module runner.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

const input = "src/main.ts";

export default defineConfig({
  input,
  plugins: [vue(), vueTui({ entry: input })],
});
```

- `vite` (or `vp run dev` through a package script) — boots the app in-process through Vite's SSR module runner and renders it to the terminal, with state-preserving HMR.

### Options

```ts
vueTui({
  entry: "src/main.ts", // default; the app entry (a .ts/.tsx file, not an index.html)
});
```

`entry` accepts a path relative to the Vite root (with or without a leading `/`) or an existing absolute filesystem path.

For a JSX/TSX entry, install `@vitejs/plugin-vue-jsx`, use it for development, and point both Vite and `vueTui()` at the `.tsx` file.

```ts
import vueJsx from "@vitejs/plugin-vue-jsx";

const input = "src/main.tsx";

export default defineConfig({
  input,
  plugins: [vueJsx(), vueTui({ entry: input })],
});
```

For a standalone JSX production build, select `unplugin-vue-jsx/vite` in the config's build branch so the Node build still emits client render functions. See the [JSX example](https://github.com/vuejs-ai/vue-tui/tree/main/examples/basic-jsx); embedded applications keep their existing JSX compiler.

## Production build

`vueTui()` is development-only and does not touch production builds. A standalone TUI application can use the same Vite config to build its Node entry; see the [starter](https://github.com/vuejs-ai/vue-tui/tree/main/templates/vite) for the complete single-file setup. An application embedding `@vue-tui/runtime` does not need this plugin at all—its host compiler, bundler, and process lifecycle remain in charge.

## License

MIT
