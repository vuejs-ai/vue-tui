# @vue-tui/vite

`@vue-tui/vite` provides development and build support for standalone applications that use `@vue-tui/runtime`. It runs the development server in the application process, provides HMR in the terminal, and supplies defaults for a single-file Node bundle.

## Install

```sh
npm install @vue-tui/runtime vue
npm install -D @vue-tui/vite unplugin-vue vite
```

## Usage

Use `unplugin-vue/vite` to compile SFCs. Use `@vitejs/plugin-vue-jsx` to compile JSX. The compilers create client render functions for Vue. During development, `vueTui()` starts the application with Vite's module runner and provides HMR.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  input: "src/main.ts",
  plugins: [vue(), vueTui()],
});
```

Run `vite` directly, or run the package script with `vp run dev`. Both commands start the application and enable HMR without resetting application state.

`vueTui()` uses Vite's top-level `input`. It has no separate entry option. If the config does not set `input`, the development server uses `src/main.ts`. A standalone application must set `input`. Otherwise, Vite searches for an HTML entry during the production build. `vueTui()` supports one application entry and reports an error if `input` contains multiple entries.

For JSX or TSX, install `@vitejs/plugin-vue-jsx`. Set `input` to the `.tsx` file.

```ts
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  input: "src/main.tsx",
  plugins: [vueJsx(), vueTui()],
});
```

Use the same JSX compiler during development and production. Do not set `build.ssr`. See the [JSX example](https://github.com/vuejs-ai/vue-tui/tree/main/examples/basic-jsx).

## Production build

For a production build, `vueTui()` uses the same top-level `input` and supplies these defaults:

- Target Node 22.
- Resolve package exports and main fields for Node.
- Keep Node built-in modules external.
- Set `NODE_ENV` at build time and preserve other `process.env` values for runtime.
- Create `dist/main.mjs` as one ESM file.
- Disable module preload, public directory copies, and code splitting.

The plugin sets a field only when the application has not set it. For example, an application can set only `build.rolldownOptions.output.entryFileNames` and keep all other defaults.

An embedded application keeps its host compiler, build, entry, and process lifecycle without this plugin.

## License

MIT
