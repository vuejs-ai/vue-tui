# @vue-tui/components

High-level Vue components for [vue-tui](https://github.com/vuejs-ai/vue-tui), composed from
`@vue-tui/runtime` primitives.

> Early days — the component set is small and growing. Currently: `Spinner`.

## Install

```sh
npm install @vue-tui/components
# peer deps: @vue-tui/runtime, vue ^3.4
```

## Spinner

An animated loading spinner.

```vue
<script setup lang="ts">
import { Spinner } from "@vue-tui/components";
</script>

<template>
  <Spinner type="dots" label="Loading" color="green" />
</template>
```

### Props

| prop       | type                                  | default  | description                                |
| ---------- | ------------------------------------- | -------- | ------------------------------------------ |
| `type`     | preset name (e.g. `"dots"`, `"line"`) | `"dots"` | a built-in spinner animation               |
| `frames`   | `string[]`                            | —        | custom animation frames (overrides `type`) |
| `interval` | `number`                              | preset's | ms between frames                          |
| `color`    | `string`                              | —        | chalk color for the spinner glyph          |
| `label`    | `string`                              | —        | text shown next to the spinner             |

## License

MIT
