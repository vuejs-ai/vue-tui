# basic-template

A minimal standalone vue-tui app written with Vue SFC `<template>` syntax. It is the canonical reference for using one Vite config for development and production while keeping `@vue-tui/vite` limited to development HMR.

## Setup

`unplugin-vue/vite` compiles the SFC in both modes. `vueTui()` adds the in-terminal development server, while the application-owned `build` and `ssr` options produce the self-contained Node bundle without plugin-specific production behavior.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

const input = "src/main.ts";

export default defineConfig(({ command }) => ({
  input,
  plugins: [vue(), vueTui({ entry: input })],
  build: {
    ssr: input,
    target: "node22",
    modulePreload: false,
    copyPublicDir: false,
    rolldownOptions: {
      output: { format: "esm", entryFileNames: "main.mjs", codeSplitting: false },
    },
  },
  ssr: command === "build" ? { noExternal: true } : undefined,
}));
```

## Running it with Vite+

From the repository root:

```bash
vp run @vue-tui/example-basic-template#dev      # terminal dev server with HMR
vp run @vue-tui/example-basic-template#build    # produce dist/main.mjs with Vite
vp run @vue-tui/example-basic-template#preview  # rebuild, then run the production bundle
```

From this directory, the equivalent commands are `vp run dev`, `vp run build`, and `vp run preview`.
