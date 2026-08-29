# Changelog

All notable changes to `@vue-tui/runtime` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## Unreleased

### Fixed

- **Text measurement** — fractional constraints now use one conservative whole-cell budget for measurement and paint, removing the feedback layout pass and its layout-engine callback-order dependency ([#283](https://github.com/vuejs-ai/vue-tui/issues/283)).

## 0.3.0 - 2026-08-02

A clean-slate reduction of the public surface. The root now exports only what
requires Runtime ownership; several experiments were removed rather than kept
behind flags.

### Added

- **Inline history** — `@vue-tui/runtime/inline` exports `Static`.
- **Visibility** — host-based `v-show` for Box, top-level Text, inline Text, and single-root component chains; hidden subtrees stay mounted and reactive.
- **Text colors** — `color="default"` / `backgroundColor="default"` select the terminal default per channel.
- **Text alignment** — `textAlign="left | center | right"` aligns every physical line after wrapping or truncation.
- **Box styles** — `alignContent`, `aspectRatio`, per-edge `borderColor`, `borderDimColor`, and `borderBackgroundColor`.
- **Borders** — `borderStyle` accepts all eight `cli-boxes` frames or a complete custom frame object.
- **Tooling bridges** — unsupported `@vue-tui/runtime/internal/devtools` and `/internal/testing` entries for the official Vite and testing packages; `/internal/testing` also provides the process-shared event sink used by real-terminal dev-server tests.
- **Color control** — exported `ColorProfile` and per-render `color?: boolean | ColorProfile` options for mounted and detached output, enforced across component styling and authored SGR.

### Changed

- **Vue baseline** — requires Vue 3.5 or newer within the Vue 3 major line.
- **Root exports** — reduced to `createApp`, `renderToString`, `Box`, `Text`, `useApp`, `useInput`, `useStdin`, `useFocus`, `useLayoutSize`, `useBoxMetrics`.
- **Layout facts** — `useRenderSession()`, `useLayoutWidth()` / `useViewportHeight()`, `measureElement()`, and `useElementGeometry()` become `useLayoutSize()` and direct-Box `useBoxMetrics()`, all readonly refs.
- **Input** — `useInput()` delivers frozen `TuiInputEvent` values tagged `text` / `key` / `paste` with a nested `TuiKey`; handler returns are ignored.
- **Raw input** — `useStdin()` returns the selected `Readable`, `isRawModeSupported`, and `setRawMode`, each call owning one idempotent hold.
- **Focus** — two `useFocus()` overloads with one shared handle; no manager, scopes, traversal, or automatic Tab.
- **Static** — one mounted slot tree, one non-empty commit; Vue owns iteration and keys. Rejected on a true Fullscreen surface.
- **Mount** — `MountOptions` is `stdin`, `stdout`, `stderr`, `mode`, `color`, `patchConsole`, `exitOnCtrlC`; omitted or `true` color is automatic, `false` is plain, profiles force an exact capability, and `exitOnCtrlC` defaults to `false`.
- **App** — `useApp()` exposes `exit(error?)`; `waitUntilRenderFlush()` and `waitUntilExit()` stay on the app owner.
- **Errors** — Vue component errors follow Vue; the hidden error boundary and error overview are gone. A commit failure enters only its own app's fatal lifecycle.
- **Vite dev errors** — the official development connector keeps the user root mounted while showing compile, evaluation, or render errors. Fullscreen places the diagnostic over the viewport; Inline prints it after the current frame. Failed runner batches cannot report themselves as applied before their queued error arrives, duplicate reports from one edit collapse, retired hot contexts cannot mutate a later session, and a later valid edit recovers. Its dev-only render boundary runs after user boundaries, while production Vue error handling remains unchanged.
- **Failed mounts** — Vue-side cleanup now matches Vue exactly. Runtime no longer patches `EffectScope.prototype` or writes `app._ceVNode`; the original error still rethrows and `waitUntilExit()` still rejects with it.
- **Text measurement** — fractional Yoga constraints reconcile against the final parent content width, preventing stale blank rows and clipped glyphs.
- **Console** — `patchConsole` stays default-on with `false` as the escape hatch; output is forwarded unfiltered.

### Removed

- **Components** — `Newline`, `Spacer`, and `Transform`. `Newline` and `Spacer` now ship from `@vue-tui/components`.
- **Composables** — `useAnimation`, `useStdout`, `useStderr`, `useFocusManager`, `useCursor`, and the pointer, selection, and clipboard hooks.
- **Accessibility** — the screen-reader experiment: `presentation`, ARIA props and types, `INK_SCREEN_READER`, and the transcript renderer.
- **Entries** — the `/fullscreen` package entry.

## 0.1.1 - 2026-06-28

### Changed

- Supported the in-process `@vue-tui/vite` plugin that replaced `@vue-tui/cli`. Published without a changelog entry at the time; recorded here so the release history has no gap.

## 0.1.0 - 2026-06-19

First public release of `@vue-tui/runtime` — Vue 3 for the terminal. Build CLI
tools, dashboards, and AI-agent interfaces with `<script setup>` and reactivity,
laid out by real Yoga flexbox (`yoga-layout`, the engine behind Ink and React
Native).

This release covers `@vue-tui/runtime` only; the testing and CLI packages remain
experimental (`0.0.x`). Not recommended for production yet.

### Features

- **Rendering** — `createApp(component).mount(options?)` and a synchronous
  `renderToString()`.
- **Components** — `Box`, `Text`, `Newline`, `Spacer`, `Static`, `Transform`.
- **Layout** — Yoga flexbox: direction, wrap, align, justify, gap, padding,
  margin, and borders.
- **Input & focus** — `useInput`, `usePaste`, `useFocus`, `useFocusManager`,
  `useStdin`.
- **App & environment** — `useApp`, `useStdout`, `useStderr`, `useWindowSize`,
  `useIsScreenReaderEnabled`.
- **Layout & cursor** — `useBoxMetrics`, `measureElement`, `useCursor`.
- **Animation** — frame-based `useAnimation`.
- **Accessibility** — a screen-reader linearizer and ARIA roles (18-value
  `AriaRole` union).
- **Kitty keyboard protocol** — all 5 progressive-enhancement flags, plus
  bracketed paste; `kittyFlags`, `kittyModifiers`, and related types.
- **Authoring** — Vue SFC `<template>`, JSX/TSX, and render functions.

### Ink-derived starting point

Runtime's first release started from React Ink v7.0.4. It provided same-named
equivalents for six components and 13 hooks, with `createApp().mount()` replacing
Ink's `render()`, and used captured Ink output as byte-exact fixtures. Vue APIs and
selected terminal behavior differed where the release chose a Vue-specific
contract or fixed a verified rendering issue. Ink was not a runtime, test, or CI
dependency.

### Internal API (unstable)

The `@vue-tui/runtime/internal` entry point exposes lower-level host-node, Yoga,
and frame-sink internals for tooling (e.g. the test harness). It is **not covered
by semver** and may change in any release.
