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
- **Input & focus** — keyboard handling, focus management, Tab navigation, Kitty keyboard protocol
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
  if (event.kind !== "text") return "continue";
  // "+" is Shift+"=" on most keyboards, so accept the bare "=" too.
  if (event.text === "+" || event.text === "=") {
    count.value++;
    return "consume";
  }
  if (event.text === "-") {
    count.value--;
    return "consume";
  }
  return "continue";
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
| [`@vue-tui/runtime`](https://www.npmjs.com/package/@vue-tui/runtime)       | The core framework — Vue 3 renderer for the terminal with components (`Box`, `Text`, `Static`, etc.), composables (`useInput`, `useFocus`, `useApp`, etc.), and yoga-based flexbox layout. _API stabilizing._                                                                                                      |
| [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite)             | Vite plugin — add `vueTui()` to `vite.config.ts` for an in-process terminal dev server with HMR (`npm run dev`). Dev only; the production build is a plain `tsdown` config that bundles the app into one self-contained Node file (see the starter and `examples/*/tsdown.config.ts`). _Experimental; may change._ |
| [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing)       | Deterministic test host — model terminal or stream conditions, inspect resolved session facts and content commits, and assert the terminal-emulated screen                                                                                                                                                         |
| [`@vue-tui/components`](https://www.npmjs.com/package/@vue-tui/components) | High-level components built on the runtime primitives — currently `<ScrollBox>` and `<Spinner>`.                                                                                                                                                                                                                   |

## Examples

| Example                                       | Description                                                 |
| --------------------------------------------- | ----------------------------------------------------------- |
| [`basic-template`](./examples/basic-template) | Vue SFC with `<template>` syntax                            |
| [`basic-jsx`](./examples/basic-jsx)           | Same app in TSX                                             |
| [`coding-agent`](./examples/coding-agent)     | AI coding agent with LLM streaming and interactive UI       |
| [`flappy-bird`](./examples/flappy-bird)       | Physics-based terminal game with reactive state and borders |
| [`mouse`](./examples/mouse)                   | Full-screen targeted mouse events and dragging              |
| [`scroll-box`](./examples/scroll-box)         | Bounded viewport with app-controlled scrolling              |

## Components

| Component                           | Description                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`<Box>`](./packages/runtime)       | Flexbox container — direction, wrap, align, justify, gap, padding, margin, borders, background |
| [`<Text>`](./packages/runtime)      | Styled text — color, bold, italic, underline, strikethrough, dimColor, wrap/truncate modes     |
| [`<Spacer>`](./packages/runtime)    | Expands to fill available space (`flex-grow: 1`)                                               |
| [`<Newline>`](./packages/runtime)   | Inserts line breaks (configurable `count`)                                                     |
| [`<Static>`](./packages/runtime)    | Renders inline items once above the redrawn region; fullscreen does not retain them            |
| [`<Transform>`](./packages/runtime) | Applies a string transform function to each rendered line                                      |

`<Box>`, `<Text>`, and `<ScrollBox>` are passive visual components. Fullscreen mouse behavior is attached to an ordinary component ref with the dedicated composables below; listener props such as `@click` and `@wheel` are rejected so mode-dependent behavior cannot look universally available.

## High-level Components

The [`@vue-tui/components`](./packages/components) package adds higher-level components composed from the runtime primitives — published separately from the core.

| Component                              | Description                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`<ScrollBox>`](./packages/components) | Bounded sticky-bottom viewport; the app controls scrolling through its imperative handle   |
| [`<Spinner>`](./packages/components)   | Animated loading spinner — built-in `dots`/`line` presets or custom frames, optional label |

## Composables (Hooks)

| Composable                      | Description                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)`      | Handle normalized key, text, paste, and uninterpreted input events; every handler returns an explicit routing result             |
| `useInputAvailability()`        | Inspect whether managed input is available, or why the current host cannot provide it                                            |
| `useMouseEvent(ref, event, fn)` | Handle a targeted Fullscreen `"click"` or `"wheel"` event; imported from `@vue-tui/runtime/fullscreen`                           |
| `useMouseDrag(ref, fn, opts?)`  | Handle one captured Fullscreen drag lifecycle; imported from `@vue-tui/runtime/fullscreen`                                       |
| `useFocus(ref, opts?)`          | Register an opaque ref-bound focus target with rendered-order traversal, eligibility, and programmatic `focus()` / `blur()`      |
| `useFocusScope(opts?)`          | Create a nested active region or hard trapped focus boundary and provide it to descendants                                       |
| `useFocusedInput(target, fn)`   | Attach normalized input to one exact target while it owns focus                                                                  |
| `useFocusScopeInput(scope, fn)` | Attach normalized input to an active boundary or focused target's logical ancestor scope                                         |
| `useExternalInput(target, fn)`  | Attach one normalized external fallthrough receiver to an exact focused target                                                   |
| `useFocusManager()`             | Observe the exact focused target and traverse or blur the current boundary                                                       |
| `useApp()`                      | App lifecycle — `{ exit(error?), waitUntilRenderFlush() }`                                                                       |
| `useRenderSession()`            | Readonly reactive facts for the current render host — mode resolution, output, dimensions, and structural capabilities           |
| `useLayoutSize()`               | Reactive root layout dimensions — readonly `{ columns, rows }` refs; `rows` is `null` when layout is unbounded                   |
| `useStdin()`                    | Access the actual mounted stdin as a raw byte-stream escape hatch                                                                |
| `useStdout()`                   | Write directly to stdout                                                                                                         |
| `useStderr()`                   | Write directly to stderr                                                                                                         |
| `useElementGeometry(ref)`       | Observe one atomic paint-derived geometry snapshot with parent, render-surface, exact fragment, clipping, and availability facts |
| `useCaret(ref, opts)`           | Declare a focus-bound caret at an element-local rendered cell and observe whether it is visible                                  |
| `useAnimation(opts?)`           | Frame-based animation driver — reactive `{ frame, time, delta }` + `reset()`                                                     |

`useInput()` delivers a frozen event whose `kind` is `"key"`, `"text"`, `"paste"`, or `"uninterpreted"`. Return `"continue"` when the handler did nothing and `"consume"` after it handled the event; use a complete `InputRouteDecision` only when action reporting, later routing, terminal defaults, and external forwarding need independent choices. All application-global input handlers run in registration order for each event before their decisions are merged.

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

An active hook requires an effective visual Fullscreen surface. It acquires only the SGR mouse reporting level needed by a visible accepted target and releases that level when the last target disappears. While reporting is active, the terminal normally sends selection and wheel input to the application instead of performing its native selection or scrolling; vue-tui keeps that interval demand-driven, while application-owned selection and copy remain separate features.

`useRenderSession()` is the authoritative way for a component to inspect what rendering surface actually became effective. The session object keeps one identity for the render tree; mode, output, host, and capabilities are immutable for that session, while a live-update surface refreshes `dimensions` reactively on accepted resize and continuation events. A final-output surface retains the dimensions resolved at mount because it has no runtime resize lifecycle. Use `session.output.presentation === "screen-reader"` to adapt to the active linear presentation. `useLayoutSize()` derives from that same session and keeps destructured dimensions reactive; its `rows` ref is `null` for a row-unbounded stream, transcript, or string document.

`useElementGeometry(ref)` follows the rendered host under a normal Vue component ref and replaces its readonly `geometry` ref only with a complete paint generation. Resolved states expose full `parent` and dynamic-render-surface bounds plus exact local/parent/surface/`visibleSurface` fragment mappings; `unavailable`, `detached`, `pending`, `hidden`, `zero-size`, `fully-clipped`, and `visible` remain distinct. Inline surface coordinates are relative to vue-tui's current managed region, not a stable physical terminal row. Screen-reader and string presentations report `unavailable`.

`useCaret(ref, { focus, position })` declares a caret for one exact `useFocus()` target. `position` is a zero-based rendered cell local to `ref`, not a string index or physical terminal coordinate. The application retains its logical insertion state and converts it to that cell; the runtime maps the cell through the accepted paint generation and lets the Inline or Fullscreen writer place the terminal cursor. The readonly `state` distinguishes `visible`, `inactive`, `unavailable`, and explicit hidden reasons; non-TTY, screen-reader, string, detached, clipped, and invalid positions never emit targeted cursor controls. The caret is the semantic insertion marker requested by the application; the terminal cursor is the physical terminal mechanism used to display the selected visible caret.

`useInputAvailability()` reports whether managed input can be activated without acquiring any terminal resource. `useStdin()` returns only the stream mounted into the application. Direct reads are raw: they may include terminal protocol replies and paste framing, and they have no vue-tui event semantics or safe-composition guarantee with managed input handlers. Managed input is available only on a controllable TTY; the first active managed input consumer acquires raw mode, bracketed-paste reporting, the shared listener, stdin ref state, and any configured Kitty keyboard negotiation, and the last consumer releases them. While that demand is active, an exact Ctrl+C is a delayed framework default that a handler can prevent for that event. A non-TTY stream remains available through `useStdin().stdin` for applications that intentionally consume pipe bytes. Mount options containing the removed `rawMode` or `exitOnCtrlC` fields are rejected instead of being ignored.

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
      if (event.kind !== "text") return "continue";
      if (event.text === "+") {
        count.value++;
        return "consume";
      }
      if (event.text === "-") {
        count.value--;
        return "consume";
      }
      return "continue";
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
