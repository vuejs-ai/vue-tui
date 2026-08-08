# @vue-tui/vite

`@vue-tui/vite` starts a development server for Vue applications that use `@vue-tui/runtime`. The server runs in the application process and provides HMR in the terminal.

## Install

```sh
npm install @vue-tui/runtime vue
npm install -D @vue-tui/vite unplugin-vue vite
```

## Usage

`vueTui()` starts the development server. Use `unplugin-vue/vite` to compile SFCs. Use `@vitejs/plugin-vue-jsx` to compile JSX. The SFC compiler creates client render functions for Vue by default. During development, Vite evaluates application modules with its SSR module runner.

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

Run `vite` directly, or run the package script with `vp run dev`. Both commands start the application and enable HMR without resetting application state.

`vueTui()` uses Vite's top-level `input`. It has no separate entry option. If the config does not set `input`, the development server uses `src/main.ts`. A standalone application must set `input`. Otherwise, Vite searches for an HTML entry during the production build. `vueTui()` supports one application entry and reports an error if `input` contains multiple entries.

For JSX or TSX, install `@vitejs/plugin-vue-jsx`. Set `input` to the `.tsx` file.

```ts
import vueJsx from "@vitejs/plugin-vue-jsx";

const input = "src/main.tsx";

export default defineConfig({
  input,
  plugins: [vueJsx(), vueTui()],
});
```

Use the same JSX compiler during development and production. Configure Rolldown for Node. Do not set `build.ssr`. See the [JSX example](https://github.com/vuejs-ai/vue-tui/tree/main/examples/basic-jsx).

## Production build

`vueTui()` affects only development. It does not change production builds. A standalone application uses Vite and the same top-level `input` for its production build. The [starter](https://github.com/vuejs-ai/vue-tui/tree/main/templates/vite) shows the complete config. `vite build` creates one Node file that runs without `node_modules`. An embedded application uses its existing compiler, build, entry, and process lifecycle without this plugin.

## License

MIT
