# vue-tui ↔ Ink relationship record

vue-tui began as a Vue 3 port of Ink and still uses Ink as its closest behavioral baseline. This is the single current record of deliberate alignment, deliberate divergence, and non-behavioral differences.

Reference baseline: Ink v7.0.4 at [`40b3a757`](https://github.com/vadimdemedes/ink/tree/40b3a7578811fd616341ca4e31cc7748aeeff12f). Terminal-dependent claims are run-verified against that pinned version. Changing the baseline requires rechecking every retained relationship below.

Historical APIs and superseded experiments do not live here. Their names and removal reasons are indexed in [removed-experiments.md](./removed-experiments.md); detailed evolution remains in Git history.

## Governing principle

Alignment is a means to reduce bugs, never the product goal. When Ink already has the most correct and reasonable behavior, matching it inherits mature edge handling cheaply. When Ink is defective, conflicts with Vue's model, or provides the wrong ownership boundary for vue-tui, correctness and Vue philosophy win.

“Ink does it” is evidence, not a sufficient reason. A retained relationship must state what is shared or different and why that choice is sound for vue-tui.

The [Runtime decision ledger](./runtime-public-api-decisions.md) is authoritative for accepted public-API judgment. A vouch in this record applies only to its exact wording; unstamped entries remain current evidence-backed descriptions that may be challenged against code and tests.

## Classification

- **Deliberate alignment:** a load-bearing or non-obvious behavior vue-tui consciously shares with Ink.
- **Vue-native choice:** vue-tui uses a different public shape or lifecycle because Vue supplies a different authoring model.
- **Intentional runtime divergence:** the frameworks could share a shape, but vue-tui deliberately chooses different rendering, ownership, error, or layout behavior.
- **Non-behavioral note:** a package, naming, or implementation difference that is not an observable parity claim.

An unrecorded behavioral difference is a bug candidate or an unverified fact, not an implicit design decision.

## Deliberate alignments

| Topic                | Shared behavior                                                                                                                                             | Why it remains aligned                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Commit cadence       | Live updates use a leading-and-trailing bounded cadence and resize commits synchronously.                                                                   | Ink's cadence is responsive and well exercised. vue-tui's deliberate resize-cancellation exception is recorded below.    |
| `Static` lifecycle   | An output-free producer remains eligible, accepted history is irreversible, its subtree is released after acceptance, and remount creates a fresh producer. | Terminal history is an output side effect, not reversible component visibility.                                          |
| Borrowed streams     | Caller-supplied stdin, stdout, and stderr remain open; Runtime removes its listeners and restores only state it acquired.                                   | Surrounding code may share or continue using those streams after the app ends.                                           |
| Literal tabs in Text | A literal tab is not normalized before measurement, so measured and terminal-expanded widths may disagree.                                                  | The quirk is shared and rare; fixing it requires a column-aware normalization rule rather than an isolated special case. |

The final-document relationship is partly aligned and partly stricter: Ink supplied the useful redirected-output precedent, while vue-tui removes the live override and lone-empty-newline behavior. It is therefore recorded under intentional divergences.

### App exit settlement and flush during teardown

First accepted exit wins, `waitUntilExit()` settles after final accepted output, and `waitUntilRenderFlush()` remains a non-reporting output barrier rather than duplicating an exit error. This deliberately aligns where the application models overlap; Vue's separate pre-mount state additionally lets an empty flush resolve immediately.

## Vue-native choices and additive capabilities

### Application and component model

| Topic                     | Ink                                                                           | vue-tui and rationale                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application entry         | `render(element, options)` returns a render handle.                           | `createApp(component, rootProps)` returns a Vue-shaped `TuiApp` whose `mount(options)` returns the user root instance. Vue plugins, provide, configuration, components, directives, and lifecycle remain ordinary Vue application capabilities. |
| Reactive composable state | Hook results are React snapshots or callbacks.                                | Public reactive state uses readonly Vue refs, normally backed by `shallowRef`. This is Vue's composition model rather than a behavioral parity gap.                                                                                             |
| `Static` authoring        | One collection component owns `items` and a positional render-function child. | `@vue-tui/runtime/inline` exports one prop-free history block. Applications use Vue slots, `v-for`, keys, and conditional mounting for collection composition and identity.                                                                     |
| Visibility                | Box exposes a public `display` style.                                         | Vue `v-if` and `v-show` own component lifecycle and authored visibility. Runtime host behavior implements Vue's current-root `v-show` contract; `BoxProps` has no public `display` field.                                                       |
| Current prop state        | Some explicit nullish style values can leave prior Yoga state in Ink.         | A current nullish `flexDirection` or `flexWrap` resets to the public Box default so layout remains a function of current Vue props rather than render history.                                                                                  |

### Vue refs and ownership

| Topic                             | Ink                                                     | vue-tui and rationale                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Box measurement                   | Public host `DOMElement` values expose measurement.     | `useBoxMetrics()` accepts a readonly ref bound directly to the exported current-app `Box` and returns readonly `width`, `height`, `left`, `top`, and `hasMeasured` refs. Renderer and Yoga nodes remain private.                                           |
| Focus                             | Logical registrations may use string IDs and a manager. | Every `useFocus()` call has its own `focus()`/`blur()` handle and readonly `isFocused` ref. An optional Vue component-ref target constrains rendered availability without becoming the identity, traversal, or input route.                                |
| Rendered lifetime                 | Ink refs point directly at retained host nodes.         | A Vue component instance may outlive or replace its host root, so Runtime privately reconciles host identity after commits. The public contract remains an ordinary Vue ref; details live in [rendered-target-lifetime.md](./rendered-target-lifetime.md). |
| Function-valued composable inputs | React hooks commonly receive current callback values.   | Vue composables accept live refs for handlers rather than treating handler functions as getter functions. Component props are forwarded through `toRef()` or a closure that reads the current prop.                                                        |

### Additive capabilities

- vue-tui accepts multiple independent `Static` block instances; Vue tree order determines simultaneously accepted blocks.
- Multiple applications may observe one shared stdin without duplicating physical byte parsing. Runtime removes owned Kitty query responses once before broadcasting one normalized fact.
- `useStdin()` gives each hook call an independent idempotent raw-mode hold, so one caller cannot release another caller's ownership.
- `Text` adds physical-line `textAlign` after wrapping or truncation; Ink v7.0.4 has no equivalent Text prop.

## Intentional runtime divergences

### Screen and output ownership

| Topic                  | Ink v7.0.4                                                                                                                                                             | vue-tui and rationale                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Non-TTY mounted output | Defaults to final dynamic output at teardown with immediate Static output, but exposes an explicit live-update override and writes a newline for an empty final frame. | Both requested vue-tui modes resolve to one final-document host on non-TTY stdout. There is no live override; an empty dynamic document writes no bytes, and a non-empty document receives a line ending only when needed. A pipe is a document destination, not a cursor-relative terminal recording. |
| Inline overflow        | Layout is vertically unbounded and some overflow transitions use a whole-terminal clear that can delete scrollback.                                                    | Inline treats terminal rows as a maximum, clips to the screen, and abandons old snapshots as history on resize. Runtime-generated controls never erase pre-application history with ED2/ED3/Home.                                                                                                      |
| Fullscreen             | Alternate-screen selection continues to use Ink's relative writer, so coordinated output can move the UI's physical origin.                                            | TTY Fullscreen owns a fixed alternate-screen viewport with a stable origin, complete clipping, coherent resize, and repaint after coordinated output. This makes screen ownership truthful independently of any future pointer feature.                                                                |
| `Static` in Fullscreen | Static can coexist with alternate-screen output.                                                                                                                       | An effective visual Fullscreen surface rejects `Static` before history bytes, observation, or a new viewport frame. Fullscreen history remains reactive application state; terminal scrollback belongs to Inline.                                                                                      |
| Observation            | Public `debug` changes physical output behavior.                                                                                                                       | Deterministic observation belongs to `@vue-tui/testing` and private Runtime bridges. It does not select a host or alter production output cadence.                                                                                                                                                     |
| Styling capability     | Chalk's ambient process behavior can influence output globally.                                                                                                        | Color capability is resolved once per render session from the public `color` request and selected host. Text, borders, backgrounds, Static, dynamic output, and authored SGR share that session capability.                                                                                            |

The complete current host contract, including non-TTY resolution, resize, suspension, HMR, external output, and teardown, lives in [rendering-mode-matrix.md](./rendering-mode-matrix.md).

### Application lifecycle and input

| Topic                      | Ink v7.0.4                                                                                        | vue-tui and rationale                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid exit argument      | Exit handling can accept values outside vue-tui's public error contract.                          | `useApp().exit()` accepts only an `Error` or `undefined`. A first invalid non-Error value throws `TypeError` without selecting or consuming exit, so a caught programming error does not terminate the app.             |
| Ctrl+C                     | Ink treats Ctrl+C as an application-exit default.                                                 | `exitOnCtrlC` defaults to `false`. An exact Ctrl+C is ordinary normalized key input unless the application explicitly requests exit; pasted Ctrl+C never triggers it.                                                   |
| Input delivery             | Ink's hooks combine framework-specific input and focus conventions.                               | `useInput()` broadcasts one readonly tagged `text`, `key`, or `paste` fact to every active subscription. Handler returns are ignored; focus, nested ownership, and propagation policy compose explicitly above Runtime. |
| Low-level stdin            | One shared raw-mode count can let unmatched release affect another caller.                        | `useStdin()` exposes the selected raw stream and one independently owned, scope-cleaned raw-mode hold per call. It remains an escape hatch without normalized event or safe-routing guarantees.                         |
| Mount and stream failure   | Some initial or asynchronous stream failures can leave resources or exit settlement inconsistent. | Mount acquisition and teardown are transactions. Runtime releases every resource it acquired, preserves the first cause, and settles only after cleanup and accepted output. Caller streams remain borrowed.            |
| Component errors           | Ink installs its own React-oriented error presentation.                                           | Ordinary production component errors follow Vue's `onErrorCaptured` and `app.config.errorHandler` contracts. Runtime does not add a hidden application wrapper or automatic component-error report.                     |
| Missing composable context | Ink hooks may return inert default context values.                                                | Public Runtime composables throw outside a compatible render tree, exposing authoring bugs at the call site. Valid string and document hosts supply deliberate inert services inside a real Runtime tree.               |

The exact accepted input, focus, lifecycle, and host judgments are recorded in [runtime-public-api-decisions.md](./runtime-public-api-decisions.md).

### Layout, Text, and paint

| Topic                       | Ink v7.0.4                                                                                               | vue-tui and rationale                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Box and Text surface        | Ink Box includes `display` and Ink Text has styling plus wrapping but no alignment.                      | `BoxProps` covers the retained Ink style grammar except `display`, including `alignSelf` and `alignContent`. Vue visibility replaces `display`. `TextProps` adds `textAlign` and supports five wrap modes: `wrap`, `hard`, `truncate`, `truncate-middle`, and `truncate-start`.   |
| Reactive wrap               | A live wrap-mode change can retain stale measurement.                                                    | Changing `wrap` invalidates Text measurement so layout and paint reflect the current prop.                                                                                                                                                                                        |
| Measured Text               | Ink's layout and paint can use different effective width assumptions at fractional allocations.          | Text forms lines once from one conservative complete-cell budget during the single Yoga pass. Later outward rounding may leave one cell unused rather than feeding final geometry into routine relayout.                                                                          |
| Degenerate Box content      | In-flow children can reserve or paint cells when border and padding leave no positive content rectangle. | In-flow children neither lay out nor paint when the resolved content width or height is zero. Border/background remain, and absolutely positioned children continue to use their padding-box containing block unless overflow clips them.                                         |
| Wide-grapheme left clipping | Dropping a grapheme that straddles the left edge can shift following glyphs left.                        | vue-tui preserves the retained glyphs' original source columns, leaving the clipped source-cell gap intact.                                                                                                                                                                       |
| Nested overflow             | A descendant clip can replace rather than intersect an ancestor clip in some output paths.               | Every active ancestor clip remains in force; descendants may narrow but never reopen excluded cells.                                                                                                                                                                              |
| Resize scheduling           | A pending trailing commit may run after a synchronous resize commit.                                     | Every resize first cancels the pending trailing commit, then performs the synchronous current-tree commit once.                                                                                                                                                                   |
| Public prop validation      | Some invalid visual inputs fail lazily during Ink paint.                                                 | `Box` and `Text` validate their closed public contracts during component render so invalid values follow Vue's component-error path rather than escaping from post-flush paint. Both Text color channels accept `Color` plus `"default"`, and undeclared attributes are rejected. |

### Focused Runtime evidence

- [`public-prop-contract.test.tsx`](../../tests/runtime/integration/components/public-prop-contract.test.tsx) pins current Box fields, all five Text wrap modes, colors, and rejected attributes.
- [`layout.test-d.ts`](../../tests/runtime/integration/public-types/layout.test-d.ts) pins `UseLayoutSizeReturn` and `UseBoxMetricsReturn` as public named types.
- Runtime layout and overflow suites under [`tests/runtime/integration/layout`](../../tests/runtime/integration/layout) cover single-pass measurement, degenerate content, clipping, and nested overflow.
- Runtime PTY suites cover Inline history, Fullscreen origin, wide-grapheme screen output, and resize behavior against a physical terminal model.

## Non-behavioral notes

- Vue reactivity, SFC compilation, component refs, provide/inject, and Vue's HMR instance semantics have no one-to-one React Ink API. Their different implementation vocabulary is not itself a behavioral divergence.
- Public vue-tui names follow Vue's application and composable conventions: `createApp`, `TuiApp`, `MountOptions`, `UseXxxReturn`, readonly refs, props, slots, and package subpaths.
- Runtime raw `tui-*` hosts, Yoga nodes, output coordinators, render-session services, and official-tooling bridges are private mechanics, not Ink-compatible extension APIs.
- Removed focus managers, routing, pointer, caret, selection, clipboard, Transform, animation, and screen-reader experiments are not dormant divergences. Their only current prose index is [removed-experiments.md](./removed-experiments.md).
- Higher-level component membership is governed by [`@vue-tui/components` principles](./components-design-principles.md), not Ink's catalog.
