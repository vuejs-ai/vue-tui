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
  app.vue    # your UI — a <Spinner> loads, then a +/- counter (press + or =, and -)
vite.config.ts    # dev server (HMR): unplugin-vue + vueTui()
tsdown.config.ts  # production build: bundle into one self-contained dist/main.mjs
```

Built with [`@vue-tui/runtime`](https://www.npmjs.com/package/@vue-tui/runtime),
[`@vue-tui/components`](https://www.npmjs.com/package/@vue-tui/components), and the
[`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite) plugin.
