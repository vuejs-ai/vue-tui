# basic-template

A minimal vue-tui app written with Vue SFC `<template>` syntax. It is the
canonical reference for wiring up the `@vue-tui/vite` plugin.

## Setup

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  plugins: [vueTui(), vue()],
});
```

```jsonc
// package.json
{
  "scripts": {
    "dev": "vite", // in-process terminal dev server with HMR
    "build": "vite build", // bundles src/main.ts -> dist/main.js
    "preview": "vite build && node dist/main.js",
  },
}
```

## Running it (use vanilla `vite@8`)

This example is a **configuration reference**. The recommended and proven setup
is vanilla [`vite@8`](https://www.npmjs.com/package/vite): `npm run dev` boots
the app in-process and applies state-preserving HMR as you edit `src/app.vue`;
`npm run build` emits a single self-contained `dist/main.js`.

### Caveat inside this monorepo

In the vue-tui monorepo, the `vite` specifier is overridden to
`@voidzero-dev/vite-plus-core` (see `pnpm-workspace.yaml` `overrides`/`catalog`).
With that override:

- **`vite build` works** — the production bundle is produced normally, and the
  workspace build (`vp run build`) includes this example.
- **`vite` (dev) does not run the app here** — vite-plus-core's `ssr`
  environment is not a runnable dev environment, so the in-process launcher
  cannot start the app and the plugin reports
  `[vue-tui] the "ssr" environment is not runnable` instead of crashing. This is
  a vite-plus-core limitation, not a problem with `@vue-tui/vite`. To exercise
  the terminal HMR dev server, run this example outside the monorepo against a
  plain `vite@8` install.
