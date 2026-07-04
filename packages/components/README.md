# @vue-tui/components

High-level Vue components for [vue-tui](https://github.com/vuejs-ai/vue-tui), composed from
`@vue-tui/runtime` primitives.

> Early days — the component set is small and growing. Currently: `ScrollBox`, `Spinner`.

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

## ScrollBox

A bounded scroll viewport for long, updating content. Opt into mouse-wheel scrolling with `wheel`,
and sticky-bottom behavior keeps streaming output at the bottom only until the user scrolls up.

```vue
<script setup lang="ts">
import { ScrollBox } from "@vue-tui/components";
import { Text } from "@vue-tui/runtime";
</script>

<template>
  <ScrollBox>
    <Text v-for="line in lines" :key="line">{{ line }}</Text>
  </ScrollBox>
</template>
```

### Props

| prop            | type      | default | description                                            |
| --------------- | --------- | ------- | ------------------------------------------------------ |
| `wheel`         | `boolean` | `false` | enable mouse-wheel scrolling (turns on mouse tracking) |
| `keyboard`      | `boolean` | `false` | enable PageUp/PageDown scrolling                       |
| `linesPerWheel` | `number`  | `3`     | lines to scroll per wheel event                        |

## License

MIT
