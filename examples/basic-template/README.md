# basic-template

This example is a small standalone vue-tui application that uses Vue SFC `<template>` syntax. It uses one Vite config for development and production. `@vue-tui/vite` affects only development.

## Setup

`unplugin-vue/vite` compiles the SFC during development and production. Vite's top-level `input` defines the application entry. `vueTui()` starts this entry during development. Vite uses the same entry for the production build. The build creates one Node file that runs without `node_modules`. The Vue compiler creates client render functions instead of SSR render functions.

```ts
// vite.config.ts
import { isBuiltin } from "node:module";
import { defaultServerConditions, defaultServerMainFields, defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

const input = "src/main.ts";

export default defineConfig({
  input,
  plugins: [vue(), vueTui()],
  resolve: {
    conditions: [...defaultServerConditions],
    mainFields: [...defaultServerMainFields],
  },
  build: {
    target: "node22",
    modulePreload: false,
    copyPublicDir: false,
    rolldownOptions: {
      platform: "node",
      external: isBuiltin,
      output: { format: "esm", entryFileNames: "main.mjs", codeSplitting: false },
    },
  },
});
```

## Running it with Vite+

Run these commands from the repository root:

```bash
vp run @vue-tui/example-basic-template#dev      # terminal dev server with HMR
vp run @vue-tui/example-basic-template#build    # produce dist/main.mjs with Vite
vp run @vue-tui/example-basic-template#preview  # rebuild, then run the production bundle
```

From this directory, run `vp run dev`, `vp run build`, or `vp run preview`.
