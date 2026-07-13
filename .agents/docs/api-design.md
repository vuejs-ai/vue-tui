# Application API design

> **Status:** unstamped proposed design program. This record identifies the next product-design layer, the evidence it must satisfy, and the order of work. It records the accepted one-`createApp`, optional-`mode`, default-Inline mount model, the component/composable boundary, the completed F1 readonly render-session foundation, the completed private F2 rendered-target lifetime, the completed F3 normalized public input and routing contract, and the accepted F4 target contract. F4 logical focus and focus scopes is Active in public implementation. The completed implementations and accepted contracts are not VOUCHED stamps; pointer names and signatures, F5 geometry details, target disposition of current pointer APIs, component catalog, and the 1.0 surface remain unselected.

## Current conclusion

API design is the next product-design phase for vue-tui. Positioning explains what the framework is, application scenarios provide product evidence, and renderer-performance work is parked until measurement justifies it. The remaining question is the contract a Vue application can depend on without rebuilding terminal interaction mechanics itself.

Do not begin by listing components or specifying every future prop. Start with capability boundaries and state ownership, validate them through representative journeys, and only then stabilize composables and components. API design and journey implementation should alternate: abstract design supplies a coherent model, while real applications prevent the model from becoming speculative.

The first concrete design topic is the **rendering-mode contract**: which terminal surface the application owns in inline and full-screen modes, which regions remain addressable, where completed output lives, and which capabilities each mode can honestly provide. Input, focus, geometry, scrolling, overlays, and components must be designed inside that contract rather than assuming a permanently addressable screen.

F1.3 selected [`useRenderSession()`](./render-session.md) as the readonly reactive projection of that contract and `useLayoutSize()` as its focused responsive-layout projection. The session preserves requested and effective mode in one finite resolution value, describes output destination, dynamic updates, and presentation separately, distinguishes terminal size from the effective layout bound, and exposes semantic availability without leaking a mutable renderer. F1.4 completed the internal live source, F1.5 completed the same authority for finite deterministic hosts and both fixed string presentations, F1.6 made the accepted Inline row bound and history ownership true, F1.7 completed exact lifecycle ownership, suspension/continuation, and clean/fatal exit behavior, and F1.8 published the two verified public composables while removing their superseded hooks.

F2 now has one internal [rendered-target lifetime](./rendered-target-lifetime.md): a registration follows the resolved host below a Vue ref, reconciles stable component proxies on renderer commits, invalidates synchronously on host removal, and releases on scope, app, string-host, and HMR teardown. `useDraggable()` and `useBoxMetrics()` are the two evidence adapters; no generic target composable or renderer node became public. This closes a prerequisite mechanism without selecting the F3 input model, F4 focus behavior, F5 semantic target type, or F6 pointer surface.

Interaction ownership follows as the second topic. It must distinguish two independent questions: how one effective logical focus target is maintained, and how app, overlay, region, focused-control, and external-target handlers take priority or pass an event onward. These are cooperating parts of one input model, not three competing choices called targeted events, scoped commands, and a hybrid.

The ordered implementation status and definition of done for these foundations live in [api-foundation-roadmap.md](./api-foundation-roadmap.md). That ledger is the canonical answer to what is active, queued, parked, or already shipped; this record remains the canonical design rationale.

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

The common authoring surface contains Vue components and composables whose semantics do not depend on whole-screen ownership: passive layout and text primitives, shared logical input and focus foundations, and a bounded, input-free `ScrollBox`. A component should not inspect global mode and quietly change meaning. An operation that requires stable physical coordinates, a hit map, alternate-screen ownership, or terminal-wide capture belongs behind an explicit terminal-integration boundary and may reject an unavailable surface immediately. The current candidate is a ref-bound full-screen composable, not a parallel catalog of `PointerBox`, `PointerScrollBox`, and other visual variants. An inline-specific subpath remains possible if a future capability genuinely depends on main-screen history.

Two current APIs are deliberately not promoted into the final picture merely because they shipped. `<Static>` has honest terminal-history semantics inline but cannot provide the same persistence full-screen, so its eventual common or inline-specific placement remains open. Terminal-wide raw mouse input remains conceptually different from element-targeted pointer delivery, but the current `useMouseInput` name, event subset, and root export have no backward-compatibility protection during experimentation.

## Current mode, pointer, and scrolling boundary

This section records the design boundaries that are stable enough to carry forward after the source audit, concrete examples, and the cross-framework evidence in [terminal-ui-prior-art.md](./terminal-ui-prior-art.md). It remains unstamped: the mount shape is accepted, while example pointer names, signatures, target-ref type, event map, and target disposition of current pointer APIs are not yet accepted.

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

The common `Box`, `Text`, and `ScrollBox` APIs must not advertise targeted pointer listeners. Their template and TSX types should explicitly reject `onClick`, `onWheel`, `onMousedown`, and `onMouseup`; simply omitting these props does not defeat Vue listener fallthrough. JavaScript and `any` must not be able to turn a common node into a target merely by passing one of those listeners at runtime.

Do not add `PointerBox`, `PointerScrollBox`, or a component variant for every visual-component and interaction combination. Targeted pointer is behavior attached to an existing rendered element, so the current API shape to validate is a ref-bound composable from a proposed full-screen entry point:

```vue
<script setup lang="ts">
import { useTemplateRef } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import { usePointerEvent } from "@vue-tui/runtime/fullscreen";

const target = useTemplateRef("target");

usePointerEvent(target, "click", open);
</script>

<template>
  <Box ref="target">
    <Text>Open</Text>
  </Box>
</template>
```

`usePointerEvent` is a working name, not an accepted export. One keyed primitive avoids separate `useClick` and `useWheel` APIs while still allowing event-specific type inference. Dragging is a higher-level gesture/composable concern built on the same target-registration, capture, parser, and teardown mechanism; whether the existing `useDraggable` name, signature, and export survive remains open.

The composable marks the current referenced host element as a hit-test target for exactly the ref's rendered lifetime. It registers when the ref becomes non-null, unregisters when `v-if` removes the node, moves when the ref points elsewhere, and releases everything on scope disposal. Setup lifetime alone is insufficient: a handler must not survive after its rendered target disappears.

Only elements explicitly enrolled by a full-screen pointer composable participate as public event targets; ordinary `Box` and `Text` nodes remain passive. The exact target-selection, bubbling, `currentTarget`, offset-rebasing, and propagation contract remains candidate mechanics to validate rather than a settled conclusion from this discussion.

### Full-screen targeted input is an explicit capability boundary

Targeted delivery requires both decoded terminal mouse input and a reliable physical origin plus hit map. The fixed normal full-screen viewport can provide both. Current Inline can receive terminal coordinates but cannot reliably map them to elements, so a live Inline use of a full-screen targeted composable must fail immediately with the missing mode/capability instead of leaving a dead handler.

The target entry point to validate is therefore `@vue-tui/runtime/fullscreen`, not a speculative `/pointer` path. That subpath does not exist yet and requires an export, build wiring, API guards, type tests, and lifecycle tests before it can become public. If a future bounded Inline renderer proves reliable targeted input, vue-tui can add a broader re-export while retaining the honest full-screen path. Final-stream, non-TTY, and static hosts must not emit targeted mouse control sequences, and the screen-reader path must not claim a hit map it does not build; whether the composable is an observable no-op or reports an unavailable capability there remains open.

Do not expose a separate public concept called mouse authorization or require ordinary full-screen applications to repeat `mouse: true`. When at least one full-screen targeted composable has a live target, the runtime acquires the minimum required reporting level; it downgrades as stronger consumers disappear and restores terminal modes after the last target. Common components never acquire mouse reporting in either mode. If vue-tui retains a terminal-wide raw-mouse API, calling that API is itself the explicit capture request; its exact name, event shape, and export path remain open.

Mouse reporting still changes terminal-native selection even on the alternate screen. Full-screen makes application-owned scrolling and selection a reasonable product responsibility; it does not erase the mechanism's side effect. Do not add a mount-level mouse override until a real application needs one, and treat application-owned selection and copy as a separate future capability rather than hiding it inside pointer registration.

### `ScrollBox` stays common and input-free

`ScrollBox` owns clipping, sticky-bottom state, and semantic scrolling operations without inspecting mode or acquiring terminal input. It works whenever its parent gives it a bounded height, including a bounded region inside an inline application. A terminal-owned transcript is a different history model and currently uses `Static` rather than an unbounded `ScrollBox`; the target history API remains open.

Its public type should reject targeted pointer listeners, and its SFC must not let unknown listeners fall through accidentally to the internal viewport `Box`. Full-screen wheel behavior composes by binding the candidate pointer composable to an existing target and calling the `ScrollBox` handle; no pointer-specific `ScrollBox` component is needed.

A candidate refinement is for `scrollByLines`, `scrollToLine`, `scrollToTop`, and `scrollToBottom` to report whether the position changed. A nested wheel handler can then stop propagation only when the inner viewport actually moved; at an edge, the event can continue to an outer scroll owner. This return-type change is a proposal, not an accepted API. Keyboard policy remains outside `ScrollBox` until focused input routing exists.

### Terminal-wide raw mouse remains a separate capability

The current public `useMouseInput` handler receives only vertical wheel events with 1-based absolute coordinates. The shared internal parser decodes button down, button up, drag, and all four wheel directions, while targeted dispatch synthesizes `click` from a matching down/up pair. The hook has no target ref, hit test, bubbling, or relationship to `ScrollBox`.

Keep terminal-wide raw mouse conceptually distinct from element-targeted pointer delivery: raw coordinates do not become inline component clicks, and acquiring raw mouse still takes native terminal selection and wheel behavior away from the user. The experimental policy does not protect the current root export, vertical-wheel-only event subset, 1-based coordinates, or `useMouseInput` name. A representative journey must decide whether to retain, replace, or remove that API and must validate any complete terminal-level stream as its own contract.

### Mouse reporting rules

The target terminal controller must keep reference-counted ownership and request only the strongest currently needed protocol:

- click, down, up, and wheel require button reporting (`1000 + 1006`);
- drag requires button-motion reporting (`1002 + 1006`);
- future hover requires all-motion reporting (`1003 + 1006`);
- simultaneous consumers select the highest active level and downgrade when the stronger consumer unmounts;
- the final release and every normal, error, signal, suspend, and HMR teardown release exactly the level and SGR coordinates this controller acquired, including acquired levels no longer represented by a live request.

The current targeted controller already shares reference-counted ownership but requests drag reporting for every handler. F1.7 made its suspension and every teardown path exact-ownership and failure-tolerant: it temporarily releases the acquired level, reacquires the strongest still-live request after continuation, and does not disable modes it never owned. Minimum-level acquisition and downgrade remain requirements for the future composable implementation rather than claims about the current event-registration policy.

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

| Application responsibility                                                                | Framework responsibility                                                                             | Controlled boundary                                                                           |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Messages, tool calls, metrics, Git or database entities, workspace and PTY-session models | Terminal input parsing, mode ownership and restoration, output coordination                          | Current value, query, active key, selected or expanded keys, open state                       |
| Search ranking, alert thresholds, approval policy, command execution, domain validation   | Input routing, focus order and scopes, modal input isolation, focus and cursor restoration           | Application supplies state and policy; framework supplies generic mechanics and emits changes |
| Model requests, polling, filesystem and process side effects, PTY lifecycle               | Text-editing mechanics, collection navigation, scroll coordination, generic pending/cancel mechanics | Application decides what submit, accept, cancel, or retry means                               |
| Product layout, fields, visual hierarchy, and domain-specific labels                      | Renderer primitives, geometry, clipping, targeted events, lifecycle cleanup                          | Components compose primitives without acquiring domain data or side effects                   |

This boundary does not imply one large framework state machine. It says generic mechanics should not be rewritten in every application, while domain models and side effects should not enter vue-tui.

### Be Vue-native at the public boundary

- Use component mount and unmount, effect scopes, and `provide`/`inject` to create and clean up app and subtree services.
- Prefer props, typed emits, `v-model`, slots, readonly refs, and semantic template-ref methods over React-shaped hooks or renderer handles.
- Support both templates and TSX and prove their types with `vue-tsc` and `tsc`.
- Treat idiomatic Vue behavior such as `v-show` as a platform-contract question with terminal semantics, not as an arbitrary DOM feature request.
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

| Layer                   | Responsibility                                                                                                                           | Stability rule                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Vue platform contract   | Which Vue authoring and lifecycle behavior has terminal meaning                                                                          | Supported behavior is tested in templates and TSX; unsupported behavior is documented or rejected clearly            |
| Runtime primitives      | Layout, text, clipping, measurement, hit testing, cursor and renderer-native surfaces                                                    | Small semantic surface; no Yoga, host-tree, cell-buffer, or ANSI implementation leakage                              |
| App runtime services    | Session lifecycle, effective rendering mode, capabilities, input parsing and routing, focus scopes, terminal modes, scheduling and flush | One service set per mounted app, provided through typed Vue injection and exposed through focused public composables |
| `@vue-tui/use`          | Independent headless behavior with no component or direct terminal dependency                                                            | Create the reserved package only when the first evidence-backed member is accepted                                   |
| `@vue-tui/components`   | Rendered, typed Vue components and component-specific companion composables                                                              | Compose only public runtime/use APIs; use controlled-state conventions and semantic handles                          |
| Testing and development | Deterministic semantic input, lifecycle, frames, PTY-visible acceptance, HMR and clean-consumer workflows                                | Test APIs track public behavior and distinguish content frames from final emulated terminal screens                  |

These are responsibility layers, not a requirement to split the renderer into framework-neutral packages. vue-tui is intentionally Vue-native.

## Evidence from the current API

### Application-global and focused input share one route

[`useInput`](../../packages/runtime/src/composables/useInput.ts) attaches one non-reusable application-global registration and receives a cached readonly projection of the shared normalized key, text, paste, or uninterpreted fact. Every global captured for one fact runs in registration order, and its required result separately reports an action, later-route continuation, delayed-default prevention, and external permission. F4 now connects opaque ref-bound targets and nested scopes to the same route: `useFocusedInput()` supplies the exact owner layer, `useFocusScopeInput()` supplies the active boundary or one ancestor layer, and `useExternalInput()` supplies one normalized fallthrough receiver. F3 still captures the atomic generation at fact start and resolves it once under both modes.

Application-global shortcuts remain independent, while local ownership now follows the target or scope lifetime instead of requiring a manual `useInput({ isActive })` bridge. [Issue #250](https://github.com/vuejs-ai/vue-tui/issues/250) remains the direct consumer evidence that selected local behavior must follow rendered and logical ownership rather than setup-time global registrations.

The normalized `TuiInputEvent` now exposes function-key identity, Insert, modifiers, reported text, and repeat or release phase without the removed boolean `Key` projection. F4 can reuse that event model directly instead of defining a focus-specific key shape.

### Focus, element geometry, and the terminal cursor are disconnected

Current focus is a flat registration list keyed by string IDs. It has no nested scope, trap, restoration stack, tree-derived order, relationship to a rendered element, or click-to-focus contract.

[`useCursor`](../../packages/runtime/src/composables/useCursor.ts) accepts output-origin coordinates. [`useBoxMetrics`](../../packages/runtime/src/composables/useBoxMetrics.ts) exposes parent-relative geometry, while `measureElement` accepts `unknown` and returns only width and height. [`useDraggable`](../../packages/runtime/src/composables/useDraggable.ts) uses a `ComponentPublicInstance` target, and mouse events expose another absolute rectangle shape. A reusable editor cannot yet derive a stable element rectangle and real caret position through one semantic element contract.

Logical focus, collection active item, text insertion point, selection, and terminal cursor must remain distinct concepts even when a component coordinates all of them.

### Modes exist without a public environment contract

[`MountOptions`](../../packages/runtime/src/render.ts) contains rendering-mode and lifecycle choices beside lower-level renderer and scheduler controls. [`useApp`](../../packages/runtime/src/composables/useApp.ts) exposes exit and flush but not effective Inline/Fullscreen mode, output cadence, or terminal capability. The internal session resolves those facts once across live, deterministic-test, and string hosts, and F1.8's verified `useRenderSession()` gives a pure component the readonly public projection.

[`renderToString`](../../packages/runtime/src/render-to-string.ts) provides a truthful string/document session, isolated inert terminal streams, no-op focus/input/animation mechanics, and explicitly unavailable app lifecycle operations. Public rendering is fixed visual; the internal helper is fixed screen-reader; neither reads process terminal state. Components in either string path now read that same public projection, with `layout.rows: null` and immutable unavailable capabilities.

### Headless behaviors are repeatedly hand-written

The first-party [coding-agent example](../../examples/coding-agent/src/app.vue) combines the agent state machine, global key routing, append/backspace editing, approval handling, and a painted `█` cursor in one component. The agent model belongs to the application; editing, input ownership, paste, caret and focus mechanics are reusable framework concerns.

The pinned external [mo selector](https://github.com/liangmiQwQ/mo/blob/6bea467a6995f4912e809b417b5c56a3964cc556/src/components/selector.vue#L48-L124) independently implements query editing, enabled-item navigation, selection, accept/cancel and scroll calculations, while its [completion path](https://github.com/liangmiQwQ/mo/blob/6bea467a6995f4912e809b417b5c56a3964cc556/src/utils/selector.ts#L44-L59) waits an arbitrary 50 ms before unmounting instead of using the existing [`waitUntilRenderFlush()`](../../packages/runtime/src/composables/useApp.ts) contract. Search ranking and project data stay in mo; generic editing, collection movement and acceptance are product evidence for vue-tui. The timeout is evidence to validate the discoverability and sufficiency of the existing flush contract, not to add a second completion primitive.

[`ScrollBox`](../../packages/components/src/scroll-box/scroll-box.vue) correctly owns a bounded viewport and follow-latest mechanism without choosing application keys. Its record also shows why higher-level composition is blocked: global keyboard input collides with focused editing until routing exists.

### The modeled testing host exists; whole-package stability remains incomplete

The exact runtime value exports are guarded, and F1.5 adds focused public-type and removed-option guards for `@vue-tui/testing`, but public types remain selectively checked and `components`, `testing`, and `vite` do not share one exhaustive whole-package policy. F1.8 adds named public render-session and layout-size types while removing the former anonymous `useWindowSize()` return; several unrelated composables still return anonymous structures.

`@vue-tui/testing` directly models Inline or Fullscreen requests, visual or screen-reader presentation, live or teardown update cadence, TTY or stream output, TTY or non-TTY input, and deliberate dimensions. `RenderResult` exposes the same component-visible session, structured `{ dynamic, staticOutput }` frames, a separate xterm-emulated screen with active buffer, viewport, scrollback, cursor, resize, and deterministic `suspend()`/`resume()` controls, plus idempotent disposal. `unmount()` retains the restored screen for assertions; `dispose()` and automatic cleanup release every host resource, after which emulator, resize, suspension, continuation, input, and flush operations fail clearly while `lastFrame()`, frames, and session facts remain inspectable. Removed renderer booleans fail before setup, terminal output never has to be reverse-engineered into frames, and console patching is disabled. F1.8 now verifies that this same session is reachable through the public component hook and that continuation refreshes row-unbounded live streams as well as terminal surfaces.

## Capability model derived from the scenarios

| Capability                | Conversational application                            | Monitor or task runner                     | Data workbench                              | Terminal-workspace stress              | Likely layer                                         |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| App/session environment   | inline transcript or full-screen conversation         | non-TTY snapshot and full-screen dashboard | persistent multi-region app                 | full-screen shell around PTYs          | runtime service                                      |
| Input ownership           | composer, approval, interrupt                         | global shortcut and focused filter/action  | search, list, detail and overlay routes     | command scope or PTY fallthrough       | runtime service                                      |
| Focus and scopes          | composer to approval and back                         | region or control focus                    | collection, preview, actions and modal      | nested pane focus and restoration      | runtime service                                      |
| Text editing              | prompt, history, multiline, paste                     | filter or action parameter                 | search, rename and forms                    | search/rename outside the PTY          | headless behavior plus component                     |
| Collection behavior       | history and action choices                            | process/job/log lists                      | list, tree, table and preview               | workspace/tab/pane navigator           | headless behavior plus components                    |
| Viewport and scroll       | native inline scrollback or full-screen follow-latest | logs and follow/pause                      | keep active item visible and scroll preview | tab overflow and pane scrollback       | runtime geometry plus headless/component state       |
| Overlay                   | approval and confirmation                             | destructive action or details              | dialog, menu and command palette            | modal, prefix help and settings        | focus/input runtime plus component                   |
| Screen-reader environment | existing linearized runtime output                    | existing linearized runtime output         | existing linearized runtime output          | surrounding vue-tui shell only         | existing runtime accessibility contract              |
| External cell surface     | not normally needed                                   | optional specialized visualization         | optional renderer-native view               | emulated terminal pane with dirty rows | future runtime primitive only with consumer evidence |

The terminal-workspace case is a pressure test. PTY bytes, prefix commands and pane-tree business state do not enter core, but the public interaction model must allow an inner owner to handle an event or deliberately return it to an outer scope or external terminal session.

## First design packet: rendering-mode contract

The vouched product decision defines the two modes but does not yet define their complete application contract. Here, an **addressable region** means terminal cells whose current position the runtime can reliably identify and rewrite later.

### Keep rendering mode and independent runtime facts separate

- **Rendering mode** is the requested and effective surface model: inline on the main screen or full-screen on the alternate screen.
- **Render host** says whether the component has a live-session contract or is rendered to a static string. A deterministic harness presents modeled live facts to the component and keeps its test-only identity on `RenderResult`, so application behavior cannot diverge merely because it is under test.
- **Resolver inputs** are independent and can combine: stdin and stdout TTY state, requested live-update policy, selected screen-reader presentation, dimensions, and protocol results. They remain separate inside the runtime so one coarse boolean cannot silently decide unrelated behavior; the internal render observer is not a resolver input.
- **Public runtime facts** describe the semantic result application code can adapt to: mode resolution, output destination/dynamic-update/presentation, terminal and layout dimensions, and selected structural capabilities. Raw TTY and protocol inputs are not automatically public merely because the resolver needs them.
- **Capability** is a semantic guarantee an API can rely on after those inputs combine, such as a stable viewport origin, renderer-owned element hit testing, or coordinated suspension support. F3 owns the first public input-availability contract.

`mode: "fullscreen"` becomes effective Fullscreen only with live output updates, visual presentation, a TTY stdout, and usable terminal dimensions. The runtime preserves requested mode, effective mode, each resolver input, and derived capabilities separately; the selected public projection exposes only the semantic results that application code needs. A component must not infer capabilities from the requested mount value, raw streams, or one coarse environment enum.

### Proposed mode invariants

The following table is the desired public contract to evaluate, not a claim that the current writer already satisfies every row. It derives the API constraints from the two vouched terminal models; implementation gaps are listed immediately afterward.

| Assumption                   | Inline: `mode: "inline"`                                                                                                                                                                                                                | Full-screen: `mode: "fullscreen"`                                                                                                                                                                     | API consequence                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal surface ownership   | The app shares the main screen with preceding shell output and owns only its current live render region.                                                                                                                                | The app owns the alternate-screen viewport until teardown.                                                                                                                                            | An API must not promise whole-screen effects in inline mode.                                                                                            |
| Completed output and history | Completed output committed through the current `Static` mechanism can become terminal-owned scrollback and is no longer an editable app surface; the target history API remains open.                                                   | The alternate screen has no durable shell history; searchable or navigable history must remain in an app-owned model and be projected into the viewport.                                              | Transcript history and viewport scrolling cannot be represented by one hidden offset with identical meaning.                                            |
| Coordinates                  | The live frame is updated relative to its prior position; its absolute top row is not stably known, especially after `Static` output or external writes.                                                                                | The target contract preserves a viewport origin at `(0, 0)` while the app is mounted.                                                                                                                 | Shared geometry should be element- or region-relative; absolute hit testing is a capability, not a universal primitive.                                 |
| Redraw and visual overlays   | The runtime can redraw its managed live region but cannot cover and later restore arbitrary rows already in scrollback. A visual overlay must fit inside that live region.                                                              | The runtime can repaint the current viewport, so a visual overlay can cover and restore app content.                                                                                                  | Modal input and focus behavior can be shared, while visual overlay placement and guarantees remain mode-specific.                                       |
| Scrolling                    | Native terminal scrollback is the natural history surface; bounded app scrolling is possible only inside space the live region currently owns.                                                                                          | The application must provide scrolling for content larger than the viewport, for example through a bounded `ScrollBox`.                                                                               | Components must state whether they operate on native history, an app-owned viewport, or either with different behavior.                                 |
| Resize                       | The current live region can relayout and repaint, but the app cannot retroactively rewrite completed terminal history.                                                                                                                  | The target contract relayouts and repaints the full current viewport.                                                                                                                                 | Resize contracts must say which state is recomputed and must not imply that inline history is still mounted or editable.                                |
| Mouse and selection          | A terminal-wide raw-mouse API can receive absolute coordinates when the terminal and stdin support it, but the runtime cannot reliably map them to inline elements; tracking also suppresses native selection across the shared screen. | A live full-screen target composable can request targeted hit testing when stdin, the terminal, and the active render path support a hit map; the runtime captures only while a live target needs it. | Terminal-wide raw mouse and semantic element events are distinct capabilities. Targeted input remains full-screen-only unless the origin model changes. |
| Cursor placement             | Cursor coordinates are relative to the current output origin, whose absolute screen row can move.                                                                                                                                       | The target contract lets a managed caret resolve through a stable viewport origin.                                                                                                                    | A reusable editor should request a caret relative to a semantic element or managed region instead of computing physical screen cells itself.            |
| Input and logical focus      | Rendering mode alone says nothing about stdin or raw-mode ownership. When live input is effective, inline uses the shared interaction model.                                                                                            | Rendering mode alone says nothing about stdin or raw-mode ownership. When live input is effective, full-screen uses the same interaction model.                                                       | Logical focus, keyboard routing, paste, and focus scopes can share one semantic model; input availability remains a separately derived capability.      |
| Exit and restoration         | Current output remains on the main screen and can remain in shell history after terminal modes and cursor state are restored.                                                                                                           | Leaving the alternate screen restores the previous main-screen contents; the app viewport disappears.                                                                                                 | Completion, suspension, final output, and teardown behavior must have explicit mode-specific contracts.                                                 |

These are product constraints. `Static` and `ScrollBox` are evidence for different history owners, not a rule that either primitive must be rejected when used in the other mode.

### Current implementation status and remaining gaps

Merged PR [#254](https://github.com/vuejs-ai/vue-tui/pull/254) establishes the normal visual full-screen backend described in [fullscreen-output.md](./fullscreen-output.md): Yoga, paint, cursor placement, and hit testing use the current terminal rows and columns with viewport origin `(0, 0)`; each commit clears, homes, clips, and repaints that viewport; coordinated `Static`, stdout, stderr, and patched-console output is followed by an origin-preserving repaint. Direct process-stream writes still bypass the coordinator. F1.4 now keeps screen-reader presentation on the main-screen transcript path, even when Fullscreen was requested. `incrementalRendering` is deliberately ignored on this correctness-first full-screen path for now.

F1 is complete; the lifecycle rows below are verified implementation evidence:

- The live mount uses optional `mode`, defaults omission to an Inline request, rejects old mode/interactivity/`debug` fields before mutation, and resolves one internal session. Deterministic and string hosts provide the same verified authority, F1.7 completed the lifecycle facts, and F1.8 exports the verified public [`useRenderSession()` projection](./render-session.md) and derived `useLayoutSize()`; immutable capabilities and nullable layout rows have one public meaning across every host.
- Visual Inline now exposes terminal rows as a maximum, bounds over-height Yoga layout without padding short trees, hard-clips geometry-safe text, and uses no framework-generated ED2/ED3/Home. It starts managed output on a fresh row, commits Static and geometry-safe coordinated TTY output once, forgets an erased `app.clear()` baseline, abandons stale row bookkeeping after resize, and leaves returned raw streams plus session-external terminal control outside the guarantee. Its absolute top row intentionally remains unstable, so it does not acquire hit testing or Fullscreen geometry.
- F1.7 made mount, cleanup, suspension, continuation, clean exit, fatal error, and HMR one exception-safe exact-ownership lifecycle. Ordinary re-entrant teardown and settlement wait for the current acquisition or repaint; a non-returning process or signal exit restores synchronously without final user rendering or Vue lifecycle hooks. Supported non-Windows live hosts restore before stopping with `SIGSTOP`, refresh dimensions after `SIGCONT` when available, retain the last coherent dimensions when a fresh probe is temporarily unavailable, repaint the same resolved surface before reacquiring input, and roll a failed Fullscreen re-entry back to the suspended state. Clean final streams complete once, including natural event-loop drain; fatal final streams suppress stale successful output. Inline and transcript use stderr only when their rich error was clipped, lost with stdout, or failed during its first physical write, while Fullscreen restores before its durable stderr report. Returned raw streams remain an explicit direct-output bypass.
- `@vue-tui/testing` uses finite production-like axes, the production resolver, structured content frames, a separate xterm-emulated screen, deliberate resize/input controls, the modeled session, and deterministic disposal. Public and internal string rendering select fixed visual and screen-reader document presentations, isolate inert streams, expose truthful session facts internally, reject hidden host passthrough, and report unavailable app operations explicitly. F1.5 implementation and closure verification are complete.
- Full-screen targeted mouse can take terminal-native selection away from the user, but vue-tui has no application-owned selection and copy model yet.

### Closure and downstream work

The accepted finite current-versus-target answers, F1.2 mount contract, Inline-overflow PTY comparison, and completed lifecycle behavior are tracked in [rendering-mode-matrix.md](./rendering-mode-matrix.md). The no-clear Inline invariant, application-side escape-hatch requirement, and experimental API-stability policy are vouched. F1.3 selected the unstamped readonly [`useRenderSession()` contract](./render-session.md), F1.4–F1.7 completed its private authority and behavior, and F1.8 published and verified its public projection and repository migration.

F1 closure answered its three implementation questions: value and type guards expose no mutable service or second truth source; source, docs, examples, packed declarations, and repository consumers contain no supported superseded-hook path; and every public/type, repository, PTY, visual, restoration, package, clean-consumer, fresh-CI, and independent-review gate passed. Later foundations still decide which primitives have genuinely shared semantics, which expose capability-dependent behavior, and which clearly support only one rendering mode.

Do not publish a mode-dependent editor, overlay, viewport, pointer, geometry, or high-level component API until this matrix is explicit enough that the same application cannot accidentally depend on a full-screen assumption while running inline.

## Second design packet: focus and input inside the rendering-mode contract

The complete F4 target contract is [logical focus and focus scopes](./focus-and-scopes.md). The maintainer accepted it on 2026-07-13 without adding a VOUCHED stamp. Its public runtime now implements opaque ref-bound handles, rendered-preorder traversal, active and hard-trapped scopes, centralized restoration, focused-target and scope handlers with a trapped scope occupying the active-boundary layer once, focus-bound external fallthrough, direct replacement of the prior focus surfaces, and removal of the generic Escape blur. Package, host, scenario, and terminal closure remain active; this section remains the broader dependency rationale.

The completed F3 mechanism and accepted [public input contract](./input-routing.md#accepted-public-input-contract) exposed a dependency boundary that the earlier questions did not resolve. Normalized readonly facts, synchronous handler outcomes, one all-run application-global layer, delayed defaults, input availability, and current-hook dispositions could be selected before focus. A complete public `global → boundary → focused owner → ancestors → defaults → external` attachment could not be selected until F4: publishing it earlier would have exposed the private atomic topology or required applications to compute the focused owner and ancestor path manually. That would recreate issue #250 and make F4 a second state owner.

The accepted boundary is therefore narrow. F3 publishes one normalized application-global layer and the handler/result types. Every global captured for one fact runs and the layer merges their results, so registration time is not hidden priority; numeric priority was explicitly rejected at this foundation. F4 selects the target-bound/local hook, one logical focus owner, ancestor derivation, modal boundary, restoration, and the public external-owner attachment using the same F3 result contract. This keeps implementation dependency order intact: F3 owns parsing and delivery semantics, while F4 owns which local rendered recipient becomes part of the route. The rejected exact low-level selection API and its costs remain in the decision record rather than hidden behind a role string or another `isActive` boolean.

Once the rendering-mode contract is explicit, input design can share what both modes actually have in common. The app runtime now maintains one effective logical-focus target, attaches it to rendered elements through F2, derives its active scope path, and supplies that owner to F3 without mode-specific focus semantics.

Focus ownership and keyboard priority are separate questions:

1. **Focused delivery:** a ref-bound opaque focus handle registers one rendered target, becomes the one effective focus owner, receives normalized events through `useFocusedInput`, and loses or restores focus under the accepted hidden, disabled, removal, and scope rules. `useFocusScopeInput` occupies either the current trapped boundary or one ancestor position exactly once.
2. **Priority and fallthrough:** after framework-owned terminal-protocol replies have been removed, how an active overlay, app-level shortcut, active region, focused control, component default, and optional external owner such as a PTY get a chance to handle or pass on the same input. Typed commands or inspectable key bindings may help this layer, but they are not an alternative focus system.

A candidate responsibility flow is:

```text
terminal bytes
  -> route replies for active terminal protocol and capability queries
  -> parse remaining bytes once into typed key / text / paste / mouse events
     or explicit uninterpreted input
  -> apply the active priority layers
  -> deliver focused input to the one effective logical-focus owner
  -> continue through explicitly defined outer or fallback handlers
  -> optionally hand an unhandled event to an external owner such as a PTY pane
```

The non-pointer portion of this flow is now the proved private F3 order. The accepted F3 public contract answers the first question, the application-global half of the second and sixth questions, and the input-availability half of the eighth question; the accepted F4 target contract answers the target/local parts, while implementation evidence must still make them ordinary authoring API:

1. How does a handler distinguish handled, continue routing, prevent a component default, and return input to an external owner?
2. Which registrations follow setup-scope lifetime, and which must follow the actual rendered node or `v-if` branch lifetime required by #250?
3. How are logical focus, active collection item, text insertion point, selection and terminal cursor kept separate and coordinated?
4. How do nested focus scopes trap focus, derive traversal order, skip hidden or disabled targets, and restore focus after unmount?
5. Are shortcuts expressed as normalized key events, typed commands and overridable bindings, or both? How can help or status UI inspect active bindings without stringly typed application actions?
6. How does F4's target-bound input attachment compose with the accepted application-global `useInput`, and what purpose, if any, remains for terminal-wide raw mouse input? Direct stdin is retained under the vouched raw escape-hatch contract in [normalized input and routing](./input-routing.md#direct-stdin-is-a-parallel-escape-hatch-not-fallthrough).
7. What semantic element or rectangle type lets focus, mouse, measurement, scrolling and a real terminal caret refer to the same rendered object without exposing a host node?
8. Which shared focus and input operations remain meaningful in static, non-interactive and screen-reader environments, and how does each ineffective operation report itself?

Do not call the accepted target-bound/local input or focus API complete until one implementation handles #250, a modal approval, a global app shortcut, two focusable regions, unmount restoration, both rendering modes, and optional PTY fallthrough without manual boolean coordination. This restriction does not require the application-global normalized fact and handler-result contract to expose the private selection graph before F4.

## Vertical validation journeys

Use the smallest set of applications that forces the shared contract:

1. **Workflow:** a coding-agent composer streams output, accepts Unicode editing and paste, transfers ownership to an approval overlay, supports submit/cancel/interrupt, restores focus and caret, and runs in both inline and full-screen modes.
2. **Finder:** a mo-like selector owns query text, stable item keys, disabled items, navigation, ensure-visible scrolling, accept and cancel; its search algorithm and domain records remain application-supplied.
3. **Monitor/environment:** a machud-like app supports a non-interactive or static frame and a full-screen live dashboard without try/catch capability detection or hidden process-global assumptions.
4. **Workbench:** two independently active regions plus an overlay prove scoped shortcuts, focus restoration and unhandled-event routing.
5. **Terminal workspace stress:** a focused pane can pass unhandled keys to an external terminal session without making PTY or VT emulation a framework responsibility.

The first implementation prototype should combine the workflow composer and finder selector. Together they test text editing, controlled state, focus, commands, collection movement, scrolling and completion. The prototype may remain internal until its behavior and TypeScript/template shape survive both journeys.

## Work order

The live dependency order, one-active-item rule, and completion evidence are maintained in [the API foundation roadmap](./api-foundation-roadmap.md#priority-order). Do not run a second numbered backlog here: it will drift from implementation state.

The durable program order remains rendering-mode session facts → rendered-target lifetime → normalized input and routing → logical focus and focus scopes → semantic geometry and caret → full-screen targeted pointer → evidence-driven scroll composition → full-screen selection and copy. Representative workflow, finder, monitor, and workbench journeys validate each foundation as it lands. Component APIs follow the foundations they consume; testing, explicit failure behavior, and real-terminal evidence ship with each item rather than as a final phase.

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
- Ink v7.0.4's [`useInput` subscription](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-input.ts#L126-L174) and [flat focus hook](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-focus.ts#L5-L82) explain vue-tui's current baseline and also its limit for nested applications. Its run-verified non-TTY default and explicit live-update override are recorded as a deliberate alignment in [ink-divergences.md](./ink-divergences.md#non-tty-output-defaults-to-a-final-stream-while-explicit-live-updates-remain-possible). This matches the repository's canonical Ink snapshot; Ink parity is not the API objective.
- OpenTUI's [key event contract](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/lib/KeyHandler.ts#L5-L62) demonstrates handled and propagation semantics. Its framework-neutral core and broad exports are not a reason to migrate or copy its public structure.
- Textual's [focused-widget and app binding route](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/docs/guide/input.md#L118-L185) demonstrates why focus, app shortcuts and inspectable bindings belong in one model. Its Python inheritance, string actions and full message system are not proposed for vue-tui.

## Explicit non-decisions

This record does not decide to:

- publish a `useTerminal`, command, editor, list, overlay, or cell-surface API under any particular name; the accepted F4 focus/scope composables, F3 `TuiInputEvent` contract, and F1.3 `useRenderSession()` contract are the explicit named exceptions recorded in [focus-and-scopes.md](./focus-and-scopes.md#accepted-public-authoring-surface), [input-routing.md](./input-routing.md#accepted-public-input-contract), and [render-session.md](./render-session.md);
- implement the direct replacement of current mount, targeted-listener, drag, input, focus, raw-mouse, or direct-stream APIs before each target contract and its evidence are accepted; the experimental policy removes the backward-compatibility gate but does not choose the new API shape;
- build a Table, TextInput, Dialog, Tree, Command Palette, TaskList or other catalog item merely because another framework has one;
- create `@vue-tui/use` before an accepted independent behavior requires it;
- make all web Vue directives or DOM event semantics work unchanged in a terminal;
- add a blanket component accessibility requirement or change the runtime's existing accessibility contract;
- make either rendering mode the sole or feature-reduced product mode; both remain first-class, and the accepted Inline omission default does not establish a product hierarchy;
- introduce a router, generic message bus, framework-neutral renderer API, or application-domain state machine;
- reopen renderer optimization, virtualization or native-core work without the triggers in [performance.md](./performance.md#when-to-reopen-this-work).
