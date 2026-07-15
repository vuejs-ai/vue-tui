# Changelog

All notable changes to `@vue-tui/runtime` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## Unreleased

### Added

- Added Box-rooted support for Vue's built-in `v-show`. Hidden subtrees remain mounted and reactive while leaving Yoga layout, paint, focus, semantic geometry, caret, and Fullscreen hit testing; showing again uses the latest authored Box `display` value.
- Added nested `Text` foreground reset through `color="revert"` and `color="initial"`. Reset spans return to the terminal-default foreground across nesting and wrapping without changing background or independent text modifiers, and the enclosing foreground resumes afterward.
- Added the supported `@vue-tui/runtime/inline` entry with `Static` and its named props, slot, children, and style types for declarative terminal history.
- Added the common `useClipboard()` service and `MountOptions.clipboard` with one explicit custom or OSC 52 transport. Writes report `copied`, `requested`, `unavailable`, or `rejected`, always retain the exact text for caller-owned fallback, serialize queued adapters, and keep suspension, disposal, string, screen-reader, and non-terminal behavior explicit. OSC 52 reports only that vue-tui wrote a request, never that the terminal accepted it.
- Added `useTextSelection()` to `@vue-tui/runtime/fullscreen` for application-owned command and pointer selection over exactly one top-level `<Text>`. Selection follows complete grapheme boundaries and successful final-paint provenance, supports visual-row and document movement, select-all, clear, and copy, keeps one active range per app, and reports unsupported or ambiguous mappings rather than approximating.

### Changed

- Coordinated `useStdout().write()` and `useStderr().write()` now return `CoordinatedWriteResult`, distinguishing accepted writable output, accepted backpressure with a `ready` promise, and a blocked call whose bytes were not retained. Runtime output is handed through one ordered gate, stops writing until `drain`, and coalesces blocked render work to the latest desired frame.
- Moved `Static` off the common Runtime root without compatibility aliases. A mounted Static region is append-only by `Object.is` identity for its committed prefix, and an effective visual Fullscreen surface now rejects Static before history bytes or a replacement frame instead of writing a warning and immediately repainting the bytes away.
- Replaced the legacy string-plus-`Key` `useInput()` contract with frozen normalized key, text, paste, and uninterpreted events plus a required synchronous route result. Added `useInputAvailability()`, made active semantic input own its terminal resources, retained `useStdin().stdin` as the raw mounted-stream escape hatch, and removed `usePaste`, public `Key`, public raw-mode controls, mount `rawMode`, and `exitOnCtrlC`.
- Replaced flat string-ID focus with opaque ref-bound targets, rendered-order traversal, nested active and trapped scopes, target and scope input attachments, normalized external fallthrough, and exact focused-target observation. Added `useFocusScope()`, `useFocusedInput()`, `useFocusScopeInput()`, and `useExternalInput()`; replaced the `useFocus()` and `useFocusManager()` signatures; and removed global focus enable/disable, string lookup, automatic Escape blur, setup-order traversal, and per-focus raw-mode ownership.
- Replaced Yoga-only `useBoxMetrics()`, imperative `measureElement()`, and targetless `useCursor()` with paint-derived `useElementGeometry()` and focus-bound `useCaret()`. The new caret accepts an element-local rendered cell, reports explicit frozen availability and visibility state, selects at most one effective focus owner, and emits no targeted cursor controls on unsupported output. Standard and incremental writers now retain their last successful frame and caret baseline when a stream write fails so an identical retry is not dropped.

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

### Built on Ink, adapted to Vue

Modeled on React Ink (pinned to v7.0.4): every Ink component (6) and hook (13)
has a same-named equivalent, with `createApp().mount()` replacing Ink's
`render()`. Parity is verified against real Ink output captured as byte-exact
fixtures (Ink is not a runtime, test, or CI dependency). Where vue-tui differs —
`shallowRef` reactive state, declarative prop resets, `rawMode: 'always'`, and a
few fixes for verified Ink rendering bugs — it's deliberate and documented in the
divergence log. Parity never outranks correctness.

### Internal API (unstable)

The `@vue-tui/runtime/internal` entry point exposes lower-level host-node, Yoga,
and frame-sink internals for tooling (e.g. the test harness). It is **not covered
by semver** and may change in any release.
