# basic-template

A minimal vue-tui app written with Vue SFC `<template>` syntax. It is the canonical reference for wiring up the `@vue-tui/vite` development plugin and the separate production build.

## Setup

Development uses `unplugin-vue/vite`: its default client output is required by the terminal renderer even though `vueTui()` evaluates the app through Vite's SSR module runner.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  plugins: [vue(), vueTui()],
});
```

Production is intentionally separate: `tsdown.config.ts` uses `unplugin-vue/rolldown` to bundle the app into the self-contained Node entry `dist/main.mjs`. `vueTui()` is dev-only, and `vite build` is not used for the Node application.

## Running it with Vite+

From the repository root:

```bash
vp run @vue-tui/example-basic-template#dev      # terminal dev server with HMR
vp run @vue-tui/example-basic-template#build    # produce dist/main.mjs with tsdown
vp run @vue-tui/example-basic-template#preview  # rebuild, then run the production bundle
```

From this directory, the equivalent commands are `vp run dev`, `vp run build`, and `vp run preview`.
