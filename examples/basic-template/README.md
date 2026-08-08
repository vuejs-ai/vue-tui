# basic-template

A minimal standalone vue-tui app written with Vue SFC `<template>` syntax. It is the canonical reference for using one Vite config for development and production while keeping `@vue-tui/vite` limited to development HMR.

## Setup

`unplugin-vue/vite` compiles the SFC in both modes. Vite's top-level `input` is the one application entry: `vueTui()` reads it to start the in-terminal development server, and the application-owned Vite build uses it to produce the self-contained Node bundle. This is a regular Vue client build targeting Node, not a Vue SSR build.

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

From the repository root:

```bash
vp run @vue-tui/example-basic-template#dev      # terminal dev server with HMR
vp run @vue-tui/example-basic-template#build    # produce dist/main.mjs with Vite
vp run @vue-tui/example-basic-template#preview  # rebuild, then run the production bundle
```

From this directory, the equivalent commands are `vp run dev`, `vp run build`, and `vp run preview`.
