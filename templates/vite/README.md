# my-vue-tui-app

A [vue-tui](https://github.com/vuejs-ai/vue-tui) app — a Vue interface that runs in the terminal.

> Requires Node.js 22.18+.

## Scripts

```sh
pnpm install
pnpm dev         # terminal dev server with HMR (experimental) — edit src/app.vue, watch it update
pnpm type-check  # type-check .ts + .vue with vue-tsc
pnpm build       # bundle src/main.ts -> a self-contained dist/main.mjs
pnpm preview     # build, then run the production output
```

Press `q` to quit the app.

## Project structure

```
src/
  main.ts    # mount the app, wait for its exit, then close the process
  app.vue    # your UI — a <Spinner> loads, then an arrow-key counter
vite.config.ts    # Vue compiler, terminal HMR, and production Node bundle
```

Built with [`@vue-tui/runtime`](https://www.npmjs.com/package/@vue-tui/runtime), [`@vue-tui/components`](https://www.npmjs.com/package/@vue-tui/components), and the development-only [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite) plugin. The application-owned Vite config also produces the production bundle.
