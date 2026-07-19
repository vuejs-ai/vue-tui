# vue-tui

> **Public beta** — the `@vue-tui/runtime` API is stabilizing toward 1.0; dev-mode HMR is still experimental. Bug reports welcome.

vue-tui is a Vue-native application framework for interactive terminal UIs.
Build with components, develop with HMR, test with confidence.

<p align="center">
  <a href="https://npmx.dev/@vue-tui/runtime"><img alt="@vue-tui/runtime npm version" src="https://img.shields.io/npm/v/@vue-tui/runtime?label=%40vue-tui%2Fruntime&color=42b883"></a>
  <a href="https://npmx.dev/@vue-tui/components"><img alt="@vue-tui/components npm version" src="https://img.shields.io/npm/v/@vue-tui/components?label=%40vue-tui%2Fcomponents&color=42b883"></a>
  <a href="https://npmx.dev/@vue-tui/vite"><img alt="@vue-tui/vite npm version" src="https://img.shields.io/npm/v/@vue-tui/vite?label=%40vue-tui%2Fvite&color=42b883"></a>
  <a href="https://npmx.dev/@vue-tui/testing"><img alt="@vue-tui/testing npm version" src="https://img.shields.io/npm/v/@vue-tui/testing?label=%40vue-tui%2Ftesting&color=42b883"></a>
</p>

- **Vue SFC & JSX** — write terminal interfaces with `<template>`, TSX, or both
- **Flexbox layout** — powered by Yoga, the same engine behind React Native
- **Dev toolkit** _(experimental)_ — **HMR** in the terminal via the `@vue-tui/vite` plugin (`npm run dev`)
- **Input primitives** — normalized text, paste, and key facts with managed terminal ownership; focus and routing remain application policy
- **Fullscreen selection & clipboard** — semantic Text selection with command and mouse control, plus explicit custom or OSC 52 clipboard transport
- **Testing harness** — out-of-the-box component-level terminal testing — render, simulate input, assert frames
- **Coding-agent visual development guide** — a version-matched method for running the real app, inspecting the screen after terminal control sequences are applied, operating it, and iterating from what the agent sees ([guide](./packages/runtime/docs/visual-development-feedback-loops.md))

<p align="center">
  <a href="./examples/flappy-bird"><em>Flappy Bird</em></a> — one of the <a href="#examples">examples</a> included in the repo
  <br /><br />
  <a href="./examples/flappy-bird">
    <img src=".github/assets/flappy-bird-demo.gif" alt="Flappy Bird built with vue-tui" width="690" />
  </a>
</p>

## Quick Start

There are two ways to use vue-tui — scaffold a full project, or drop the runtime into an existing one.

### 1. Scaffold a project (recommended)

A ready-to-develop setup: Vue SFCs and a terminal HMR dev server via the `@vue-tui/vite` plugin.

```bash
npx tiged vuejs-ai/vue-tui-starter/vite my-app
cd my-app
npm install
npm run dev      # in-process terminal dev server with HMR
```

Edit `src/app.vue` and watch the terminal update instantly.

### 2. Use the runtime standalone

`@vue-tui/runtime` is a standalone Vue renderer, independent of the `@vue-tui/vite` plugin. Author components as SFCs and mount them with `createApp`, using your own build:

```vue
<!-- app.vue -->
<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

const count = shallowRef(0);

useInput((event) => {
  if (event.kind !== "text") return;
  // "+" is Shift+"=" on most keyboards, so accept the bare "=" too.
  if (event.text === "+" || event.text === "=") {
    count.value++;
    return;
  }
  if (event.text === "-") {
    count.value--;
  }
});
</script>

<template>
  <Box>
    <Text>Count: </Text>
    <Text bold color="green">{{ count }}</Text>
    <Text dimColor> (+/= and - to change)</Text>
  </Box>
</template>
```

```ts
// main.ts
import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

createApp(App).mount();
```

- Compile the SFCs with [`@vitejs/plugin-vue`](https://www.npmjs.com/package/@vitejs/plugin-vue), or use JSX with [`@vitejs/plugin-vue-jsx`](https://www.npmjs.com/package/@vitejs/plugin-vue-jsx).
- For hot-reload (HMR) support while developing, add the `@vue-tui/vite` plugin: `plugins: [vue(), vueTui()]`.

## Table of Contents

- [Quick Start](#quick-start)
- [Packages](#packages)
- [Examples](#examples)
- [Components](#components)
- [High-level Components](#high-level-components)
- [Composables (Hooks)](#composables-hooks)
- [Testing](#testing)
- [Visual development with coding agents](#visual-development-with-coding-agents)
- [Development](#development)
- [Contributing](#contributing)
- [Credits](#credits)
- [License](#license)

## Packages

| Package                                                                    | Description                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@vue-tui/runtime`](https://www.npmjs.com/package/@vue-tui/runtime)       | The core framework — Vue 3 renderer for the terminal with common components (`Box`, `Text`, etc.), an explicit Inline-history subpath, narrow public layout and Box facts, normalized input, selection, clipboard, lifecycle, and yoga-based flexbox layout. _API stabilizing._                                    |
| [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite)             | Vite plugin — add `vueTui()` to `vite.config.ts` for an in-process terminal dev server with HMR (`npm run dev`). Dev only; the production build is a plain `tsdown` config that bundles the app into one self-contained Node file (see the starter and `examples/*/tsdown.config.ts`). _Experimental; may change._ |
| [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing)       | Deterministic test host — model terminal or stream conditions, inspect content commits, and assert the terminal-emulated screen                                                                                                                                                                                    |
| [`@vue-tui/components`](https://www.npmjs.com/package/@vue-tui/components) | High-level components built on the runtime primitives — currently `<ScrollBox>` and `<Spinner>`.                                                                                                                                                                                                                   |

## Examples

| Example                                       | Description                                                          |
| --------------------------------------------- | -------------------------------------------------------------------- |
| [`basic-template`](./examples/basic-template) | Vue SFC with `<template>` syntax                                     |
| [`basic-jsx`](./examples/basic-jsx)           | Same app in TSX                                                      |
| [`coding-agent`](./examples/coding-agent)     | AI coding agent with LLM streaming and interactive UI                |
| [`flappy-bird`](./examples/flappy-bird)       | Physics-based terminal game with reactive state and borders          |
| [`mouse`](./examples/mouse)                   | Full-screen targeted mouse, semantic Text selection, and OSC 52 copy |
| [`scroll-box`](./examples/scroll-box)         | Bounded viewport with app-controlled scrolling                       |

## Components

| Component                        | Description                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [`<Box>`](./packages/runtime)    | Terminal layout container with the supported flex, size, spacing, border, clipping, visibility, and accessibility primitives |
| [`<Text>`](./packages/runtime)   | Terminal text with foreground/background color, dim, bold, inverse, wrapping, truncation, and accessibility primitives       |
| [`<Static>`](./packages/runtime) | Commits one mounted slot tree to Inline terminal history; import from `@vue-tui/runtime/inline`                              |

`Static` is deliberately absent from the common root export and has no collection API. Import the component from `@vue-tui/runtime/inline`, then use ordinary Vue iteration and stable keys when committing a list:

```vue
<Static v-for="entry in completedEntries" :key="entry.id">
  <CompletedEntry :entry="entry" />
</Static>
```

Each mounted instance commits its slot tree once, including an output-free first commit; gate the instance itself with `v-if` when its content is not ready. Reactive changes do not rewrite accepted terminal history, while remounting creates a new block. A Static below a hidden Box remains pending and commits once when that Box is shown. Do not nest Static inside another Static or Text. Effective visual Fullscreen rejects `Static`; use application-owned state and a bounded viewport there.

Vue's built-in `v-show` works on `<Box>` roots and keeps their component subtree mounted while removing hidden content from terminal layout, paint, accepted Box presence, geometry, and Fullscreen hit testing. It composes with the Box `display` prop: either `v-show="false"` or `display="none"` hides. Direct `v-show` use on `Text` and `Static` roots is not supported.

Nested `<Text color="revert">` and `<Text color="initial">` spans reset only the foreground to the terminal default. They can wrap across lines and nest safely inside a colored parent; the parent's foreground resumes after the span, while background and the retained boolean text styles continue to compose normally.

Runtime does not export layout conveniences as separate components. Write line breaks as text, and use an ordinary Box when a flex spacer is useful:

```vue
<Text>{{ "\n".repeat(count) }}</Text>
<Box :flexGrow="1" :flexShrink="1" />
```

`<Box>` and `<Text>` have closed prop surfaces: removed props, misspellings, browser attributes, and listener props such as `@click` and `@wheel` are rejected at runtime instead of being silently ignored. `<ScrollBox>` is also passive. Fullscreen mouse behavior is attached to an ordinary component ref with the dedicated composables below so mode-dependent behavior cannot look universally available.

## High-level Components

The [`@vue-tui/components`](./packages/components) package adds higher-level components composed from the runtime primitives — published separately from the core.

| Component                              | Description                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`<ScrollBox>`](./packages/components) | Bounded sticky-bottom viewport; the app controls scrolling through its imperative handle   |
| [`<Spinner>`](./packages/components)   | Animated loading spinner — built-in `dots`/`line` presets or custom frames, optional label |

## Composables (Hooks)

| Composable                      | Description                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)`      | Subscribe to normalized text, paste, and key facts; `opts.isActive` controls whether the subscription owns input resources          |
| `useMouseEvent(ref, event, fn)` | Handle a targeted Fullscreen `"click"` or `"wheel"` event; imported from `@vue-tui/runtime/fullscreen`                              |
| `useMouseDrag(ref, fn, opts?)`  | Handle one captured Fullscreen drag lifecycle; imported from `@vue-tui/runtime/fullscreen`                                          |
| `useTextSelection(ref, opts?)`  | Select the semantic document of exactly one top-level Fullscreen `<Text>` by command or mouse; imported from the Fullscreen subpath |
| `useClipboard()`                | Inspect and use the one custom or OSC 52 clipboard transport configured for the mounted application                                 |
| `useApp()`                      | App lifecycle — `{ exit(error?), waitUntilRenderFlush() }`                                                                          |
| `useLayoutWidth()`              | Read the reactive numeric width Runtime gives the root layout on every host                                                         |
| `useViewportHeight()`           | Read the reactive visual viewport height, or get `null` at setup when the document is not row-bounded                               |
| `useStdin()`                    | Access the actual mounted stdin as a raw byte-stream escape hatch                                                                   |
| `useStdout()`                   | Commit geometry-safe styled lines with explicit acceptance and flow control, or access raw stdout                                   |
| `useStderr()`                   | Commit geometry-safe styled lines with explicit acceptance and flow control, or access raw stderr                                   |
| `useBoxSize(ref)`               | Observe the last accepted full width and height of a directly referenced `<Box>`, or `null` when unavailable                        |
| `useBoxPresence(ref)`           | Observe whether a directly referenced `<Box>` belongs to the last accepted live renderer tree                                       |

`useInput()` delivers a frozen `text`, complete bracketed `paste`, or recognized `key` event. Named keys use a finite vocabulary such as `enter`, `escape`, `tab`, and the navigation keys; shortcut keys instead carry one `character`. Key modifiers are the top-level `shift`, `alt`, and `ctrl` booleans. Handlers normally return nothing. The only special result is the exact object `{ preventDefault: true }`, which suppresses Runtime's Ctrl+C default for that event; it does not stop another subscription or implement application propagation. Unless a handler throws, every subscription captured when the normalized fact begins runs in registration order.

Focus, modal traps, Tab order, and propagation are higher-level application policy rather than Runtime contracts. A provider can keep its own target and scope graph with Vue `provide`/`inject`, subscribe once with `useInput()`, snapshot its route before callbacks, and use `useBoxPresence()` for the accepted renderer fact it cannot derive itself. This is a public composition pattern, not a promise that an `@vue-tui/use` package already exists. See the [Runtime guide](./packages/runtime/README.md#focus-and-routing-above-runtime) for a compact sketch.

Fullscreen mouse hooks are intentionally separate from the root API:

```ts
import { useMouseDrag, useMouseEvent } from "@vue-tui/runtime/fullscreen";

useMouseEvent(buttonRef, "click", () => "consume");
useMouseEvent(listRef, "wheel", (event) => {
  list.value?.scrollByLines(event.delta.y);
  return "consume";
});
useMouseDrag(dividerRef, (event) => {
  if (event.phase === "start" || event.phase === "move") resizeBy(event.movement.x);
});
```

An active hook requires an effective visual Fullscreen surface. It acquires only the SGR mouse reporting level needed by a visible accepted target and releases that level when the last target disappears. While reporting is active, the terminal normally sends selection and wheel input to the application instead of performing its native selection or scrolling; vue-tui keeps that interval demand-driven.

Fullscreen applications can replace native drag selection with one semantic Text selection owner:

```vue
<script setup lang="ts">
import { shallowRef, type ComponentPublicInstance } from "vue";
import { Text } from "@vue-tui/runtime";
import { useTextSelection } from "@vue-tui/runtime/fullscreen";

const documentRef = shallowRef<ComponentPublicInstance | null>(null);
const selection = useTextSelection(documentRef);

// Bind these semantic commands to the application's own input or menu policy.
function selectEverything() {
  selection.selectAll();
}
</script>

<template>
  <Text ref="documentRef">Selectable text with <Text color="cyan">nested styles</Text>.</Text>
</template>
```

The target is exactly one top-level `<Text>`, while nested styled Text is part of its semantic document. Endpoints remain on complete graphemes, soft wraps do not add copied newlines, and highlighting follows only cells from the last successfully displayed final paint. `move()`, `selectAll()`, `clear()`, and `copy()` are commands rather than hidden keyboard bindings; pointer selection is enabled by default and can be disabled with `{ pointer: false }`.

Configure one clipboard transport at mount and inspect it from any rendering mode with `useClipboard()`:

```ts
createApp(App).mount({
  mode: "fullscreen",
  clipboard: { kind: "osc52" },
});
```

OSC 52 returns `requested` after vue-tui writes the request; it cannot prove that the terminal accepted it. A `{ kind: "custom", writeText }` adapter may instead return `copied`, `requested`, `unavailable`, or `rejected`. Every non-empty write result includes the exact text so the application can show a manual fallback. No transport is configured by default, and vue-tui does not choose an operating-system command or automatic fallback chain.

Layout and measurement are deliberately split by task. `useLayoutWidth()` always returns a numeric readonly ref. `useViewportHeight()` returns a readonly numeric ref only for a finite live visual viewport and returns `null` once at setup for an unbounded stream, screen-reader transcript, or string document. `useBoxSize()` accepts a ref bound directly to `<Box>` in the current app and returns its last accepted full `{ width, height }`, or `null` before paint, while hidden or detached, and on hosts without visual Box geometry. `useBoxPresence()` uses the same direct Box ref and reports whether it belongs to the last accepted live tree, including on live hosts without visual geometry. A non-Box or foreign-app target throws.

```ts
import { shallowRef } from "vue";
import {
  Box,
  useBoxPresence,
  useBoxSize,
  useLayoutWidth,
  useViewportHeight,
} from "@vue-tui/runtime";

const layoutWidth = useLayoutWidth();
const viewportHeight = useViewportHeight();
const panel = shallowRef<InstanceType<typeof Box> | null>(null);
const panelSize = useBoxSize(panel);
const panelPresence = useBoxPresence(panel);
```

The broad render-session and public paint-fragment projections are not application contracts. Runtime keeps session resolution, clipping fragments, surface coordinates, and renderer nodes private, while public code consumes the narrower facts above. See [`@vue-tui/runtime`](./packages/runtime/README.md#layout-and-box-measurement) for the exact host and lifecycle behavior.

The previous focus-bound `useCaret()` contract has been withdrawn with the Runtime focus API. Runtime retains the terminal-cursor transport internally, but no public caret API is documented until Path 4 establishes a semantic Text-position contract that does not depend on the removed focus handles.

There is no public input-availability hook. An active `useInput()` subscription is the gate: it acquires managed input only while `isActive` resolves to true and fails before terminal mutation when stdin is not a controllable TTY. `useStdin()` returns the mounted stream for applications that intentionally consume raw pipe bytes; those bytes may include terminal replies and paste framing and have no normalized-event or safe-composition guarantee. Runtime privately negotiates only the Kitty protocol support needed to produce the public event projection, falls back to legacy input, and restores what it acquired. Applications do not choose Kitty flags through mount options. The removed `rawMode`, `exitOnCtrlC`, and public `kittyKeyboard` controls are not supported.

## Testing

The `@vue-tui/testing` package renders components against a finite modeled host. It keeps renderer content commits (`frames` and `lastFrame()`) separate from the terminal-emulated result (`screen()`), so tests can assert the level they actually mean:

```bash
npm install -D @vue-tui/testing
```

```tsx
import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vitest";
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";

test("counter responds to + and - keys", async () => {
  const Counter = defineComponent(() => {
    const count = shallowRef(0);
    useInput((event) => {
      if (event.kind !== "text") return;
      if (event.text === "+") {
        count.value++;
        return;
      }
      if (event.text === "-") {
        count.value--;
      }
    });
    return () => (
      <Box>
        <Text>Count: {count.value}</Text>
      </Box>
    );
  });

  const result = await render(Counter);
  expect(result.lastFrame()).toContain("Count: 0");

  await result.stdin.write("+");
  expect(result.lastFrame()).toContain("Count: 1");

  await result.stdin.write("-");
  expect(result.lastFrame()).toContain("Count: 0");

  result.dispose();
});
```

The default host is a visual Inline TTY. Pass `host` options to model Fullscreen, a screen-reader transcript, final-stream output, live stream updates, or non-TTY input. `screen().cursor` reports the emulated terminal cursor's row, column, and visibility after control bytes are applied. `unmount()` preserves the emulated screen for restoration assertions; `dispose()` performs final resource cleanup. See the [`@vue-tui/testing` package guide](./packages/testing) for the complete matrix.

## Visual development with coding agents

Content-frame assertions do not show the screen after terminal control sequences are applied, and an in-memory test host does not exercise the built application through a real PTY. vue-tui therefore ships a versioned [visual development guide](./packages/runtime/docs/visual-development-feedback-loops.md) for terminal-visible work: run the built app in a real PTY, feed its output through a declared terminal emulator, inspect both the structured active screen and a rendered image, operate the app one step at a time, and use those observations to guide the next code pass.

The method does not require a browser. It complements `@vue-tui/testing`; it does not replace deterministic component and PTY tests. The published runtime ships the guide, not a controller, PTY library, terminal emulator, or image renderer; the coding-agent environment or application project supplies those capabilities.

This repository includes a private TUI visual review tool under [`tools/tui-visual-review`](./tools/tui-visual-review). After `vp install`, run `vp run visual:basic-template` for the reference application or `vp run visual:fullscreen-origin` for the fixed-origin regression fixture. Both start an interactive JSONL session. The agent chooses states and actions from observed PNGs; this non-deterministic visual acceptance is not an image snapshot or prewritten UI test. `vp run visual:basic-template:smoke` only checks that the controller infrastructure, recorded emulator-mode cleanup, and available host restoration checks work on the current computer. The tool is a private workspace with no runtime exports or publication path.

Every `@vue-tui/runtime` installation contains the version-matched guide. From the application directory, a coding agent can locate it with:

```sh
node -p "require('node:path').join(require.resolve('@vue-tui/runtime/package.json'), '../docs/visual-development-feedback-loops.md')"
```

To make this the default in an application, put the [guide's instruction](./packages/runtime/docs/visual-development-feedback-loops.md#tell-an-agent-to-use-this-guide) in the project's root `AGENTS.md`, `CLAUDE.md`, or equivalent agent-instruction file. npm dependencies cannot make an agent read their nested documentation automatically, so the root instruction is the dependable reminder.

## Development

Requires [pnpm](https://pnpm.io/) and Node.js 22+.

```bash
pnpm install          # install dependencies
vp run ready          # lint, typecheck, test, and build (the full check)
vp run -r test        # run tests across all packages
vp run -r build       # build all packages
```

To run an example with terminal HMR, use vanilla `vite@8` (the recommended setup): `cd examples/basic-template && npm run dev`. See that example's `README.md` for the in-monorepo caveat.

## Contributing

Contributions welcome! vue-tui is evolving fast — please open an issue before starting large changes. If you use AI tools, disclose it in your PR and make sure you've reviewed and tested everything before submitting.

## Credits

vue-tui is built on the ideas pioneered by [Ink](https://github.com/vadimdemedes/ink) — component model, yoga-based layout, focus system, and rendering pipeline — adapted to Vue's philosophy. Thanks to [Vadim Demedes](https://github.com/vadimdemedes), [Sindre Sorhus](https://github.com/sindresorhus), and the [Ink contributors](https://github.com/vadimdemedes/ink/graphs/contributors).

## License

MIT
