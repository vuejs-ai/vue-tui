# Changelog

All notable changes to `@vue-tui/runtime` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## Unreleased

### Added

- Added Box-rooted support for Vue's built-in `v-show`. Hidden subtrees remain mounted and reactive while leaving Yoga layout, paint, targeted focus availability, Box size, and Runtime-private Fullscreen hit testing; showing again uses the latest authored Box `display` value.
- Added nested `Text` foreground reset through `color="revert"` and `color="initial"`. Reset spans return to the terminal-default foreground across nesting and wrapping without changing background or independent text modifiers, and the enclosing foreground resumes afterward.
- Added the supported `@vue-tui/runtime/inline` entry with the `Static` terminal-history primitive.
- Added narrow `@vue-tui/runtime/devtools` and `@vue-tui/runtime/testing` integration entries so official and third-party tooling use the same supported Runtime boundaries.

### Changed

- Reduced the common rendering foundation to `createApp`, `renderToString`, `Box`, and `Text`; removed public `Newline`, `Spacer`, `Transform`, `useAnimation`, and their named types. `BoxProps` now has exactly 24 fields and `TextProps` five, with a shared public `Color` grammar, bounded layout numbers, and a 1,048,576-cell pre-allocation paint limit. Box and Text reject every undeclared attribute before host creation, while `renderToString()` accepts only an optional 1–65,535 `columns` value in a closed option object.
- Removed the screen-reader presentation experiment completely from the current Runtime: `presentation`, ARIA component props and named types, `INK_SCREEN_READER` selection, the transcript renderer, and internal string-render helpers are no longer supported. This does not alter the historical `0.1.0` release record below.
- Replaced the broad `useRenderSession()` and `useLayoutSize()` projections with `useLayoutWidth()` and the setup-time nullable `useViewportHeight()`. Width is numeric on every host; only a finite live visual viewport supplies the reactive height ref. The render-session graph and its named public types remain internal Runtime state, and `@vue-tui/testing` no longer exposes it through `RenderResult.session`.
- Removed public `useStdout()`, `useStderr()`, `CoordinatedWriteResult`, and raw output-result contracts. Runtime retains one private ordered output gate for frame, console, history, backpressure, and restoration work; applications no longer need to understand that implementation protocol.
- Reduced `Static` to one mounted slot tree and one commit attempt. Vue owns collection iteration and keys; Runtime owns successful, backpressured, output-free, and indeterminate terminal handoff. The `items`, `style`, scoped item/index payload, and five collection-specific named types were removed. Hidden ancestors defer the one commit until shown; unsupported nesting inside Static, Text, or a private transformed-text host is rejected before output. An effective visual Fullscreen surface rejects Static before history bytes or a replacement frame.
- Replaced the legacy string-plus-`Key` `useInput()` contract with frozen insertion `text`, complete `paste`, and finite `key` events. Key events contain either a stable name or one shortcut character plus `shift`, `alt`, and `ctrl`; protocol, raw sequence, codepoint, repeat/release, and uninterpreted facts remain private. Handlers normally return nothing, while exact `{ preventDefault: true }` only suppresses Runtime's delayed Ctrl+C default and never stops peer subscriptions. `isActive` gates managed-input demand; Runtime privately owns raw mode, bracketed paste, Kitty negotiation, fallback, and restoration. Removed `useInputAvailability()`, `usePaste`, public `Key`, public routing decisions, public Kitty configuration, public raw-mode controls, mount `rawMode`, and `exitOnCtrlC`; retained `useStdin().stdin` as the raw mounted-stream escape hatch.
- Replaced Runtime's experimental focus manager, focus scopes, targeted and external input hooks, traversal, automatic Tab handling, restoration, string lookup, disabled policy, and automatic focus with one minimal `useFocus()` contract. Every call creates an opaque identity in one private per-app unique-owner controller; the targetless overload follows its Vue scope, while the targeted overload additionally follows a readonly component ref's rendered boundary. A valid `focus()` synchronously replaces the previous owner, `blur()` releases the current handle, and readonly `isFocused` composes with `useInput(handler, { isActive: focus.isFocused })`. Unavailable, disposed, and string-rendering operations are inert without queued acquisition, and target loss or cleanup clears ownership without restoration.
- Replaced Yoga-only `useBoxMetrics()`, imperative `measureElement()`, and the experimental broad `useElementGeometry()` projection with Box-only `useBoxSize()`, which accepts a direct same-app `<Box>` ref and reports only the last accepted full `{ width, height }`. Removed public `useBoxPresence()` while retaining private rendered-target facts required by `useFocus(target)` and other separately accepted Runtime behavior. Paint fragments, clipping provenance, surface coordinates, and renderer nodes remain private. The focus-bound public `useCaret()` experiment is withdrawn pending a Text-position contract; Runtime retains its private cursor mechanism and writers retain their last successful frame and cursor baseline when a stream write fails so an identical retry is not dropped.
- Removed the experimental `/fullscreen` package entry, pointer hooks, arbitrary-Text selection, clipboard hooks and mount transport, and selection-only styling. Hit testing, capture, selection, clipboard, and terminal reporting implementations remain private evidence, while these user capabilities are explicitly outside the minimum foundation until a smaller Runtime-only primitive is proven.
- Reduced `MountOptions` to streams, mode, and console patching; reduced `useApp()` to `exit(error?)`; and kept render-flush and exit barriers on the app-owner handle. Runtime now owns terminal acquisition, cadence, failure aggregation, suspend/resume, and restoration through one lifecycle without exposing scheduler or resource controls. Console patching remains under independent public-API review.
- Renderer commit failures now enter only the owning app's fatal lifecycle. They no longer escape Vue's shared post-flush callback, strand later app commits in the same process, or make a renderer callback failure appear as a synchronous `mount()` error; `waitUntilExit()` receives the original error after terminal restoration.

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
