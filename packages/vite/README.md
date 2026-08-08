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
  plugins: [vue(), vueTui()],
});
```

- `vite` (or `vp run dev` through a package script) — boots the app in-process through Vite's SSR module runner and renders it to the terminal, with state-preserving HMR.

`vueTui()` reads Vite's top-level `input`; it does not have a separate entry option. The dev server defaults to `src/main.ts` when `input` is omitted, but a standalone build should declare it explicitly so Vite does not look for an HTML entry. A TUI process has one app entry, so `vueTui()` rejects a multi-entry `input` during development.

For a JSX/TSX entry, install `@vitejs/plugin-vue-jsx` and point Vite at the `.tsx` file.

```ts
import vueJsx from "@vitejs/plugin-vue-jsx";

const input = "src/main.tsx";

export default defineConfig({
  input,
  plugins: [vueJsx(), vueTui()],
});
```

The same compiler works for development and production. Although the bundle runs in Node, vue-tui is a Vue client renderer rather than a server renderer, so the standalone config uses a regular Vite application build with Rolldown's Node platform instead of `build.ssr`. See the [JSX example](https://github.com/vuejs-ai/vue-tui/tree/main/examples/basic-jsx).

## Production build

`vueTui()` is development-only and does not touch production builds. A standalone TUI application can use the same top-level `input` in an application-owned Vite build; see the [starter](https://github.com/vuejs-ai/vue-tui/tree/main/templates/vite) for the complete single-file Node setup. An application embedding `@vue-tui/runtime` does not need this plugin at all—its host compiler, bundler, and process lifecycle remain in charge.

## License

MIT
