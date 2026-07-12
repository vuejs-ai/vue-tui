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

A bounded viewport that follows the bottom of its content. The core behavior — clip overflow and
stick to the latest line as content grows — needs no props. It listens to **no** input itself:
scroll it through the exposed imperative handle, and bind your own keys / mouse to that.

```vue
<script setup lang="ts">
import { shallowRef } from "vue";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import { Text, useInput } from "@vue-tui/runtime";

const box = shallowRef<ScrollBoxExpose>();

// ScrollBox ships no built-in wheel/keyboard — wire your own keys to the handle.
useInput((event) => {
  if (event.kind !== "key" || event.key.phase === "release") return "continue";
  if (event.key.name === "up") box.value?.scrollByLines(-1);
  else if (event.key.name === "down") box.value?.scrollByLines(1);
  else return "continue";
  return "consume";
});
</script>

<template>
  <ScrollBox ref="box">
    <Text v-for="line in lines" :key="line">{{ line }}</Text>
  </ScrollBox>
</template>
```

### Imperative handle (`ScrollBoxExpose`)

`ScrollBox` has no props; grab its handle with a template ref and drive scrolling:

| action                 | description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `scrollToLine(line)`   | scroll so content line `line` is at the top (clamped)           |
| `scrollByLines(lines)` | scroll by `lines` relative to the current position (`+` = down) |
| `scrollToTop()`        | jump to the top                                                 |
| `scrollToBottom()`     | jump to the bottom and resume following new content             |

Why no built-in `wheel` / `keyboard`: the mouse wheel needs terminal mouse tracking, which breaks
native text selection window-wide; keyboard input is global and collides with a focused field. So
input policy is the app's to decide. For inline streaming output, prefer `Static` (let it flow into
the terminal's own scrollback).

## License

MIT
