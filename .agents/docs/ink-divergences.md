# vue-tui - Intentional Divergences from Ink

vue-tui started as a Vue 3 port of [Ink](https://github.com/vadimdemedes/ink), and it
still tracks Ink closely: the aim is behavioral parity except where a difference is
deliberate. It is no longer only a port, though. It has its own design decisions,
additive features, and Vue-native choices.

This document records the places vue-tui intentionally differs from Ink by design. A
difference that is not listed here is treated as a bug, or simply unverified behavior,
not a design choice.

Reference baseline: Ink **v7.0.4** (commit
`40b3a7578811fd616341ca4e31cc7748aeeff12f`). When bumping the target Ink version,
re-validate every entry below against the new source.

## How to Classify a Divergence

Classify each divergence by the first rule that applies. The order matters: earlier
sections are narrower, while later sections are broader fallbacks.

1. If Ink's supported subset still behaves the same and vue-tui only accepts more inputs,
   supports more contexts, or exposes an extra capability, put it in **Additive
   Supersets**.
2. If the primary reason is alignment with Vue's framework model, philosophy, or user
   expectations, put it in **Vue-Aligned Design**.
   - Use **Model-Implied Differences** when the difference comes from the React/Vue
     framework-model boundary. Matching Ink would require React-shaped machinery inside
     Vue, changing a core Vue-facing contract, or dealing with a React-only concept that
     has no Vue equivalent.
   - Use **Vue-Idiomatic Choices** when Ink could be copied, but vue-tui chooses the
     behavior or public surface that better fits Vue's reactivity, lifecycle, component
     boundaries, current-props model, or API conventions.
3. If the divergence is intentional but is not additive and is not primarily Vue-aligned,
   put it in **Intentional Divergence Choices**.
4. If the note is not a divergence, put it in **Non-Behavioral Notes**.

Each divergence entry states what Ink does, what vue-tui does, and why the difference is
deliberate. Some entries also record consequences, costs, tests, or maintainer decisions
where those details are needed to understand the decision.

---

## Additive Supersets

vue-tui supports more than Ink in these cases. Ink-supported inputs and common use cases
remain compatible; vue-tui only adds accepted inputs, contexts, or capabilities.

### Multiple `<Static>` regions

- **Ink:** keeps a single `staticNode`; only one `<Static>` is honored.
- **vue-tui:** `findStatics(root)` renders **every** `<Static>` in the tree.
- **Why:** a tree with two `<Static>` regions renders both. Maintainer decision
  (2026-05-30): KEEP.

### Ctrl+C exits under the kitty protocol too

- **Ink:** exits only on the legacy `\x03` byte (in `App`), so a kitty-protocol Ctrl+C
  (`\x1b[99;5u`) parses fine but never exits. Its guard is byte-specific, not
  Ctrl+C-specific.
- **vue-tui:** one encoding-agnostic exit in the always-on stdin controller (`emitInput`),
  via `parseKeypress`. It matches Ctrl+C in both the legacy and kitty forms (but not
  Ctrl+Shift+C), so it fires no matter which composable holds raw mode (`useInput` /
  `useFocus` / `usePaste`, or none).
- **Why:** `exitOnCtrlC` is defined in terms of Ctrl+C, not one byte encoding. Keeping the
  exit at the single always-on layer avoids splitting the behavior across two places. Opt
  out with `exitOnCtrlC: false`. Maintainer decision (2026-05-30): KEEP. Tests:
  `usePaste-only app exits on {legacy,kitty} Ctrl+C` in `input-kitty.test.ts`.

### `parseKeypress` filters kitty query-responses

- **Ink:** filters kitty keyboard-protocol query-responses (`ESC[?Nu`) in exactly **one**
  place: the auto-detection lifecycle in `ink.tsx`
  (`stripKittyQueryResponsesAndTrailingPartial` on a private `onData` buffer). Its
  `parse-keypress.ts` has no query-response branch.
- **vue-tui:** mirrors that detection layer (in `kitty-keyboard.ts`) **and** adds a
  parser-level filter: `parseKeypress` returns `{ ignore: true }` for `ESC[?Nu`, which
  `useInput` then drops.
- **Why:** the detection layer does **not** cover the runtime input pipeline (`stdin 'data'`
  -> `inputParser` -> `emitInput` -> `useInput` -> `parseKeypress`). In `enabled` mode it
  never runs; in `auto` mode its `onData` listener and the stdin controller's
  `handleData` both subscribe to the same `'data'` event, so stripping its private buffer
  cannot stop the chunk reaching `handleData`; and after detection settles the listener is
  gone. Empirically (Layer 2 removed, rebuilt) a stray query-response reaches a `useInput`
  handler as spurious `"[?1u"` input in all of those cases, including a response split
  across two reads, which `inputParser` reassembles before dispatch. The parser-level
  filter is therefore intentional, not redundant. Introduced 2026-05-31. Tests: "kitty
  query-response - end-to-end filtering" in `kitty-lifecycle.test.ts` (RED without it).

### Non-`Error` thrown values keep their message in the error overview

- **Ink:** `ErrorOverview` renders `error.message`; a thrown non-`Error` (`throw 'boom'`)
  has no `.message`, so the overview shows a blank message.
- **vue-tui:** the error boundary keeps the **raw** thrown value and `ErrorOverview` shows
  `String(value)` as the message, so `throw 'boom'` renders ` ERROR  boom`, not a blank
  `ERROR`. Like Ink, no stack block is rendered when the value carries no stack.
- **Why:** this gives a useful message for the (lint-discouraged) non-`Error` throw, and it
  keeps the message vue-tui already surfaced before: when the boundary wrapped such throws
  in `new Error(String(value))`, which also produced a misleading synthetic stack pointing
  at framework internals. That synthetic stack is now gone. Introduced 2026-05-31.

### `useAnimation()` outside a render tree drives a standalone animation

- **Ink:** the default `AnimationContext.subscribe()` is a no-op subscription with
  `startTime: 0`, so a `useAnimation` rendered outside an Ink tree never ticks.
- **vue-tui:** `useAnimation` falls back to a freshly created standalone scheduler
  (`inject(AnimationSchedulerKey, null) ?? createAnimationScheduler()`), so `frame`/`time`/
  `delta` advance even with no surrounding app.
- **Why:** the composable still does useful work in isolation, such as a unit test or a
  non-rendered driver. Additive; inside a tree the injected scheduler is used exactly as
  Ink's. Contrast with the terminal-bound composables in the outside-render-tree entry,
  which throw because they have no meaningful standalone mode.

### `measureElement` / `useBoxMetrics` also accept a Vue component-instance ref

- **Ink:** `measureElement(node: DOMElement)` and `useBoxMetrics(...)` read
  `node.yogaNode` directly: a host `DOMElement` only.
- **vue-tui:** the ref is resolved through `$el` as well: a `ref` bound to a **Vue
  component** (whose root host node is on `$el`), not just a host-node ref, resolves to the
  underlying yoga node.
- **Why:** in Vue a template ref on a component yields the component instance, and its host
  node is reached via `$el`. Supporting both shapes is a strict superset that matches how
  Vue refs behave; a bare host-node ref still works identically to Ink.

### `renderToString` supports screen-reader mode

- **Ink:** `renderToString` has only a `columns` option; it always renders the non-SR
  (ANSI) frame.
- **vue-tui:** `renderToString` accepts `isScreenReaderEnabled?: boolean`. In SR mode it
  returns the linearized accessibility text (`renderScreenReaderOutput`) and prepends the
  linearized `<Static>` output, just as the non-SR path prepends the painted static frame.
- **Why:** vue-tui already has a parity SR renderer for the live path. Surfacing it through
  the string API is a strict superset (default `false` is byte-identical to Ink) and keeps
  `<Static>` content in generated SR snapshots. Additive.

### Two apps sharing one stdin both receive input

- **Ink:** raw-mode count and the input listener are **per-`App`** (`useRef`), and Ink reads
  via the `'readable'` event + `stdin.read()` (pull, `App.tsx:278-313`). Two `render()`s to
  different stdout but one stdin each attach a `readable` listener, but the first-registered
  listener's `read()` loop drains the buffer every tick, so the second app receives no
  input until the first unmounts. And because counts are per-`App`, the first app's
  unmount calls `stdin.setRawMode(false)`, dropping raw mode while the second still needs
  it.
- **vue-tui:** the terminal raw-mode toggle is refcounted **per-stdin** (a shared
  `WeakMap`), so one app's unmount cannot drop raw mode while another holds it; and the
  `'data'` input listener is **per-controller**. Each app attaches its own `handleData` ->
  own parser -> own emitter. Since `'data'` (push) broadcasts to **every** listener, both
  apps receive every keystroke, and the second keeps receiving after the first unmounts.
- **Why:** this covers a combination vue-tui already allows: two `createApp`s to different
  stdout. The same-stdout no-op is keyed on stdout, not stdin. The push model has no drain
  race, and a shared raw-mode refcount matches the ownership model when several renderers
  share one input. The common one-app-to-terminal flow is unchanged: one controller's
  `localRefs` equals the shared `refs`. Test: `raw-mode-lifecycle.test.tsx` ("two apps
  sharing one stdin both receive input..."). Maintainer decision (2026-06-07): KEEP.

## Vue-Aligned Design

These divergences come from choosing Vue's framework model and user expectations as the
source of truth while tracking Ink. Some are model-implied: matching Ink would require
React-shaped machinery inside Vue, changing a core Vue-facing contract, or handling a
React-only concept that has no Vue equivalent. Others are idiomatic choices: Ink could be
copied, but vue-tui chooses the behavior or public surface that better fits Vue's
reactivity, lifecycle, component boundaries, current-props model, or API conventions.

### Model-Implied Differences

#### Reactive composable state is a `shallowRef`, not a plain snapshot

- **Ink/React:** a hook re-runs on every render of its component, so it can return a plain
  value and the caller always reads the latest one. `useFocusManager().activeId`, for
  instance, is a bare `string | undefined`, re-read fresh each render.
- **vue-tui:** a composable's `setup()` runs **once**, so reactive state cannot be a plain
  snapshot: it would freeze at setup time. vue-tui returns a **`shallowRef`** whose `.value`
  updates and re-renders the template; read these as `.value`. Every stateful composable
  follows this, including `useTerminalSize()` and `useFocusManager().activeId`. An empty
  one holds `null` (Vue's convention for an empty ref: a template ref is
  `ref<T | null>(null)`), where Ink's plain value is `undefined`.
- **Why:** the two frameworks track a changing value differently. React reads the newest
  value by re-running the hook; Vue wraps it in a ref the template subscribes to. This is
  the general rule, not a per-API choice. `useFocusManager().activeId` is just one
  instance. This follows Vue's philosophy: changing state is exposed as a reactive source,
  not as a one-time snapshot. Maintainer decision (2026-06-07): KEEP.

#### `useCursor()` re-assertion follows fine-grained reactivity, not React's render cascade

- **Ink:** `useCursor`'s no-deps `useInsertionEffect` (`use-cursor.ts:27-32`) re-runs on
  every render **of the cursor component**, re-marking the cursor dirty
  (`ink.tsx:494-497`); log-update resets `cursorDirty` each commit. React re-renders a
  whole subtree when an ancestor commits, so if the cursor component is in that subtree it
  re-renders and the cursor is re-asserted, even when only an ancestor's unrelated state
  changed. If an unrelated sibling owns the changing state, the cursor component does
  **not** re-render, so Ink does **not** re-assert and the cursor is dropped that commit.
- **vue-tui:** `useCursor` propagates via `watch(positionRef, ..., {flush:'sync'})`. It
  re-asserts when the position **reference changes** (or the owning component re-renders
  and re-sets it). Vue's fine-grained reactivity re-runs only components whose own deps
  changed, so an ancestor-driven commit does **not** re-run a cursor child that did not
  depend on the changed value, and a set-once cursor is dropped that commit.
- **Why:** the two agree for the **recommended** usage: set the position reactively (in the
  render body / from a ref the component reads), as Ink's apps and vue-tui's parity tests
  do. They also agree in the unrelated-sibling case (both drop). They differ only in the
  narrow edge of a **set-once** cursor plus an **ancestor-driven** commit: React's render
  cascade re-asserts it, Vue's fine-grained reactivity does not. This is a consequence of
  React's cascade vs Vue's fine-grained re-render model. A global per-commit re-assert
  would make vue-tui diverge from Ink in the opposite (unrelated-sibling) direction, where
  Ink drops the cursor. Keep the reactivity-tied behavior. Maintainer decision
  (2026-06-01): KEEP.

#### A `setup()`-throwing component emits a dev-only `[Vue warn]` on stderr

- **Ink:** a component that throws during render surfaces only through the error overview /
  exit path; React emits no extra framework warning.
- **vue-tui:** in a **development** build, a component whose `setup()` throws additionally
  produces Vue's own `[Vue warn]` lines on stderr (for example, the missing-render-function
  warning) that Ink has no analog for. In interactive mode `patchConsole` filters
  `[Vue warn]` out of the frame; outside that path (debug, non-patched stderr) it surfaces.
- **Why:** these warnings come from Vue itself and are **dev-only** (stripped in production
  builds); they have no effect on stdout output or the exit code. Documented so the stray
  warn is not mistaken for vue-tui behavior: it is Vue's framework diagnostics. While
  console patching is active, vue-tui treats the `[Vue warn]` prefix as that framework
  diagnostics channel and filters it. This may also filter user-authored stderr logs that
  intentionally use the same reserved prefix; use a different application prefix when that
  output must be preserved. Maintainer decision (2026-06-06): KEEP.

#### React concurrent mode

- **Ink:** built on React; Suspense / `useTransition` are React features.
- **vue-tui:** no equivalent.
- **Why:** this is a React-only concept with no Vue equivalent, so it is N/A rather than a
  parity gap.

### Vue-Idiomatic Choices

#### Entry point - `createApp()` instead of `render()`

- **Ink:** `render(<App/>, options?)`: `options` is `RenderOptions`; returns an `Instance`.
- **vue-tui:** `createApp(App)` returns a `TuiApp`; `app.mount(options?)` takes
  `MountOptions`.
- **Why:** mirrors Vue's own `createApp` mental model. A Vue developer expects an app
  object (`TuiApp`) they mount, not a one-shot render call. The mount-options bag and the
  app handle are therefore Vue-shaped (`MountOptions` / `TuiApp`), not `render()`-shaped
  (`RenderOptions` / `Instance`). Do not add Ink-compatible aliases here: aliases would
  make the public API look render-shaped while the actual runtime contract is app-shaped.
  Maintainer decision (2026-06-07): KEEP.

#### Removing `display` resets to the default (visible)

- **Ink:** `applyDisplayStyles` (`styles.ts`) sets `DISPLAY_NONE` whenever an explicit
  `display` is present and not `'flex'`, so a present-but-undefined
  `display={undefined}` **hides** the box, and an omitted `display` **persists** the prior
  value.
- **vue-tui:** a removed/undefined `display` resets to the Box default `DISPLAY_FLEX`
  (visible): the same state as if the prop had never been set.
- **Why:** render = f(current props): no `display` set means the default (visible).
  Persisting a withdrawn prop, or flipping it to hidden, does not match that model. Maintainer
  decision (2026-05-31): KEEP.

#### Public composable naming follows Vue conventions

- **Ink/React:** public APIs are hooks (`useFocus`, `useInput`, ...) and the equivalent
  hook-return types are named `XProps` (`StdinProps`, `AppProps`, ...).
- **vue-tui:** public APIs are Vue **composables** (`useFocus`, `useInput`, ...), and
  composable return types follow VueUse's `UseXReturn` convention (`UseStdinReturn`,
  `UseAppReturn`, ...). In vue-tui, `XProps` is reserved for component props (`BoxProps`,
  derived via `ExtractPublicPropTypes`).
- **Why:** the public surface should read like Vue code. The return shapes still mirror
  Ink field-for-field where the same public state exists; reactive state is represented as
  refs for the model-implied reason documented above. Do not export Ink-compatible alias
  names for these types: Vue-first naming is more important than making type imports look
  portable across React and Vue. `XProps` stays reserved for component props; composable
  returns stay `UseXReturn`. Maintainer decision (2026-06-07): KEEP.

#### Function-valued composable inputs use `MaybeRef`, not getters

- **Ink/React:** `useInput` and `usePaste` use React's current-props model: a hook can keep
  a stable event listener and still call the latest handler after a re-render.
- **vue-tui:** `setup()` runs once, so passing a function prop's current value directly
  (`useInput(props.onInput)`) captures a one-time snapshot. When a composable should follow
  a function-valued prop, pass a live prop ref instead:
  `useInput(toRef(props, "onInput"))` / `usePaste(toRef(props, "onPaste"))`. A wrapper
  closure that reads `props.onInput(...)` at event time is also correct.
- **Why:** this is Vue's standard reactive-source boundary: pass the source, not a value
  read from it in setup. The handler parameter accepts `MaybeRef<Handler>` and resolves it
  with `unref()` when input/paste occurs. It deliberately does **not** accept
  `MaybeRefOrGetter<Handler>` because a handler is itself a function:
  `useInput(() => {})` must remain an input handler, not be reinterpreted as a getter that
  returns one. Maintainer decision (2026-06-06): KEEP.

#### `<Static>` uses a scoped slot object instead of positional render arguments

- **Ink/React:** `<Static>` receives a function-as-children render callback and calls it as
  `render(item, absoluteIndex)`.
- **vue-tui:** `<Static>` exposes a Vue scoped slot with `{ item, index }`, so template
  users write `v-slot="{ item, index }"` and TSX users pass a slot function that receives
  one props object.
- **Why:** this is the framework-native match for React render children. Vue scoped slots
  pass one props object, not multiple positional arguments, and that object form is what
  Vue users expect for slot payloads. The rendered item/index values remain equivalent.
  Maintainer decision (2026-06-06): KEEP.

## Intentional Divergence Choices

These divergences are deliberate, but they are not strict supersets and are not primarily
driven by Vue's framework model or API conventions. vue-tui intentionally chooses a
different runtime behavior, ownership rule, or out-of-contract handling.

### Second `mount()` on a live stdout is an inert no-op

- **Ink:** `render()` keeps one instance per stdout (`WeakMap<WriteStream, Ink>`); a second
  `render(node, {stdout})` on a stream that already has a live instance warns on stderr but
  **reuses** that instance and `rerender`s the new tree into it.
- **vue-tui:** a second `mount()` on a still-live stdout warns on stderr and returns an
  **inert handle**. It wires no second renderer and renders nothing; the first app's tree
  stays on screen. `unmount()`/`teardown()` on that handle never touch the owner's stream or
  registry entry (`unmount()` only settles the inert handle's own exit promise).
- **Why:** a second `mount()` on a live stdout is a misuse (forgot to `unmount()`, a
  re-render glitch fired `mount()` twice, or expecting `mount()` to re-render — it doesn't;
  update reactive state for that). Ink treats it as unsupported and warns too. vue-tui fails
  safe: it ignores the second mount, keeps the live app rendering, and warns with the two
  recovery paths. It deliberately doesn't copy Ink's reuse-and-rerender: there's no clean
  public path to it (`createApp` binds the tree to the app, so an Ink-style rerender would
  mean reaching into the live app's container or tearing it down first), and on a misuse path
  keeping the running app stable beats auto-tearing it down (which would churn on a re-render
  glitch). Maintainer decision (2026-06-04): KEEP. Test: `instance-reuse-guard.test.tsx`.

### Raw mode is owned for the interactive lifetime by default (`rawMode` option)

- **Ink:** raw mode is **lazy / reference-counted to input hooks**. `useInput` /
  `useFocus` / `usePaste` enable it on mount and release it when the last one unmounts, so
  a screen with no input handler falls back to cooked mode. There is no option to hold it.
- **vue-tui:** the `rawMode` mount option defaults to **`'always'`**. Raw mode is enabled at
  mount and held for the whole interactive run (when `interactive` and stdin is a TTY),
  regardless of which input composables are mounted. `rawMode: 'auto'` opts back into Ink's
  exact lazy behavior.
- **Why:** for a long-running interactive app (a full-screen TUI, a coding agent), Ink's
  lazy model makes raw mode **toggle** as the user moves between input and no-input
  screens. The main consequence is **echo**: on a no-input / streaming screen the terminal
  is back in cooked mode, so typed keys echo into the half-drawn frame (and line-buffer).
  Ctrl+C also changes path: on a no-input screen it is a kernel SIGINT rather than the
  app's own `\x03` intercept. Note `exitOnCtrlC` defaults to `true` in both Ink and
  vue-tui, so by default Ctrl+C exits either way; the divergence is only the exit path/code
  (a clean exit `0` vs a re-raised SIGINT `130`). It matters for an app that sets
  `exitOnCtrlC: false` to handle Ctrl+C itself: under the lazy model its opt-out is
  bypassed on a no-input screen (the SIGINT still exits). Holding raw for the
  lifetime keeps echo and Ctrl+C handling identical on every screen. This matches the
  cross-framework norm: Bubble Tea, Textual, Ratatui, and prompt_toolkit all own the
  terminal for the program lifetime. Ink's hook-driven model differs: its "cooked on a
  no-input screen" behavior follows from refcounting input hooks rather than from an
  explicit no-input-screen contract.
- **Consequence:** owning raw mode `ref()`s stdin, so an `'always'` app stays alive until
  you explicitly `unmount()` / `exit()`. It does **not** auto-exit when idle (the same way
  an Ink app holding a `useInput` already does not). The "render and auto-exit" pattern
  (Ink's inline-output use) is `rawMode: 'auto'`. Tests: `raw-mode-lifecycle.test.tsx`
  (`'always'` holds raw with no input hook; `'auto'` stays cooked; no mid-session
  oscillation).

### Narrowing resize cancels the redundant trailing `clearTerminal`

- **Ink:** `resized()` paints synchronously via `onRender()` but does **not** cancel a
  pending throttled `onRender`; on a narrowing resize that trailing commit re-runs and,
  because `shouldClearTerminalForFrame` clears whenever the previous frame overflowed, Ink
  emits a **second** `clearTerminal`.
- **vue-tui:** `onResize` calls `scheduler.cancel()` before its synchronous commit,
  dropping the now-redundant trailing commit. The screen is cleared **once** per narrowing
  resize.
- **Why:** the synchronous resize commit already reflects the current tree, so the pending
  commit repeats the same clear. Emitting one clear instead of two has no visible behavior
  difference (issue #26).

### Degenerate boxes do not lay out or paint children when the content area is gone

- **Ink:** its size model is border-box-like: `width`/`height` are handed to Yoga as the
  element's outer size, while border and padding consume space inside that size. Ink has no
  `boxSizing` / `content-box` prop. During paint, though, Ink only clips children when
  `overflow` is hidden. With default visible overflow, children can leak into border rows
  or outside the box when border/padding squeeze the content area to zero, and a bare
  `width={0}` Box can still let zero-width text wrapping create extra visible rows
  (`B\nA` beside a sibling). Examples in Ink v7.0.4 include:
  `width={3} height={2} borderStyle="single"` painting the child on the bottom border row;
  `width={2} height={3}` leaking the child past the right border;
  `width={4} height={3} paddingX={1} borderStyle="single"` leaking into the bottom
  border; and bare `width={0}` text reserving rows through wrap-ansi's width-0 layout.
- **vue-tui:** layout computes each Box's inner content size by subtracting computed border
  and padding from the outer box size, clamps it to `{width >= 0, height >= 0}`, and
  temporarily removes that Box's yoga children from the layout when either dimension is
  zero. Paint applies the same inner-content gate, so the child subtree neither reserves
  invisible rows nor writes glyphs outside a nonexistent content area. Border and background
  are still painted as far as the outer area permits. Positive-size content areas keep the
  existing overflow behavior; this is not a blanket `overflow:hidden`.
- **Layout model guidance:** primitive `Box` should preserve the Yoga/flexbox model rather
  than paper over it with ad-hoc layout corrections. Defaults such as `flexShrink: 1` are
  part of that model, and a child resolving to zero width or height can be a valid layout
  result. Higher-level components are where stronger user intent belongs: scroll, list, and
  viewport abstractions should keep their content at natural size (`flexShrink: 0`, or an
  equivalent encapsulated default) and let a bounded viewport clip or offset what is visible.
  Paint containment is the renderer invariant underneath both cases: whatever Yoga resolves,
  children may only paint inside their owning Box's content rectangle; if that rectangle has
  no positive width or height, the child subtree does not paint.
- **Why:** children need a real content rectangle to lay out and paint into. If the
  resolved content width or height is zero, rendering child text or nested borders on top
  of the frame, outside the box, or on later rows is an implementation artifact, not useful
  output. This follows the common TUI box model: Ratatui renders child widgets into an
  inner `Rect`, Textual reduces content space from the assigned box, and Rich panels render
  children with child width/height after subtracting the border. Bubble Tea's viewport
  follows the same separation at the component level: content keeps its natural size while
  the viewport exposes a bounded visible window and offsets. The behavior also prevents
  negative repeat/count math and paint crashes in tiny legal boxes. Maintainer decision
  (2026-06-07): KEEP. Tests: `text-wrap-width.test.tsx`, `flex.test.tsx`,
  `text.test.tsx`.
- **Future `content-box`:** this does not block adding an explicit content-box option
  later. That option would change how a requested size is expanded into an outer box size
  before layout. Once an outer box exists, the paint invariant remains the same: a child
  subtree only lays out and paints when the resolved inner content rectangle has positive
  width and height. The default remains border-box-like, matching Ink's current public
  sizing model.

### Out-of-type style values are forwarded, not defensively coerced

- **Ink:** several flex/align setters coerce an invalid runtime value to a default:
  `flexShrink` non-number -> `1`; `alignItems`/`alignSelf`/`alignContent`/
  `justifyContent` falsy (`""`) -> their default (STRETCH / AUTO / FLEX_START); and an
  out-of-set value matches none of Ink's `if`-chain branches, so no setter runs and the
  previous/default value persists.
- **vue-tui:** these setters trust the typed prop surface and forward the raw value to
  yoga: a non-number `flexShrink` is passed through; `toAlign("")`/`toJustify("")` look up
  `""` and pass `undefined` to the setter; and out-of-set values that yoga happens to
  accept (`space-*`/`baseline`/`auto` on `alignItems`) reach yoga rather than being ignored.
- **Why:** every one of these is reachable **only** via a TS-bypass. The public prop types
  forbid them. Within the typed contract Ink and vue-tui are identical. Ink's per-value
  coercion is defensive code for runtime values vue-tui's types already exclude. Duplicating
  those `typeof`/falsy guards would add checks for inputs the public types reject.
  (`flexGrow` is not in this set: both only coerce null/undefined -> `0`.) If a reviewer
  shows any case is reachable in-type, it becomes a bug to fix, not a divergence.

### Removing `flexDirection` / `flexWrap` resets to the default

- **Ink:** neither prop has a reset branch in `applyFlexStyles` (every _other_ flex prop
  does), so an explicit `flexDirection={undefined}` leaves the previous value in place.
- **vue-tui:** resets to the Box default (`row` / `nowrap`): the same state as if the prop
  had never been set.
- **Why:** render is a function of the current props. With no value set you get the default,
  and dropping a prop changes the output; keeping a previous render's value does not match
  that, and Ink resets every other flex prop. Maintainer decision (2026-05-30): KEEP.

### Composables throw outside a render tree

- **Ink:** the hooks read a React context whose **default** value is a no-op object, so
  calling e.g. `useStdin()` outside an Ink tree returns inert defaults without an error.
- **vue-tui:** `useApp`, `useStdout`, `useStderr`, `useStdin`, `useTerminalSize`,
  `useFocus`, `useFocusManager`, `useInput`, `usePaste`, `useCursor`, and
  `useIsScreenReaderEnabled` **throw** when their context is absent ("... must be called
  inside a vue-tui render tree"). `useBoxMetrics` and `useAnimation` do **not** throw:
  they fall back. `useBoxMetrics` reports zero metrics, and `useAnimation` drives a
  standalone scheduler. See the additive entry.
- **Why:** a composable used in the wrong place is a bug, and a thrown error names it at
  the call site instead of returning a context that quietly does nothing. The two
  exceptions fall back because they have a meaningful standalone behavior (zero metrics / a
  working animation), so throwing would remove a useful capability. Required app,
  terminal, focus, and input context should fail fast when absent; no-op defaults hide bugs.
  Maintainer decision (2026-06-07): KEEP.

### Invalid input is validated at the component layer, not the paint layer

- **Principle:** vue-tui validates invalid render input (a chalk-**modifier**
  `backgroundColor` like `"bold"`, an unknown `borderStyle`) at the
  **component-render layer** (`box.ts` / `text.ts`), not down at the **paint layer**. A bad
  value therefore throws where the **error boundary** catches it -> `ErrorOverview` -> a
  clean `reject` of `waitUntilExit()`, exactly like any other component error. The app
  reports the error instead of crashing.
- **Ink:** validates the same inputs **lazily at paint** (`colorize` / `render-border`, run
  from the reconciler's commit hook): **outside** React's ErrorBoundary, so a bad value is
  an uncaught crash, not a recoverable error.
- **Why:** the key constraint is where paint runs. vue-tui's paint runs in a Vue
  **post-flush callback** (`queuePostFlushCb`, decoupled from render), so a throw there
  escapes `onErrorCaptured` and wedges the scheduler. Unlike a component error, it cannot
  be made recoverable. The escape itself is symmetric, not a Vue weakness: a component
  error boundary (React `ErrorBoundary`; vue-tui's `onErrorCaptured` wrapper) covers
  framework-managed component work, never the renderer's paint callbacks, so a paint-layer
  throw is uncatchable in **both** engines. Validating in `Box` / `Text` keeps a bad value
  on that boundary-driven recoverable path; Ink's paint-time check can only crash. This is
  a deliberately chosen fail-safe given a constraint that is symmetric across React and Vue
  (recover-vs-crash), not a Vue-model-forced difference — hence an intentional choice rather
  than a model-implied one.
- **Cost:** the component-layer check is eager (no paint-time layout/squash info), so it
  over-throws in a few degenerate, invalid-input-only cases Ink never reaches. Realistic
  inputs match Ink; both error on bad input. Only the channel (recoverable reject vs crash)
  differs. Maintainer decision (2026-06-07): KEEP. vue-tui makes the more reliable
  library choice here: reject the same invalid input with a recoverable, prop-specific
  error instead of preserving Ink's lower-level paint crash and chalk implementation
  message. Tests: `background-color.test.tsx`, plus the `borderStyle` validation tests.

## Non-Behavioral Notes

These notes are not divergence entries. They document Vue-facing conventions or internal
mechanics so they are not mistaken for parity gaps.

- Vue SFCs use `<script setup>`, and component definitions use `defineComponent()`.
- `shallowRef` is the default for reactive state. Use `ref` only when deep reactivity is
  intentional and documented.
- The exported host-node type is **`TuiNode`** (`TuiContainer | TuiTextLeaf | TuiComment`,
  from `@vue-tui/runtime/internal`), not Ink's DOM-emulation `DOMElement`
  (`nodeName` / `attributes` / `childNodes`). vue-tui keeps a native host tree, so the
  exported type names that tree; `measureElement` and template refs accept it. No runtime
  behavior differs from Ink's DOM-emulation node.
- `null` / `false` / `undefined` / `v-if="false"` children are materialized by Vue as
  comment vnodes, which vue-tui's host renderer turns into an inert `TuiComment`: no yoga
  node, paints nothing, never shifts a sibling, and skipped when counting the positional
  `<Transform>` index (the `child.type !== "comment"` guards in `paint.ts`,
  `text-measure.ts`, and `screen-reader.ts`; `G52`). The result matches Ink, which drops
  these children outright — React never renders `null` / `false` / `undefined` (verified
  against Ink v7.0.4: `{false}`, `{null}`, `{undefined}` each produce no node; only a real
  empty `<Box/>` occupies a flex-gap slot). `<Transform>` over an empty or all-comment slot
  renders no node (`return null`), matching Ink's `children == null` guard for nullish
  children and intentionally diverging for a literal `false` child. Ink's React
  `children` check sees `false !== null` and creates an empty `ink-text` layout item that
  can consume a flex-gap slot; Vue materializes `false`, `null`, `undefined`, and
  `v-if=false` as the same comment-anchor shape, so vue-tui treats the all-comment slot as
  absent. Maintainer decision (2026-06-07): KEEP. This is the correct Vue behavior:
  conditional false children should behave like no node, not like an empty layout item.
- Commit timing is deliberately Ink-aligned: leading+trailing throttle at
  `ceil(1000/maxFps)` ms (34ms at the default `maxFps=30`, matching Ink's
  `renderThrottleMs`), synchronous resize. This remains true even though re-renders come
  from Vue's fine-grained reactivity, not a React subtree re-render.
