# @vue-tui/components

High-level Vue components for [vue-tui](https://github.com/vuejs-ai/vue-tui), composed from `@vue-tui/runtime` primitives.

> Early days — the component set is small and growing. Currently: `Newline`, `Spacer`, `Spinner`, `ScrollBox`, and `Table`.

## Install

```sh
npm install @vue-tui/components
# peer deps: @vue-tui/runtime, vue ^3.5
```

## Visibility

Current components resolve to one `Box` or `Text` root while they have visible content and therefore inherit Vue's built-in `v-show` automatically. This is the same current-root rule as an application-defined single-root component, not dedicated behavior in each component. A `Table` with neither rows nor explicit columns renders no host node and occupies no layout space. Hidden components remain mounted: for example, a hidden `Spinner` keeps advancing its timer and a hidden `ScrollBox` retains its scroll state. Use `v-if` when the component should unmount or its work should stop.

## Table

A bordered table for object rows. Omit `columns` to display the union of row keys, or provide typed columns to choose order, labels, alignment, wrapping, string formatting, and structured text presentation.

```vue
<script setup lang="ts">
import { Table, type TableColumn } from "@vue-tui/components";

interface Process {
  pid: number;
  name: string;
}

const rows: Process[] = [
  { pid: 1042, name: "vite" },
  { pid: 1088, name: "node" },
];
const columns = [
  { key: "pid", label: "PID", align: "right" },
  {
    key: "name",
    label: "Command",
    headerStyle: { bold: true },
    cellStyle: (_value, row) => ({ color: row.pid === 1042 ? "green" : "yellow" }),
  },
] satisfies readonly TableColumn<Process>[];
</script>

<template>
  <Table :data="rows" :columns="columns" />
</template>
```

### Props

| prop      | type                      | default  | description                                                                        |
| --------- | ------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `data`    | `readonly Row[]`          | required | object rows to render                                                              |
| `columns` | `readonly TableColumn[]`  | row keys | ordered keys with optional label, alignment, wrapping, formatting, and text styles |
| `padding` | non-negative safe integer | `1`      | spaces on each side of a cell                                                      |

`TableColumn<Row>` constrains `key` to the inferred row shape. Its optional `format(value, row)` callback must return a string and receives the value type for that specific key. `headerStyle` applies one `TableTextStyle` to the column label; `cellStyle` accepts either one fixed style or `(value, row) => style` for data-dependent presentation. `TableTextStyle` is Runtime `TextProps` without `textAlign` and `wrap`, which remain column layout fields. These styles affect formatted text only—not cell padding or borders—and Runtime retains ownership of terminal color capability and ANSI output.

Hard line breaks remain part of the cell, and cells wrap by default when their natural grid is wider than the containing layout. A logical row grows to its tallest wrapped cell while the other cells retain aligned borders; `align` applies to every resulting physical line, and `wrap` may select any Runtime `Text` wrap mode when truncation or hard wrapping is more appropriate. Labels and formatter results are plain text: an actual terminal-control byte is rejected rather than treated as styling. A natural grid wider than 65,535 columns is rejected before creating layout nodes. `null` or `undefined` render as blank cells. Strings, numbers, bigints, booleans, and symbols render directly; objects and functions require `format` instead of silently becoming `[object Object]`. The first API deliberately has no slot or interactive contract; sorting, selection, structural styling, and arbitrary rendered content can be added from concrete use cases without freezing border internals now.

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

| prop       | type                                  | default  | description                                                                 |
| ---------- | ------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `type`     | preset name (e.g. `"dots"`, `"line"`) | `"dots"` | a built-in spinner animation                                                |
| `frames`   | `string[]`                            | —        | custom animation frames (overrides `type`)                                  |
| `interval` | `number`                              | preset's | ms between frames; a non-integer or out-of-range value throws a `TypeError` |
| `color`    | `Color` from `@vue-tui/runtime`       | —        | terminal color for the spinner glyph                                        |
| `label`    | `string`                              | —        | text shown next to the spinner                                              |

## ScrollBox

A bounded viewport that follows the bottom of its content. The core behavior — clip overflow and stick to the latest line as content grows — needs no props. It listens to **no** input itself: scroll it through the exposed imperative handle, and bind your own keys or mouse to that.

```vue
<script setup lang="ts">
import { useTemplateRef } from "vue";
import { ScrollBox } from "@vue-tui/components";
import { Box, Text, useInput } from "@vue-tui/runtime";

const box = useTemplateRef("box");

useInput((event) => {
  if (event.type !== "key") return;
  const handle = box.value;
  if (!handle) return;
  if (event.key.name === "up") handle.scrollByLines(-1);
  else if (event.key.name === "down") handle.scrollByLines(1);
});
</script>

<template>
  <Box :height="6" flexDirection="column">
    <ScrollBox ref="box">
      <Text v-for="line in lines" :key="line">{{ line }}</Text>
    </ScrollBox>
  </Box>
</template>
```

`ScrollBox` is `flex: 1 1 0` — it takes its height from its parent and keeps none of its own. The `<Box :height="6">` above is what gives it one; inside a content-sized parent it is zero rows tall and paints nothing.

### Imperative handle (`ScrollBoxExpose`)

`ScrollBox` has no props; grab its handle with a template ref and drive scrolling:

| action                 | result    | description                                                                    |
| ---------------------- | --------- | ------------------------------------------------------------------------------ |
| `scrollToLine(line)`   | `boolean` | scroll a finite line to the top after flooring and clamping                    |
| `scrollByLines(lines)` | `boolean` | scroll by a finite number of lines relative to the current position (`+` down) |
| `scrollToTop()`        | `boolean` | jump to the top                                                                |
| `scrollToBottom()`     | `boolean` | jump to the bottom and resume following new content                            |

Every method returns `true` only when the effective top content line changes synchronously. A repeated edge operation returns `false`. `scrollToBottom()` can also return `false` while re-arming following when the viewport is already at the bottom. JavaScript calls with a non-finite line value throw a `TypeError` before changing scroll state. If an application owns nested routing, it can try an inner ScrollBox first and call the outer one only when the inner method returns `false`; this is application policy, not a `useInput()` propagation result.

Why no built-in `wheel` or `keyboard`: the mouse wheel needs terminal mouse tracking, which breaks native text selection window-wide; keyboard input is application-wide and can collide with an editor. The application therefore decides input policy. For Inline streaming output, wrap each completed keyed entry in its own `Static` from `@vue-tui/runtime/inline` and let that one-time output flow into terminal scrollback. Effective visual Fullscreen rejects `Static`; keep that history in application state inside a bounded `ScrollBox` instead.

## License

MIT
