# Changelog

All notable changes to `@vue-tui/runtime` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## Unreleased

### Added

- Added Box-rooted support for Vue's built-in `v-show`. Hidden subtrees remain mounted and reactive while leaving Yoga layout, paint, targeted focus availability, and Box size; showing again restores the Box's current layout and paint properties.
- Added independent terminal-default Text color selection through `color="default"` and `backgroundColor="default"`. Each channel inherits when omitted, selects the terminal default for its subtree when set to `"default"`, and restores the enclosing resolved value afterward without changing the other channel or independent modifiers.
- Added the supported `@vue-tui/runtime/inline` entry with the `Static` terminal-history primitive.
- Added narrow, unsupported `@vue-tui/runtime/internal/devtools` and `@vue-tui/runtime/internal/testing` bridges for the version-coupled official Vite and testing packages. The former public-looking `/devtools` and `/testing` paths are not package exports, and no third-party replacement guarantee is intended.

### Changed

- Reduced the common rendering foundation to `createApp`, `renderToString`, `Box`, and `Text`; removed public `Newline`, `Spacer`, `Transform`, `useAnimation`, and their named types. `BoxProps` now has exactly 46 fields across flex, gap, size, positioning, spacing, border, background, and clipping groups, with no public `display` field. `TextProps` has exactly nine fields: two independently inherited color channels, the six three-state `dimColor`, `bold`, `italic`, `underline`, `strikethrough`, and `inverse` modifiers, and the five `"wrap"`, `"hard"`, `"truncate"`, `"truncate-middle"`, and `"truncate-start"` width modes. The shared public `Color` grammar, bounded layout numbers, and 1,048,576-cell pre-allocation paint limit remain. Box and Text reject every undeclared attribute before host creation, while `renderToString()` exposes readonly `width` and `height` options, defaults to 80×24, accepts `height: Infinity` for an explicitly unbounded document, and ignores unrelated runtime keys without reading them. String rendering makes `useApp().exit()` inert and owns its root VNode plus a render-local Yoga allocation ledger so initial Vue patch failures dispose created scopes, inert streams, and Yoga nodes before rethrowing the original error.
- Removed the screen-reader presentation experiment completely from the current Runtime: `presentation`, ARIA component props and named types, `INK_SCREEN_READER` selection, the transcript renderer, and internal string-render helpers are no longer supported. This does not alter the historical `0.1.0` release record below.
- Replaced the broad `useRenderSession()` and the experimental `useLayoutWidth()` / nullable `useViewportHeight()` split with `useLayoutSize()`, whose readonly numeric `width` and `height` refs come from one accepted root-layout snapshot. Mounted non-TTY output uses a fixed 80×24 document model, and explicit string rendering reports its modeled dimensions, including `Infinity` only when requested. Physical columns, rows, the render-session graph, and its named types remain internal Runtime state, and `@vue-tui/testing` does not expose them through `RenderResult.session`.
- Removed public `useStdout()`, `useStderr()`, `CoordinatedWriteResult`, and raw output-result contracts. Runtime retains one private ordered output gate for frame, console, history, backpressure, and restoration work; applications no longer need to understand that implementation protocol.
- Reduced `Static` to one mounted slot tree and one non-empty commit. Vue owns collection iteration and keys; Runtime settles only blocks represented by non-empty bytes in the current settlement transaction, so an output-free render stays open for later content or ordinary unmount. Mounted identity controls eligibility: ancestor or direct `v-show` does not defer a block, while `v-if` controls whether the instance exists. Blocks accepted together use current Vue host-tree preorder rather than mount, registration, Yoga visual, or reverse-flex order; later acceptance only appends. Root, component, Fragment, and ordinary Box placement is supported while ancestor layout does not shape the isolated block; other placement and nesting are unsupported rather than a public validation or recovery contract. A normal write seals the whole batch, lets Vue finish replacing every host with a stable anchor, and only then forwards the first effect-scope cleanup failure that Runtime had to isolate; Vue-handled watcher and lifecycle errors retain their native timing. Ancestor removal and app teardown settle the same batch without throwing from a renderer host operation, exit waits for settlement, and an isolated teardown failure reserves first-cause identity when observed so a later ordinary cleanup cannot replace it. A throwing write abandons represented blocks without retry. The `items`, `style`, scoped item/index payload, and five collection-specific named types were removed. An effective visual Fullscreen surface rejects Static before history bytes or a replacement frame.
- Replaced the legacy string-plus-`Key` input contract with frozen `TuiInputEvent` values discriminated by `type: "text" | "key" | "paste"` and complete nested `TuiKey` identities. Text is non-empty and may include a reliable logical key, paste contains one complete payload including empty paste, and key-only input has no text. A key contains exactly one normalized semantic name or one logical character plus `shift`, `alt`, `ctrl`, `meta`, `super`, and `hyper`; known names remain suggested while future lower-kebab-case names are accepted. Protocol, raw sequence, parser token, codepoint, base-layout identity, locks, release, and unsupported input remain private. `useInput()` accepts a live handler ref and reactive `isActive`, broadcasts to every active subscription, ignores returns, suppresses releases, and delivers repeats normally. `MountOptions.exitOnCtrlC` defaults to false; true exits before delivering that exact key, while paste never triggers it. Removed `useInputAvailability()`, `usePaste`, public `Key`, public routing decisions, public Kitty configuration, mount `rawMode`, and `useRawInput()`.
- Restored complete low-level `useStdin()` access with exactly the selected `Readable`, `isRawModeSupported`, and `setRawMode(enabled)`. Each call owns one independent idempotent raw-mode hold with scope cleanup and composes with managed-input ownership without releasing another consumer. Raw-only use does not start Runtime parsing, change encoding, or negotiate Kitty or bracketed paste; caller-owned direct listeners deliberately have no ordering, deduplication, protocol-filtering, or byte-exact composition guarantee with managed input. Non-TTY streams remain observable without raw support, and string rendering uses an isolated inert stream.
- Replaced Runtime's experimental focus manager, focus scopes, targeted and external input hooks, traversal, automatic Tab handling, restoration, string lookup, disabled policy, and automatic focus with one minimal `useFocus()` contract. Every call creates an opaque identity in one private per-app unique-owner controller; the targetless overload follows its Vue scope, while the targeted overload additionally follows a readonly component ref's rendered boundary. A valid `focus()` synchronously replaces the previous owner, `blur()` releases the current handle, and readonly `isFocused` composes with `useInput(handler, { isActive: focus.isFocused })`. Unavailable, disposed, and string-rendering operations are inert without queued acquisition, and target loss or cleanup clears ownership without restoration.
- Replaced imperative `measureElement()`, the experimental broad `useElementGeometry()` projection, and the intervening `useBoxSize()` experiment with Box-only `useBoxMetrics()`. It accepts a direct same-app `<Box>` ref and exposes one coherent accepted parent-relative `width`, `height`, `left`, `top`, and `hasMeasured` snapshot. Removed public `useBoxPresence()` while retaining only the rendered-target facts required by `useFocus(target)` and accepted Box-metrics publication. No general paint-fragment, clipping-provenance, or surface-coordinate service remains. The focus-bound public `useCaret()` experiment and its semantic position controller are removed pending a Text-position contract; Runtime retains only generic terminal-cursor visibility and restoration, and writers retain their last successful frame baseline when a stream write fails so an identical retry is not dropped.
- Removed the experimental `/fullscreen` package entry, pointer hooks, arbitrary-Text selection, clipboard hooks and mount transport, selection-only styling, and their unused hit-testing, capture, selection, clipboard, and mouse-reporting implementations. These user capabilities are explicitly outside the minimum foundation until a smaller Runtime-only primitive is proven.
- Replaced the unused private focus-boundary/default/external input-route topology with the exact mechanism `useInput()` needs: a captured per-fact broadcast subscriber list plus Runtime-owned semantic-input demand. Focus does not secretly select input routes, and no private external-forwarding adapter remains.
- Reduced `MountOptions` to Node `Readable`/`Writable` streams, mode, console patching, and the default-off `exitOnCtrlC` convenience; omitted streams select their corresponding process streams and omitted mode selects Inline. Explicit Fullscreen on a live TTY requires positive dimensions, while either mode on non-TTY stdout selects the same fixed-80×24 document host without terminal controls or intermediate dynamic frames. `TuiApp` now projects the consumer-installed Vue public app surface without underscore-prefixed renderer fields or `TuiNode`, and `mount()` returns the actual user root instance. Deterministic preflight failures, including busy stdout, remain synchronous and non-consuming, while a consumed mount failure preserves one error through rollback and exit settlement.
- Reduced `useApp()` to `exit(error?)` and kept render-flush and exit barriers on the app-owner handle. `waitUntilRenderFlush()` is an always-callable, non-reporting barrier over already-accepted work; `waitUntilExit()` settles only after rollback, restoration, and accepted output and rejects with the first fatal cause by identity. Runtime borrows caller streams, coordinates final non-TTY documents, observes active stream loss and write failures, and owns terminal acquisition, cadence, suspend/resume, and restoration without exposing scheduler or protocol controls. Console patching remains default-on with the explicit `false` escape hatch described below.
- Removed Runtime's hidden live component error boundary and visual error overview. Live errors now follow Vue's ordinary `onErrorCaptured()` and `app.config.errorHandler` propagation and continuation rules without automatic application exit; an error escaping the consumed initial mount still rolls back the partial Vue tree, every render-owned Yoga allocation, streams, and terminal state before the original value is rethrown and reported through `waitUntilExit()`. `renderToString()` retains its synchronous capture-and-rethrow policy.
- Kept console patching default-on with `false` as the exact escape hatch. One process-wide patch routes unfiltered setup, update, and Vue-cleanup output to the most recently mounted active app, reveals the previous app when that owner leaves, drains cleanup output before release, and restores native console methods after the last app.
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
