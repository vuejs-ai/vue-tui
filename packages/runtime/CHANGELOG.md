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

- Reduced the common rendering foundation to `createApp`, `renderToString`, `Box`, and `Text`; removed public `Newline`, `Spacer`, `Transform`, `useAnimation`, and their named types. `BoxProps` now has exactly 24 fields and `TextProps` five, with a shared public `Color` grammar, bounded layout numbers, and a 1,048,576-cell pre-allocation paint limit. Box and Text reject every undeclared attribute before host creation, while `renderToString()` exposes only a readonly optional 1–65,535 `columns` field to TypeScript and ignores unrelated runtime keys without reading them. String rendering makes `useApp().exit()` inert and owns its root VNode plus a render-local Yoga allocation ledger so initial Vue patch failures dispose created scopes, inert streams, and Yoga nodes before rethrowing the original error.
- Removed the screen-reader presentation experiment completely from the current Runtime: `presentation`, ARIA component props and named types, `INK_SCREEN_READER` selection, the transcript renderer, and internal string-render helpers are no longer supported. This does not alter the historical `0.1.0` release record below.
- Replaced the broad `useRenderSession()` and `useLayoutSize()` projections with `useLayoutWidth()` and the setup-time nullable `useViewportHeight()`. Width is numeric on every host; only a finite live visual viewport supplies the reactive height ref. The render-session graph and its named public types remain internal Runtime state, and `@vue-tui/testing` no longer exposes it through `RenderResult.session`.
- Removed public `useStdout()`, `useStderr()`, `CoordinatedWriteResult`, and raw output-result contracts. Runtime retains one private ordered output gate for frame, console, history, backpressure, and restoration work; applications no longer need to understand that implementation protocol.
- Reduced `Static` to one mounted slot tree and one non-empty commit. Vue owns collection iteration and keys; Runtime settles only blocks represented by non-empty bytes in the current settlement transaction, so an output-free eligible render stays open until later content or ordinary unmount. Acceptance releases the slot subtree through Vue lifecycle, later changes cannot rewrite accepted history, remount creates a fresh block, and accepted non-TTY history appends immediately. The `items`, `style`, scoped item/index payload, and five collection-specific named types were removed. An effective visual Fullscreen surface rejects Static before history bytes or a replacement frame; exact simultaneous ordering, hidden-ancestor eligibility, placement and nesting rules, and failure timing remain under review.
- Replaced the legacy string-plus-`Key` input contract with frozen `TuiInputEvent` values discriminated by `type: "text" | "key" | "paste"` and complete nested `TuiKey` identities. Text is non-empty and may include a reliable logical key, paste contains one complete payload including empty paste, and key-only input has no text. A key contains exactly one normalized semantic name or one logical character plus `shift`, `alt`, `ctrl`, `meta`, `super`, and `hyper`; known names remain suggested while future lower-kebab-case names are accepted. Protocol, raw sequence, parser token, codepoint, base-layout identity, locks, release, and unsupported input remain private. `useInput()` accepts a live handler ref and reactive `isActive`, broadcasts to every active subscription, ignores returns, suppresses releases, and delivers repeats normally. `MountOptions.exitOnCtrlC` defaults to false; true exits before delivering that exact key, while paste never triggers it. Removed `useInputAvailability()`, `usePaste`, public `Key`, public routing decisions, public Kitty configuration, mount `rawMode`, and `useRawInput()`.
- Restored complete low-level `useStdin()` access with exactly the selected `Readable`, `isRawModeSupported`, and `setRawMode(enabled)`. Each call owns one independent idempotent raw-mode hold with scope cleanup and composes with managed-input ownership without releasing another consumer. Raw-only use does not start Runtime parsing, change encoding, or negotiate Kitty or bracketed paste; caller-owned direct listeners deliberately have no ordering, deduplication, protocol-filtering, or byte-exact composition guarantee with managed input. Non-TTY streams remain observable without raw support, and string rendering uses an isolated inert stream.
- Replaced Runtime's experimental focus manager, focus scopes, targeted and external input hooks, traversal, automatic Tab handling, restoration, string lookup, disabled policy, and automatic focus with one minimal `useFocus()` contract. Every call creates an opaque identity in one private per-app unique-owner controller; the targetless overload follows its Vue scope, while the targeted overload additionally follows a readonly component ref's rendered boundary. A valid `focus()` synchronously replaces the previous owner, `blur()` releases the current handle, and readonly `isFocused` composes with `useInput(handler, { isActive: focus.isFocused })`. Unavailable, disposed, and string-rendering operations are inert without queued acquisition, and target loss or cleanup clears ownership without restoration.
- Replaced Yoga-only `useBoxMetrics()`, imperative `measureElement()`, and the experimental broad `useElementGeometry()` projection with Box-only `useBoxSize()`, which accepts a direct same-app `<Box>` ref and reports only the last accepted full `{ width, height }`. Removed public `useBoxPresence()` while retaining private rendered-target facts required by `useFocus(target)` and other separately accepted Runtime behavior. Paint fragments, clipping provenance, surface coordinates, and renderer nodes remain private. The focus-bound public `useCaret()` experiment is withdrawn pending a Text-position contract; Runtime retains its private cursor mechanism and writers retain their last successful frame and cursor baseline when a stream write fails so an identical retry is not dropped.
- Removed the experimental `/fullscreen` package entry, pointer hooks, arbitrary-Text selection, clipboard hooks and mount transport, and selection-only styling. Hit testing, capture, selection, clipboard, and terminal reporting implementations remain private evidence, while these user capabilities are explicitly outside the minimum foundation until a smaller Runtime-only primitive is proven.
- Reduced `MountOptions` to Node `Readable`/`Writable` streams, mode, console patching, and the default-off `exitOnCtrlC` convenience; omitted streams select their corresponding process streams, omitted mode selects Inline, and explicit Fullscreen requires TTY output with positive dimensions. `TuiApp` now projects the consumer-installed Vue public app surface without underscore-prefixed renderer fields or `TuiNode`, and `mount()` returns the actual user root instance. Deterministic preflight failures, including busy stdout, remain synchronous and non-consuming, while a consumed mount failure preserves one error through rollback and exit settlement.
- Reduced `useApp()` to `exit(error?)` and kept render-flush and exit barriers on the app-owner handle. `waitUntilRenderFlush()` is an always-callable, non-reporting barrier over already-accepted work; `waitUntilExit()` settles only after rollback, restoration, and accepted output and rejects with the first fatal cause by identity. Runtime borrows caller streams, coordinates final non-TTY documents, observes active stream loss and write failures, and owns terminal acquisition, cadence, suspend/resume, and restoration without exposing scheduler or protocol controls. Console patching remains under independent public-API review.
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
