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
import { shallowRef, type ComponentPublicInstance } from "vue";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import { Box, Text, useFocus, useFocusedInput, type InputRouteDecision } from "@vue-tui/runtime";

const box = shallowRef<ScrollBoxExpose>();
const target = shallowRef<ComponentPublicInstance | null>(null);
const focus = useFocus(target, { autoFocus: true });
const continueAtEdge: InputRouteDecision = {
  action: "none",
  routing: "continue",
  defaultAction: "prevent",
  external: "block",
};

// A moved inner viewport consumes the key. At an edge, its focus-scope
// ancestor can try the same key instead.
useFocusedInput(focus, (event) => {
  if (event.kind !== "key" || event.key.phase === "release") return "continue";
  const handle = box.value;
  if (!handle) return continueAtEdge;
  let moved: boolean;
  if (event.key.name === "up") moved = handle.scrollByLines(-1);
  else if (event.key.name === "down") moved = handle.scrollByLines(1);
  else return "continue";
  return moved ? "consume" : continueAtEdge;
});
</script>

<template>
  <Box ref="target" :height="6" flexDirection="column">
    <ScrollBox ref="box">
      <Text v-for="line in lines" :key="line">{{ line }}</Text>
    </ScrollBox>
  </Box>
</template>
```

### Imperative handle (`ScrollBoxExpose`)

`ScrollBox` has no props; grab its handle with a template ref and drive scrolling:

| action                 | result    | description                                                                    |
| ---------------------- | --------- | ------------------------------------------------------------------------------ |
| `scrollToLine(line)`   | `boolean` | scroll a finite line to the top after flooring and clamping                    |
| `scrollByLines(lines)` | `boolean` | scroll by a finite number of lines relative to the current position (`+` down) |
| `scrollToTop()`        | `boolean` | jump to the top                                                                |
| `scrollToBottom()`     | `boolean` | jump to the bottom and resume following new content                            |

Every method returns `true` only when the effective top content line changes synchronously. A
repeated edge operation returns `false`. `scrollToBottom()` can also return `false` while re-arming
following when the viewport is already at the bottom. JavaScript calls with a non-finite line value
throw a `TypeError` before changing scroll state.

Why no built-in `wheel` / `keyboard`: the mouse wheel needs terminal mouse tracking, which breaks
native text selection window-wide; keyboard input is global and collides with a focused field. So
input policy is the app's to decide. For inline streaming output, prefer `Static` (let it flow into
the terminal's own scrollback).

## License

MIT
