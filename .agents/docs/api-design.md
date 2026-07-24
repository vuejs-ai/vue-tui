# Application API design

> **Status:** historical unstamped design rationale for the earlier Runtime application-foundation candidate. The [Runtime public API decision ledger](./runtime-public-api-decisions.md) supersedes this record's unstamped public shapes and completion conclusion. Many described route, geometry, caret, pointer, selection, clipboard, and accessibility implementations were later removed; the record preserves the reasoning and journey evidence, not a current private implementation. The narrower implemented foundation is recorded in the [Runtime public foundation re-audit](./runtime-public-foundation-reaudit.md), and its accepted `Static` contract lives in the decision ledger. No VOUCHED stamp is implied.

## Historical conclusion and current authority

This record previously concluded that a broader Runtime application foundation was complete. The 2026-07 item-by-item review replaced that public surface with the narrower completed foundation recorded in the [Runtime public foundation re-audit](./runtime-public-foundation-reaudit.md). The implemented layout facts are `useLayoutWidth()`, setup-time nullable `useViewportHeight()`, and direct same-app Box-only `useBoxSize()`; general accepted-tree presence is not exposed. Focus is now the implemented pair of explicit `useFocus()` overloads with one shared readonly handle. The broad render-session, element-geometry, focus-manager, scope, traversal, routing, caret, pointer, selection, and clipboard surfaces described below are historical designs; most corresponding mechanisms were removed.

Future application-layer work should continue to start with capability boundaries and state ownership, validate them through representative journeys, and only then stabilize reusable composables and components. The implemented and vouched lower-layer contracts here are constraints for that work rather than an automatically active new design phase; no new public contract should be inferred from this historical record.

The first completed design topic was the **rendering-mode contract**: which terminal surface the application owns in Inline and Fullscreen modes, which regions remain addressable, where completed output lives, and which capabilities each mode can honestly provide. Input, focus, geometry, scrolling, overlays, and components were designed inside that contract rather than assuming a permanently addressable screen.

F1.3 selected [`useRenderSession()`](./render-session.md) as the readonly reactive projection of that contract and `useLayoutSize()` as its focused responsive-layout projection. The session preserves requested and effective mode in one finite resolution value, describes output destination, dynamic updates, and presentation separately, distinguishes terminal size from the effective layout bound, and exposes semantic availability without leaking a mutable renderer. F1.4 completed the internal live source, F1.5 completed the same authority for finite deterministic hosts and both fixed string presentations, F1.6 made the accepted Inline row bound and history ownership true, F1.7 completed exact lifecycle ownership, suspension/continuation, and clean/fatal exit behavior, and F1.8 published the two verified public composables while removing their superseded hooks.

F2 now has one internal [rendered-target lifetime](./rendered-target-lifetime.md): a registration follows the resolved host below a Vue ref, reconciles stable component proxies on renderer commits, invalidates synchronously on host removal, and releases on scope, app, string-host, and HMR teardown. `useDraggable()` and the former measurement adapter supplied the original evidence; F5 now uses the same mechanism for public semantic geometry without publishing a generic target composable or renderer node. F6 now uses it for the Fullscreen mouse composables in [targeted-pointer.md](./targeted-pointer.md) and has directly removed the former drag and listener adapters.

The completed [semantic geometry and caret proposal](./semantic-geometry-and-caret.md#selected-public-authoring-surface) selects the exact Vue contract: a direct `ElementTarget`, one frozen discriminated `ElementGeometry` snapshot with local-to-parent-to-surface rendered fragments, `useElementGeometry()`, and a focus-eligible `useCaret()` request at an element-local `CellPoint`. Renderer paint is the authority for public geometry and private insertion-slot mappings, one arbiter selects an eligible owner, and the mode writer performs the final render-surface-to-terminal translation. Inline and Fullscreen therefore share semantic geometry and caret ownership; they differ only in the final physical output mapping. Parent-relative Yoga reads, targetless output-origin coordinates, focus state, text insertion state, selection, and pointer targeting remain separate concepts.

Interaction ownership follows as the second topic. It must distinguish two independent questions: how one effective logical focus target is maintained, and how app, overlay, region, focused-control, and external-target handlers take priority or pass an event onward. These are cooperating parts of one input model, not three competing choices called targeted events, scoped commands, and a hybrid.

The completed implementation ledger and definition of done live in [api-foundation-roadmap.md](./api-foundation-roadmap.md). That ledger is the canonical answer to what is Done, Closed, Non-blocking, or explicitly reopened; this record remains the canonical design rationale.

F8 selects one semantic document rather than a generic geometry range or global joined tree. `useTextSelection()` attaches to exactly one top-level Text from the Fullscreen subpath, derives complete-grapheme offsets and visual stops from semantic Text plus successful final-paint provenance, and keeps one active range across the app. `useClipboard()` remains a common root service with one explicit custom or OSC 52 mount transport; copied, requested, unavailable, and rejected stay distinct, and every non-empty result returns the exact text for caller-owned fallback. The API and final Runtime closure evidence are complete on the local candidate.

## Target application model

The target is one Vue application model and one `createApp`, with the terminal surface selected when the application mounts. Rendering mode is a request for a live terminal screen model, not a label applied to every possible output environment:

```text
Vue application + createApp
  -> mount request
  -> runtime resolves the actual output host and surface
       live visual TTY -> inline main-screen live region OR full-screen alternate-screen viewport
       screen reader   -> main-screen linear transcript
       redirected I/O  -> final stream by default OR an explicitly forced stream updater
       test harness    -> modeled production session + structured content observation + emulated terminal
       renderToString  -> static document
  -> useRenderSession() exposes readonly facts about what actually became effective
```

Inline and full-screen are peers, not a complete mode and a degraded subset. Inline contributes main-screen composition and native terminal scrollback but can replace only rows the terminal can still address. Full-screen contributes a fixed viewport, stable screen coordinates, clipping, and arbitrary repaint but its visible state disappears when the alternate screen is restored. Neither has every property of the other.

Requested mode and effective surface must remain separate. A non-TTY or string render may acquire no live terminal mode. A TTY Fullscreen request under screen-reader presentation falls back to effective Inline, while deterministic tests expose the same resolution as the production preset they model. Later capability APIs must derive from the effective surface and independent input environment rather than from the requested string or test harness alone.

The accepted non-TTY default follows pinned Ink v7.0.4: newly committed `Static` output is written immediately, the current dynamic frame is retained, and teardown writes only the latest dynamic frame plus a newline. An explicit live-update override may instead run the relative or linear stream updater and emit ANSI update bytes, but a non-TTY stream never acquires an alternate screen, stable viewport, or hit map. Deterministic observation is orthogonal to output through an internal render observer; the former `debug` output branch is removed. Stdin/raw-input availability remains independent from this stdout policy.

The common authoring surface contains Vue components and composables whose semantics do not depend on whole-screen ownership: passive layout and text primitives, shared logical input and focus foundations, and a bounded, input-free `ScrollBox`. A component should not inspect global mode and quietly change meaning. An operation that requires stable physical coordinates, a hit map, alternate-screen ownership, terminal-wide capture, or main-screen history belongs behind an explicit terminal-integration boundary and may reject an unavailable surface immediately. F6 selects ref-bound Fullscreen mouse composables, not a parallel catalog of `PointerBox`, `PointerScrollBox`, and other visual variants. Runtime closure applies the corresponding Inline boundary to terminal history through `@vue-tui/runtime/inline`.

Two historical APIs were deliberately not promoted into the common root merely because they existed. The active Runtime-foundation re-audit retains only the `Static` value on `@vue-tui/runtime/inline`: one mounted instance commits one ordinary slot tree once, while Vue iteration and stable keys own collections. It removes the five collection-specific named types, `items`, `style`, and the scoped item/index payload. Effective visual Fullscreen rejects any `Static` presence before history bytes or a new viewport frame, while a Fullscreen screen-reader request remains supported because its effective surface is Inline. The decision-independent output transaction repaired at `dd14295` remains the mechanism: preparation is side-effect free, a normal write accepts once, an output-free transaction also accepts, and a throwing write abandons the whole host without retry. Acceptance seals every prepared host before callbacks can re-enter Vue. The older `Object.is` item-prefix design remains historical evidence for why physical handoff must own settlement, not the current public contract. The accepted R6 public contract exposes a related output boundary as `CoordinatedWriteResult`: accepted writable, accepted backpressured with `ready`, or blocked without retaining the attempted bytes. One Runtime gate preserves stream order, waits for `drain`, and keeps only the latest desired replaceable frame. The former root `useMouseInput()` represented terminal-wide raw mouse rather than element-targeted delivery and was removed during the F6 clean-slate cutover.

## Current mode, pointer, and scrolling boundary

This section records the design boundaries that are stable enough to carry forward after the source audit, concrete examples, and the cross-framework evidence in [terminal-ui-prior-art.md](./terminal-ui-prior-art.md). It remains unstamped. The mount shape is accepted, and the exact implemented F6 contract and evidence live in [targeted-pointer.md](./targeted-pointer.md).

### One app, two rendering modes

Keep one canonical `createApp`. The public mount term is `mode`:

```ts
createApp(App).mount({
  mode: "fullscreen",
});
```

Inline and full-screen select different terminal-surface contracts within the same `createApp` and mount lifecycle; they are not different Vue application kinds. A separate `createFullscreenApp` would duplicate lifecycle, plugins, dependency injection, testing, and component authoring while still failing to express effective TTY and capability state. Revisit a separate creator only if implementation proves that the modes require incompatible Vue app construction or lifecycle types.

`mode` is optional and omission, including `mode: undefined`, requests Inline. This default reduces ceremony for main-screen composition but does not make Inline the primary product mode or Fullscreen a fallback. `mode: "inline"` and `mode: "fullscreen"` are the only other accepted values. Every other runtime value fails synchronously, as does the presence of an own `fullscreen`, `alternateScreen`, `interactive`, or `debug` property, before the runtime reads another stream option, reserves a stream, or mutates terminal or Vue state. Removed-option errors take precedence when old and new keys appear together. `liveUpdates?: boolean` is the separate output-cadence override; its name deliberately does not claim input availability.

After validation and defaulting, every live mount records one normalized requested mode even when the host cannot make it effective. The accepted finite input and host tables are in [rendering-mode-matrix.md](./rendering-mode-matrix.md#f12-accepted-mount-contract). F1.4 directly removed `fullscreen`, `alternateScreen`, and the broad `interactive` override; F1.5 directly removes `debug` and replaces its testing use with output-independent observation. No compatibility alias or warning period is added while the project is experimental.

### Common components stay passive

The common `Box`, `Text`, and `ScrollBox` APIs do not advertise targeted pointer listeners. Their template and TSX types explicitly reject `onClick`, `onWheel`, `onMousedown`, and `onMouseup`; JavaScript and `any` values fail at runtime rather than using Vue listener fallthrough to turn a passive node into a target.

Do not add `PointerBox`, `PointerScrollBox`, or a component variant for every visual-component and interaction combination. Targeted mouse input is behavior attached to an existing rendered element, so the selected API shape is a ref-bound composable from the Fullscreen entry point:

```vue
<script setup lang="ts">
import { useTemplateRef } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import { useMouseEvent } from "@vue-tui/runtime/fullscreen";

const target = useTemplateRef("target");

useMouseEvent(target, "click", () => {
  open();
  return "consume";
});
</script>

<template>
  <Box ref="target">
    <Text>Open</Text>
  </Box>
</template>
```

The F6 implementation uses `useMouseEvent(target, type, handler, options?)` for click and wheel, plus one `useMouseDrag(target, handler, options?)` lifecycle for captured primary-button dragging. `Mouse` is honest terminal vocabulary; `Pointer` would imply browser identity, device type, pressure, and multi-device semantics that SGR does not provide. One keyed primitive avoids separate `useClick` and `useWheel` APIs while preserving exact event inference, while a dedicated drag hook prevents independently registered callbacks from disagreeing about one capture owner. Root `useDraggable()` was removed because its application x/y state was not renderer-owned.

The composable marks the current referenced host element as a hit-test target for exactly the ref's rendered lifetime. It registers when the ref becomes non-null, unregisters when `v-if` removes the node, moves when the ref points elsewhere, and releases everything on scope disposal. Setup lifetime alone is insufficient: a handler must not survive after its rendered target disappears.

Only elements explicitly enrolled by a full-screen mouse composable participate in its semantic route; ordinary `Box` and `Text` nodes remain passive. Click and wheel select the topmost visible matching registration from the last successfully displayed F5 geometry generation, freeze matching registered ancestors at fact start, and expose zero-based surface plus receiver-local cells. The bound ref is the current receiver and `delivery` states target versus bubble, so the proposal does not publish renderer-node, component-proxy, or mutable DOM target identities. Required `"continue"` or `"consume"` results control only truthful ancestor propagation. Drag has one exclusive captured owner and an explicit start/move/end/cancel lifecycle.

### Full-screen targeted input is an explicit capability boundary

Targeted delivery requires both decoded terminal mouse input and a reliable physical origin plus hit map. The fixed normal full-screen viewport can provide both. Current visual Inline can receive terminal coordinates but cannot reliably map them to elements, so an active full-screen mouse hook on that effective surface fails immediately instead of leaving a dead handler. `isActive: false` remains inert.

The target entry point is therefore `@vue-tui/runtime/fullscreen`, not a speculative `/pointer` path. The implemented and guarded subpath adds no combined mouse-availability query: `useRenderSession()` already reports whether a targetable Fullscreen surface exists, `useInputAvailability()` reports managed input, and no journey currently branches on mouse protocol support alone. Final-output, string, screen-reader, and other non-targetable presentations remain inert; a visible target under an effective visual Fullscreen surface fails exactly when managed input is unavailable or local mouse-mode acquisition fails. F6 supports xterm-compatible SGR mouse without a speculative handshake, so a terminal that silently ignores the mode cannot be distinguished from the absence of user mouse input. Effective visual Inline plus an active hook is the programming error. If a future bounded Inline renderer proves reliable targeted input, vue-tui can add a broader re-export while retaining the honest Fullscreen path.

Do not expose a separate public concept called mouse authorization or require ordinary full-screen applications to repeat `mouse: true`. When at least one full-screen targeted composable has a live target, the runtime acquires the minimum required reporting level; it downgrades as stronger consumers disappear and restores terminal modes after the last target. Common components never acquire mouse reporting in either mode. F6 removed the former terminal-wide hook; a future target-bound child-terminal protocol adapter requires its own consumer evidence and contract rather than retaining that incomplete stream speculatively.

Mouse reporting still changes terminal-native selection even on the alternate screen. Full-screen makes application-owned scrolling and selection a reasonable product responsibility; it does not erase the mechanism's side effect. F8 addresses that cost through one explicit Text-bound selection composable and a separate common clipboard service rather than hiding selection inside pointer registration or adding a blanket mount-level mouse override.

### `ScrollBox` stays common and input-free

`ScrollBox` owns clipping, sticky-bottom state, and semantic scrolling operations without inspecting mode or acquiring terminal input. It works whenever its parent gives it a bounded height, including a bounded region inside an inline application. A terminal-owned transcript is a different history model and uses `Static` from `@vue-tui/runtime/inline` rather than an unbounded `ScrollBox`.

Its public type rejects targeted mouse listeners, and its SFC does not let them fall through accidentally to the internal viewport `Box`. Fullscreen wheel behavior composes by binding `useMouseEvent()` to an existing target and calling the `ScrollBox` handle; no mouse-specific `ScrollBox` component is needed.

F7 retains the four imperative `ScrollBox` operations and replaces their `void` return directly with one synchronous boolean. `true` means only that the effective top line changed after flooring and clamping; a sticky-following re-arm without movement returns `false`. The earlier F4 and F6 routes demonstrated how a higher layer can stop after inner movement and continue at an edge, but those focus-scope and target-to-ancestor routes are not current Runtime APIs. Page commands reuse `scrollByLines()` with the accepted F5 wrapper height. The component remains common, passive, input-free, and the sole owner of its offset and sticky-following state. Public types, JavaScript validation, packed consumption, deterministic journeys, real PTYs, visual restoration, and the historical repository and CI gates agree, so F7 is Done.

### Fullscreen selection and clipboard remain separate owners

F8 keeps selection on `@vue-tui/runtime/fullscreen` and clipboard on the common root. `useTextSelection(target, { isActive?, pointer? })` accepts exactly one top-level Text target, derives its semantic document from the Text tree, and publishes only a mapping whose final terminal frame succeeded. A later overlay can cover a source cell without inheriting its highlight, soft wraps do not become copied newlines, and clipped semantic content remains available to command selection. Ambiguous transforms, truncation, or zero-width mappings report unavailability rather than approximate.

The selection service supplies grapheme, visual-row, document-bound, select-all, clear, pointer, and copy operations but no hidden key bindings or focus owner. Each app can register several documents but only one active range; application focus, collection selection, editor insertion, caret, and clipboard state remain independent.

`useClipboard()` exposes the configured app transport and exact result. A custom adapter may confirm `copied`, report only `requested`, explain `unavailable`, or return `rejected`; OSC 52 can only return `requested` after writing the encoded control sequence. The runtime retains no automatic operating-system adapter or fallback chain. Returning the exact text lets the application show a manual fallback without duplicating the selection source. The full selected contract and completed closure state are in [Fullscreen text selection and clipboard](./fullscreen-selection-and-copy.md).

### Terminal-wide raw mouse remains a separate capability

The former public `useMouseInput` handler received only vertical wheel events with 1-based absolute coordinates. The shared internal parser decodes button down, button up, drag, and all four wheel directions, while targeted dispatch synthesizes `click` from a matching down/up pair. The removed hook had no target ref, hit test, bubbling, or relationship to `ScrollBox`.

Keep terminal-wide raw mouse conceptually distinct from element-targeted delivery: raw coordinates do not become Inline component clicks, and acquiring raw mouse still takes native terminal selection and wheel behavior away from the user. The F6 journeys did not need a terminal-wide stream, while Herdr-like pane forwarding requires a target-bound pane-local protocol adapter that the former vertical-wheel-only, one-based hook could not express. F6 therefore removed root `useMouseInput()` without replacement; the vouched physical `useStdin().stdin` escape hatch remains outside managed semantics and does not acquire mouse reporting.

### Mouse reporting rules

The target terminal controller must keep reference-counted ownership and request only the strongest currently needed protocol:

- click and wheel require button reporting (`1000 + 1006`);
- drag requires button-motion reporting (`1002 + 1006`);
- future hover requires all-motion reporting (`1003 + 1006`);
- simultaneous consumers select the highest active level and downgrade when the stronger consumer unmounts;
- the final release and every normal, error, signal, suspend, and HMR teardown release exactly the level and SGR coordinates this controller acquired, including acquired levels no longer represented by a live request.

The F6 controller now selects button or button-motion reporting from the visible registered demand, downgrades when stronger demand disappears, and releases all owned reporting on target loss and lifecycle teardown. F1.7's exact-ownership transaction temporarily releases the acquired level during suspension, reacquires the strongest still-live request after continuation, and does not disable modes it never owned.

The F6 testing surface is part of the same contract. `@vue-tui/testing` exposes a typed down/move/up/wheel driver at the parser-normalized physical-fact boundary plus observable button/button-motion reporting state. It does not inject final click or drag events, so deterministic application tests still exercise successful-frame hit testing, synthesis, propagation, capture, cancellation, and demand; real PTYs separately cover SGR bytes and terminal restoration. The exact types and failure behavior live in [targeted-pointer.md](./targeted-pointer.md#deterministic-testing-surface).

## What counts as application API

The API is larger than the runtime export list. It includes:

- the Vue platform behavior an author can rely on, including component lifecycle, refs, props, events, slots, `v-model`, directives, and `provide`/`inject`;
- app creation, terminal-session lifecycle, requested and effective rendering mode, environment capabilities, exit, restoration, and render completion;
- renderer primitives for layout, text, clipping, measurement, cursor placement, hit testing, and any future renderer-native surface;
- composables that expose app services or reusable headless interaction behavior;
- higher-level components and their controlled state, events, slots, and imperative handles;
- public types, failure and degradation behavior, and the explicit retention, replacement, or removal of current APIs;
- testing and development APIs needed to drive the same semantics deterministically.

The existing [public API contract](./api-contract.md) governs which runtime exports and types form the deliberately supported and tested surface in the current version. This record governs how target APIs should be chosen and fit together. The vouched [package layers](./package-layers.md) continue to govern where accepted capabilities live.

## First principles

### Make ownership explicit

Every mutable interaction state needs one source of truth and a clear set of semantic operations. A focus target should not be focused in two independent registries; a text cursor should not be inferred separately by the editor, painter, and terminal cursor; a scroll component should not keep a hidden position that another navigation helper also tries to own.

Framework-provided state should normally be exposed as readonly Vue refs plus semantic operations. Values applications need to control or persist should support normal Vue controlled-state conventions such as `v-model`, `update:*` events, and explicit props. A component may provide internal default state, but controlled and uncontrolled modes must not create two competing owners.

### Separate application meaning from interaction mechanics

The working division to validate through the representative journeys is:

| Application responsibility                                                                | Framework responsibility                                                                             | Controlled boundary                                                                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Messages, tool calls, metrics, Git or database entities, workspace and PTY-session models | Terminal input parsing, mode ownership and restoration, output coordination                          | Current value, query, active key, selected or expanded keys, open state                   |
| Search ranking, alert thresholds, approval policy, command execution, domain validation   | Unique focus ownership and rendered-target invalidation; input parsing and delivery                  | Application supplies ordering, scopes, modal policy, names, restoration, and route policy |
| Model requests, polling, filesystem and process side effects, PTY lifecycle               | Text-editing mechanics, collection navigation, scroll coordination, generic pending/cancel mechanics | Application decides what submit, accept, cancel, or retry means                           |
| Product layout, fields, visual hierarchy, and domain-specific labels                      | Renderer primitives, geometry, clipping, targeted events, lifecycle cleanup                          | Components compose primitives without acquiring domain data or side effects               |

This boundary does not imply one large framework state machine. It says generic mechanics should not be rewritten in every application, while domain models and side effects should not enter vue-tui.

### Be Vue-native at the public boundary

- Use component mount and unmount, effect scopes, and `provide`/`inject` to create and clean up app and subtree services.
- Prefer props, typed emits, `v-model`, slots, readonly refs, and semantic template-ref methods over React-shaped hooks or renderer handles.
- Support both templates and TSX and prove their types with `vue-tsc` and `tsc`.
- Treat idiomatic Vue behavior such as `v-show` as a platform-contract question with terminal semantics, not as an arbitrary DOM feature request.
- The implemented layout-visibility contract is Box-rooted. It composes a directive-hidden layer with the latest authored Box `display`, keeps the Vue subtree alive, and lets the existing Yoga-derived layout, paint, focus, geometry, caret, and pointer services observe one effective hidden state. Do not imply partial layout visibility support on `Text`, context-dependent virtual Text, or `Transform`. Static is a separate mounted history boundary: ancestor or direct `v-show` remains operational but does not change its eligibility.
- Nested `Text` foreground reset is a content-style contract, not a reserved-character protocol. `color="revert"` and `color="initial"` structurally block enclosing foreground color for their subtree while leaving background and independent modifiers composable; user Unicode and Transform results remain unmodified content.
- Keep host nodes, Yoga nodes, paint buffers, ANSI encoding, and scheduler internals behind the runtime boundary.

### Distinguish request, effective state, and capability

An application can request full-screen mode, mouse handling, raw input, Kitty keyboard features, or another terminal behavior without the environment being able to provide it. Public environment APIs must distinguish:

1. what the application requested;
2. what rendering mode and terminal modes are actually active;
3. what the terminal is known to support, not support, or has not yet answered.

Capability negotiation shares stdin with user input. Replies to framework-owned terminal queries must reach the waiting protocol controller before application input routing, and a timeout must leave an explicit unknown or unsupported result without losing unrelated bytes.

Do not make components inspect `stdout.isTTY`, process environment variables, or private mount options. Do not silently turn an unavailable capability into a successful-looking operation when the caller needs to adapt. The failure, no-op, fallback, or detectable-state behavior must be part of each API contract.

### Preserve real differences between inline and full-screen

Shared concepts should use one API only when their semantics are genuinely shared. Inline output can append completed content to main-screen scrollback but cannot address arbitrary old rows. Full-screen output owns an addressable alternate-screen viewport. Rendering-mode differences belong primarily to the app runtime backend; components should depend on semantic capabilities rather than scattering checks for a mount boolean. The concrete invariants and their API consequences are the first design packet below.

### Design types and testing with behavior

Public value exports, public types, lifecycle and cleanup, template and TSX inference, non-TTY behavior, and terminal-visible output are all contract. Every accepted API should arrive with its testing control surface rather than leaving `@vue-tui/testing` to imitate it later.

## Public layers

| Layer                   | Responsibility                                                                                                                         | Stability rule                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Vue platform contract   | Which Vue authoring and lifecycle behavior has terminal meaning                                                                        | Supported behavior is tested in templates and TSX; unsupported behavior is documented or rejected clearly           |
| Runtime primitives      | Layout, text, clipping, measurement, hit testing, cursor and renderer-native surfaces                                                  | Small semantic surface; no Yoga, host-tree, cell-buffer, or ANSI implementation leakage                             |
| App runtime services    | Session lifecycle, effective rendering mode, capabilities, input parsing, unique focus ownership, terminal modes, scheduling and flush | One service set per mounted app, provided through typed Vue injection and exposed through narrow public composables |
| `@vue-tui/use`          | Independent headless behavior with no component or direct terminal dependency                                                          | Create the reserved package only when the first evidence-backed member is accepted                                  |
| `@vue-tui/components`   | Rendered, typed Vue components and component-specific companion composables                                                            | Compose only public runtime/use APIs; use controlled-state conventions and semantic handles                         |
| Testing and development | Deterministic semantic input, lifecycle, frames, PTY-visible acceptance, HMR and clean-consumer workflows                              | Test APIs track public behavior and distinguish content frames from final emulated terminal screens                 |

These are responsibility layers, not a requirement to split the renderer into framework-neutral packages. vue-tui is intentionally Vue-native.

## Evidence for the current target API

### Broadcast input and minimal focus ownership compose without a routing graph

The accepted `useInput()` subscription broadcasts normalized events independently of focus. The accepted `useFocus()` contract creates one opaque identity per call in a private per-app unique-owner controller; a valid `focus()` synchronously replaces the previous owner, `blur()` releases that handle, and readonly `isFocused` is the only public observation. Focused delivery is explicit composition through `useInput(handler, { isActive: focus.isFocused })`, so unrelated broadcast subscriptions continue to run and Runtime exposes no focused-input hook, priority graph, propagation result, or external-forwarding route.

The targetless overload follows only its Vue scope. The targeted overload additionally binds validity to a readonly ref for one current-app stateful component boundary, including stateful single-root chains and true Fragment boundaries. Hidden or detached ancestry, a Comment root, scope disposal, rollback, and app cleanup clear ownership without restoration. Unavailable, disposed, and string-rendering calls are inert and never queue later acquisition. [Issue #250](https://github.com/vuejs-ai/vue-tui/issues/250) remains evidence that renderer-owned target invalidation is necessary; it does not justify publishing a manager, scopes, traversal, string lookup, disabled policy, automatic focus, or routing.

### Focus remains distinct from geometry and caret transport

`useFocus(target)` uses a component boundary only to constrain one identity's validity. It exposes no layout, paint fragments, renderer nodes, text insertion, selection, caret request, terminal cursor, pointer state, focus ring, or target name. The removed public geometry, caret, pointer, selection, and clipboard experiments remain evidence for private mechanisms and later review, not part of the accepted Focus handle.

### Historical gap: modes existed without a public environment contract

Before F1.8, [`MountOptions`](../../packages/runtime/src/render.ts) contained rendering-mode and lifecycle choices while [`useApp`](../../packages/runtime/src/composables/useApp.ts) exposed exit and flush but not effective Inline/Fullscreen mode, output cadence, or terminal capability. The internal session now resolves those facts once across live, deterministic-test, and string hosts, and F1.8's verified `useRenderSession()` gives a pure component the readonly public projection.

[`renderToString`](../../packages/runtime/src/render-to-string.ts) provides a truthful string/document session, isolated inert terminal streams, inert `useFocus()` handles, no input or animation mechanics, and explicitly unavailable app lifecycle operations. Public rendering is fixed visual; the historical internal screen-reader helper described here has since been removed. The string host never reads process terminal state, and `focus()` or `blur()` cannot queue ownership for a later live mount.

### Headless behaviors are repeatedly hand-written

The first-party [coding-agent example](../../examples/coding-agent/src/app.vue) combines the agent state machine, global key routing, append/backspace editing, approval handling, and a painted `█` cursor in one component. The agent model belongs to the application; editing, input ownership, paste, caret and focus mechanics are reusable framework concerns.

A typical finder owns query editing, enabled-item navigation, selection, accept/cancel, and scroll calculations in application code. Completing a selection should await the existing [`waitUntilRenderFlush()`](../../packages/runtime/src/composables/useApp.ts) contract rather than an arbitrary timeout before unmount. Search ranking and domain records stay application-supplied; generic editing, collection movement, and acceptance are product evidence for vue-tui. The flush contract's discoverability is validated by in-repository lifecycle tests, not by external application repositories.

[`ScrollBox`](../../packages/components/src/scroll-box/scroll-box.vue) correctly owns a bounded viewport and follow-latest mechanism without choosing application keys. The accepted input broadcast and minimal focus handle let editor and collection helpers compose an active owner above Runtime, while traversal, scopes, routing, restoration, and collection policy remain optional higher-layer behavior rather than Runtime infrastructure.

### The modeled testing host and package closure are complete

The exact Runtime value exports, deliberate named types, declarations, packed consumers, and family-internal adapters are covered by R11 and R12. Type-only exports remain checked individually because JavaScript cannot enumerate them at runtime; this is a deliberate contract policy rather than an incomplete whole-package snapshot.

`@vue-tui/testing` directly models Inline or Fullscreen requests, visual or screen-reader presentation, live or teardown update cadence, TTY or stream output, TTY or non-TTY input, and deliberate dimensions. `RenderResult` exposes the same component-visible session, structured `{ dynamic, staticOutput }` frames, a separate xterm-emulated screen with active buffer, viewport, scrollback, cursor position and DECTCEM visibility, resize, and deterministic `suspend()`/`resume()` controls, plus idempotent disposal. `unmount()` retains the restored screen for assertions; `dispose()` and automatic cleanup release every host resource, after which emulator, resize, suspension, continuation, input, and flush operations fail clearly while `lastFrame()`, frames, and session facts remain inspectable. Removed renderer booleans fail before setup, terminal output never has to be reverse-engineered into frames, and console patching is disabled. F5 caret assertions can therefore distinguish a hidden physical cursor from one merely positioned at the last known cell.

## Capability model derived from the scenarios

| Capability                | Conversational application                            | Monitor or task runner                     | Data workbench                              | Terminal-workspace stress              | Likely layer                                         |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| App/session environment   | inline transcript or full-screen conversation         | non-TTY snapshot and full-screen dashboard | persistent multi-region app                 | full-screen shell around PTYs          | runtime service                                      |
| Input ownership           | composer, approval, interrupt                         | global shortcut and focused filter/action  | search, list, detail and overlay routes     | command scope or PTY fallthrough       | runtime service                                      |
| Focus ownership           | composer or approval owner                            | region or control owner                    | collection, preview, action, or modal owner | command or pane owner                  | minimal Runtime identity plus application policy     |
| Text editing              | prompt, history, multiline, paste                     | filter or action parameter                 | search, rename and forms                    | search/rename outside the PTY          | headless behavior plus component                     |
| Collection behavior       | history and action choices                            | process/job/log lists                      | list, tree, table and preview               | workspace/tab/pane navigator           | headless behavior plus components                    |
| Viewport and scroll       | native inline scrollback or full-screen follow-latest | logs and follow/pause                      | keep active item visible and scroll preview | tab overflow and pane scrollback       | runtime geometry plus headless/component state       |
| Overlay                   | approval and confirmation                             | destructive action or details              | dialog, menu and command palette            | modal, prefix help and settings        | focus/input runtime plus component                   |
| Screen-reader environment | existing linearized runtime output                    | existing linearized runtime output         | existing linearized runtime output          | surrounding vue-tui shell only         | existing runtime accessibility contract              |
| External cell surface     | not normally needed                                   | optional specialized visualization         | optional renderer-native view               | emulated terminal pane with dirty rows | future runtime primitive only with consumer evidence |

The terminal-workspace case is a pressure test. PTY bytes, prefix commands and pane-tree business state do not enter core, but the public interaction model must allow an inner owner to handle an event or deliberately return it to an outer scope or external terminal session.

## First design packet: rendering-mode contract

The vouched product decision defines the two modes, and the completed foundations below define their application contract. Here, an **addressable region** means terminal cells whose current position the runtime can reliably identify and rewrite later.

### Keep rendering mode and independent runtime facts separate

- **Rendering mode** is the requested and effective surface model: inline on the main screen or full-screen on the alternate screen.
- **Render host** says whether the component has a live-session contract or is rendered to a static string. A deterministic harness presents modeled live facts to the component and keeps its test-only identity on `RenderResult`, so application behavior cannot diverge merely because it is under test.
- **Resolver inputs** are independent and can combine: stdin and stdout TTY state, requested live-update policy, selected screen-reader presentation, dimensions, and protocol results. They remain separate inside the runtime so one coarse boolean cannot silently decide unrelated behavior; the internal render observer is not a resolver input.
- **Public runtime facts** describe the semantic result application code can adapt to: mode resolution, output destination/dynamic-update/presentation, terminal and layout dimensions, and selected structural capabilities. Raw TTY and protocol inputs are not automatically public merely because the resolver needs them.
- **Capability** is a semantic guarantee an API can rely on after those inputs combine, such as a stable viewport origin, renderer-owned element hit testing, or coordinated suspension support. F3 owns the first public input-availability contract.

`mode: "fullscreen"` becomes effective Fullscreen only with live output updates, visual presentation, a TTY stdout, and usable terminal dimensions. The runtime preserves requested mode, effective mode, each resolver input, and derived capabilities separately; the selected public projection exposes only the semantic results that application code needs. A component must not infer capabilities from the requested mount value, raw streams, or one coarse environment enum.

### Completed mode invariants

The following table is the completed public contract derived from the two vouched terminal models. Final Runtime closure verifies the matching writer, host, package, PTY, and visual behavior.

| Assumption                   | Inline: `mode: "inline"`                                                                                                                                                                                                                | Full-screen: `mode: "fullscreen"`                                                                                                                                                                                            | API consequence                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal surface ownership   | The app shares the main screen with preceding shell output and owns only its current live render region.                                                                                                                                | The app owns the alternate-screen viewport until teardown.                                                                                                                                                                   | An API must not promise whole-screen effects in inline mode.                                                                                            |
| Completed output and history | One mounted `@vue-tui/runtime/inline` `Static` slot tree becomes terminal-owned scrollback after acceptance and is no longer an editable app surface. Vue keys identify separate blocks.                                                | The alternate screen has no durable shell history; searchable or navigable history must remain in an app-owned model and be projected into the viewport. `Static` presence is rejected before a new visual-Fullscreen frame. | Transcript history and viewport scrolling cannot be represented by one hidden offset with identical meaning.                                            |
| Coordinates                  | The live frame is updated relative to its prior position; its absolute top row is not stably known, especially after `Static` output or external writes.                                                                                | The target contract preserves a viewport origin at `(0, 0)` while the app is mounted.                                                                                                                                        | Shared geometry should be element- or region-relative; absolute hit testing is a capability, not a universal primitive.                                 |
| Redraw and visual overlays   | The runtime can redraw its managed live region but cannot cover and later restore arbitrary rows already in scrollback. A visual overlay must fit inside that live region.                                                              | The runtime can repaint the current viewport, so a visual overlay can cover and restore app content.                                                                                                                         | Modal input and focus behavior can be shared, while visual overlay placement and guarantees remain mode-specific.                                       |
| Scrolling                    | Native terminal scrollback is the natural history surface; bounded app scrolling is possible only inside space the live region currently owns.                                                                                          | The application must provide scrolling for content larger than the viewport, for example through a bounded `ScrollBox`.                                                                                                      | Components must state whether they operate on native history, an app-owned viewport, or either with different behavior.                                 |
| Resize                       | The current live region can relayout and repaint, but the app cannot retroactively rewrite completed terminal history.                                                                                                                  | The target contract relayouts and repaints the full current viewport.                                                                                                                                                        | Resize contracts must say which state is recomputed and must not imply that inline history is still mounted or editable.                                |
| Mouse and selection          | A terminal-wide raw-mouse API can receive absolute coordinates when the terminal and stdin support it, but the runtime cannot reliably map them to inline elements; tracking also suppresses native selection across the shared screen. | A live full-screen target composable can request targeted hit testing when stdin, the terminal, and the active render path support a hit map; the runtime captures only while a live target needs it.                        | Terminal-wide raw mouse and semantic element events are distinct capabilities. Targeted input remains full-screen-only unless the origin model changes. |
| Cursor placement             | Cursor coordinates are relative to the current output origin, whose absolute screen row can move.                                                                                                                                       | The target contract lets a managed caret resolve through a stable viewport origin.                                                                                                                                           | A reusable editor should request a caret relative to a semantic element or managed region instead of computing physical screen cells itself.            |
| Input and logical focus      | Rendering mode alone says nothing about stdin or raw-mode ownership. When live input is effective, Inline uses the shared input and unique-focus primitives.                                                                            | Rendering mode alone says nothing about stdin or raw-mode ownership. When live input is effective, Fullscreen uses the same shared primitives.                                                                               | Runtime shares unique ownership across modes; applications separately compose routing, paste policy, scopes, traversal, and modal behavior.             |
| Exit and restoration         | Current output remains on the main screen and can remain in shell history after terminal modes and cursor state are restored.                                                                                                           | Leaving the alternate screen restores the previous main-screen contents; the app viewport disappears.                                                                                                                        | Completion, suspension, final output, and teardown behavior must have explicit mode-specific contracts.                                                 |

These are product constraints. Runtime closure turns the ownership distinction into an explicit authoring boundary: `/inline` `Static` owns terminal history and rejects effective visual Fullscreen, while common `ScrollBox` owns bounded application state and remains valid in either mode.

### Completed implementation status

Merged PR [#254](https://github.com/vuejs-ai/vue-tui/pull/254) established the normal visual Fullscreen backend described in [fullscreen-output.md](./fullscreen-output.md): Yoga, paint, cursor placement, and hit testing use the current terminal rows and columns with viewport origin `(0, 0)`. Runtime closure retains one fixed viewport and adds automatic absolute-row replacement after a valid baseline. Initial paint, dimension changes, continuation, `app.clear()`, uncertain physical output state, and coordinated stdout, stderr, or patched-console output clear, home, and repaint the complete viewport. The renderer hides the physical cursor before output and restores the selected semantic caret afterward. This Fullscreen policy is independent of `incrementalRendering`. Runtime closure also rejects `@vue-tui/runtime/inline` `Static` presence before its bytes or a new visual-Fullscreen frame, restoring any already acquired setup leases before the durable report. Direct process-stream writes still bypass the coordinator. F1.4 keeps screen-reader presentation on the main-screen transcript path, even when Fullscreen was requested.

F1 is complete; the lifecycle rows below are verified implementation evidence:

- The live mount uses optional `mode`, defaults omission to an Inline request, rejects old mode/interactivity/`debug` fields before mutation, and resolves one internal session. Deterministic and string hosts provide the same verified authority, F1.7 completed the lifecycle facts, and F1.8 exports the verified public [`useRenderSession()` projection](./render-session.md) and derived `useLayoutSize()`; immutable capabilities and nullable layout rows have one public meaning across every host.
- Visual Inline now exposes terminal rows as a maximum, bounds over-height Yoga layout without padding short trees, hard-clips geometry-safe text, and uses no framework-generated ED2/ED3/Home. It starts managed output on a fresh row, commits `/inline` Static and geometry-safe coordinated TTY output once, forgets an erased `app.clear()` baseline, abandons stale row bookkeeping after resize, and leaves returned raw streams plus session-external terminal control outside the guarantee. Its absolute physical terminal row intentionally remains unstable, so it does not acquire a stable physical origin or renderer-owned hit map; F5 element geometry remains relative to vue-tui's current managed render surface.
- F1.7 made mount, cleanup, suspension, continuation, clean exit, fatal error, and HMR one exception-safe exact-ownership lifecycle. Ordinary re-entrant teardown and settlement wait for the current acquisition or repaint; a non-returning process or signal exit restores synchronously without final user rendering or Vue lifecycle hooks. Supported non-Windows live hosts restore before stopping with `SIGSTOP`, refresh dimensions after `SIGCONT` when available, retain the last coherent dimensions when a fresh probe is temporarily unavailable, repaint the same resolved surface before reacquiring input, and roll a failed Fullscreen re-entry back to the suspended state. Clean final streams complete once, including natural event-loop drain; fatal final streams suppress stale successful output. Inline and transcript use stderr only when their rich error was clipped, lost with stdout, or failed during its first physical write, while Fullscreen restores before its durable stderr report. Returned raw streams remain an explicit direct-output bypass.
- `@vue-tui/testing` uses finite production-like axes, the production resolver, structured content frames, a separate xterm-emulated screen, deliberate resize/input controls, the modeled session, and deterministic disposal. Public and internal string rendering select fixed visual and screen-reader document presentations, isolate inert streams, expose truthful session facts internally, reject hidden host passthrough, and report unavailable app operations explicitly. F1.5 implementation and closure verification are complete.
- F5 publishes paint-derived geometry and focus-bound element-local caret placement. The semantic controller accepts a candidate only with the matching paint/output transaction, while standard and incremental writer baselines advance only after a successful stream write. Targetless `useCursor()` is removed; non-TTY, screen-reader, string, hidden, clipped, detached, and invalid requests emit no targeted cursor controls. Focused runtime, integration, relevant PTY, HMR, testing visibility, clean-consumer, both-mode visual, full-repository, fresh-CI, and independent-review gates pass.
- Full-screen targeted mouse can take terminal-native selection away from the user. F8 implements one top-level-Text semantic selection model and a separate common clipboard service; package, HMR, PTY, image-observed visual, native custom-clipboard, restoration, repository, CI, and independent-review closure evidence passes on the current branch.

### Closure and downstream work

The accepted finite current-versus-target answers, F1.2 mount contract, Inline-overflow PTY comparison, and completed lifecycle behavior are tracked in [rendering-mode-matrix.md](./rendering-mode-matrix.md). The no-clear Inline invariant, application-side escape-hatch requirement, and experimental API-stability policy are vouched. F1.3 selected the unstamped readonly [`useRenderSession()` contract](./render-session.md), F1.4–F1.7 completed its private authority and behavior, and F1.8 published and verified its public projection and repository migration.

F1 closure answered its three implementation questions: value and type guards expose no mutable service or second truth source; source, docs, examples, packed declarations, and repository consumers contain no supported superseded-hook path; and every public/type, repository, PTY, visual, restoration, package, clean-consumer, checkpoint-CI, and independent-review gate passed. F2 through F8 and Runtime closure then completed the remaining shared primitives and capability-dependent boundaries.

Future editor, overlay, viewport, or high-level component APIs must preserve this completed matrix so the same application cannot accidentally depend on a Fullscreen assumption while running Inline.

## Second design packet: focus and input inside the rendering-mode contract

The earlier F4 experiment in [logical focus and focus scopes](./focus-and-scopes.md) remains implementation and journey evidence, but its public manager, scopes, traversal, restoration, focused-input hooks, and external route are superseded. The authoritative contract is the vouched [`useFocus` review](./runtime-public-api-review.md#usefocus), and its narrower implementation is complete.

```ts
export type FocusTarget = Readonly<Ref<ComponentPublicInstance | null | undefined>>;

export interface UseFocusReturn {
  readonly isFocused: Readonly<Ref<boolean>>;
  focus(): void;
  blur(): void;
}

export function useFocus(): UseFocusReturn;
export function useFocus(target: FocusTarget): UseFocusReturn;
```

Every call creates a distinct opaque identity in one private per-app controller. A valid `focus()` synchronously replaces the previous owner, and `blur()` releases only that handle. The targetless overload follows its Vue scope; the targeted overload additionally follows the current-app stateful component's normalized root boundary. Unavailable, disposed, and string-rendering calls are inert without queued acquisition. Target loss, hidden ancestry, scope disposal, rollback, and cleanup clear ownership without restoring that handle or a previous one; suspend and resume preserve a still-valid owner.

The target is not the identity and does not define delivery. Runtime does not expose disabled state, automatic focus, Tab order, traversal, scopes, modal policy, a manager, string lookup, restoration, geometry, or focused-input routing. Applications and higher layers compose those policies with Vue state. Explicit focused delivery uses the accepted broadcast primitive:

```ts
const focus = useFocus(target);

useInput(handler, {
  isActive: focus.isFocused,
});
```

This split leaves three clear owners:

1. **Runtime unique ownership:** one current identity across targeted and targetless handles in one app.
2. **Runtime rendered validity:** a targeted identity cannot remain focused after its normalized component boundary becomes unavailable or hidden.
3. **Application interaction policy:** ordering, scopes, traps, disabled state, names, restoration, priority, propagation, external forwarding, and visual treatment.

The implementation evidence must prove the two overloads, readonly declarations, valid replacement, no queued acquisition or restoration, component-root normalization, Vue 3.4 and 3.5 consumers, Inline, Fullscreen, non-TTY, string, suspension, cleanup, rollback, and composition with both gated and unrelated `useInput()` subscriptions. Until those checks land, the accepted design must not be described as implemented.

## Reference regression journeys for the completed foundations

Use the smallest set of applications that exercises the shared contract when a change could regress F3 through F8 or Runtime closure:

1. **Workflow:** a coding-agent composer streams output, accepts Unicode editing and paste, explicitly transfers ownership to an approval overlay, supports submit/cancel/interrupt, and deliberately reacquires focus when the product wants it; caret behavior remains separate.
2. **Finder:** a selector owns query text, stable item keys, disabled items, navigation, ensure-visible scrolling, accept and cancel; its search algorithm and domain records remain application-supplied.
3. **Monitor/environment:** a monitoring app supports a non-interactive or static frame and a full-screen live dashboard without try/catch capability detection or hidden process-global assumptions.
4. **Workbench:** two independently active regions plus an overlay prove that application-owned ordering, scopes, and shortcuts can compose over unique Runtime focus handles without a public manager.
5. **Terminal workspace stress:** a focused pane can pass unhandled keys to an external terminal session without making PTY or VT emulation a framework responsibility.

The earlier F4 validation remains useful scenario evidence, but the accepted Runtime checks are narrower: unique ownership, explicit replacement and release, target invalidation without restoration, lifecycle cleanup, and `useInput(handler, { isActive: focus.isFocused })` composition. Commands, collection movement, modal isolation, traversal, restoration, and external fallthrough are higher-layer responsibilities.

## Completed work order

The completed dependency order, at-most-one-active-item rule, and closure evidence are maintained in [the API foundation roadmap](./api-foundation-roadmap.md#priority-order). No foundation is currently Active or Queued, and R13 is not an automatic successor.

The historical program order was rendering-mode session facts → rendered-target lifetime → normalized input and routing → the broader logical-focus experiment → semantic geometry and caret → Fullscreen targeted pointer → evidence-driven scroll composition → Fullscreen selection and copy → finite Runtime closure. The later item-by-item review and delegated bounded pass supersede those experimental public surfaces; application and component work may rely only on Yunfei's judgments in the decision ledger and the implemented surface in the current API contract.

## Review template for each proposed API

Every proposal should state:

- the representative user journey and observable problem;
- the relevant systems in [terminal UI prior art](./terminal-ui-prior-art.md), where their terminal ownership and runtime constraints match or differ, and which load-bearing behavior was reverified;
- application-owned state, framework-owned mechanics, and controlled state;
- events, semantic operations, cleanup and error behavior;
- requested/effective/capability behavior across inline, full-screen, non-TTY, static render, screen-reader mode, testing and HMR;
- template and TSX examples with inferred public types;
- the explicit retention, replacement, or removal of affected current APIs, without assuming that current releases constrain the target;
- focused logic tests, type tests, component interaction tests, and real-PTY evidence where terminal state is involved;
- which other scenario proves the abstraction is not one application's business model.

## Prior-art constraints

- The cross-framework evidence ledger, comparison vocabulary, and required decision check live in [terminal-ui-prior-art.md](./terminal-ui-prior-art.md). A peer establishes a mechanism or tradeoff in its own constraints; it does not choose vue-tui's Vue API, package path, product default, or component catalog.
- Vue's [custom renderer contract](https://github.com/vuejs/core/blob/c0606e91798c8dca4f33d101e1dd836d672592c1/packages/runtime-core/src/renderer.ts#L96-L155) keeps host operations narrow, while [hierarchical provide/inject](https://github.com/vuejs/core/blob/c0606e91798c8dca4f33d101e1dd836d672592c1/packages/runtime-core/src/apiInject.ts#L8-L74) is a natural mechanism for app and subtree services.
- Ink v7.0.4's [`useInput` subscription](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-input.ts#L126-L174) and [flat focus hook](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-focus.ts#L5-L82) explain vue-tui's pre-F4 baseline and also its limit for nested applications. Its run-verified non-TTY default and explicit live-update override are recorded as a deliberate alignment in [ink-divergences.md](./ink-divergences.md#non-tty-output-defaults-to-a-final-stream-while-explicit-live-updates-remain-possible). This matches the repository's canonical Ink snapshot; Ink parity is not the API objective.
- OpenTUI's [key event contract](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/lib/KeyHandler.ts#L5-L62) demonstrates handled and propagation semantics. Its framework-neutral core and broad exports are not a reason to migrate or copy its public structure.
- Textual's [focused-widget and app binding route](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/docs/guide/input.md#L118-L185) demonstrates why focus, app shortcuts and inspectable bindings belong in one model. Its Python inheritance, string actions and full message system are not proposed for vue-tui.

## Explicit non-decisions

This record does not decide to:

- publish a `useTerminal`, command, editor, list, overlay, or cell-surface API under any particular name; the accepted minimal `useFocus()` handle and current input contract are the explicit interaction primitives recorded in the [Runtime public API review](./runtime-public-api-review.md#usefocus) and [decision ledger](./runtime-public-api-decisions.md);
- add compatibility aliases for the directly replaced mount, targeted-listener, drag, input, focus, or raw-mouse APIs; the accepted F1 through F8 surfaces replace them cleanly under the experimental policy;
- build a Table, TextInput, Dialog, Tree, Command Palette, TaskList or other catalog item merely because another framework has one;
- create `@vue-tui/use` before an accepted independent behavior requires it;
- make all web Vue directives or DOM event semantics work unchanged in a terminal;
- add a blanket component accessibility requirement or change the runtime's existing accessibility contract;
- make either rendering mode the sole or feature-reduced product mode; both remain first-class, and the accepted Inline omission default does not establish a product hierarchy;
- introduce a router, generic message bus, framework-neutral renderer API, or application-domain state machine;
- reopen renderer optimization, virtualization or native-core work without the triggers in [performance.md](./performance.md#when-to-reopen-this-work).
