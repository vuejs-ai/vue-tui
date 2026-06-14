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

## Why align to Ink — and when not to

Aligning to Ink is a **means, not an end**. Ink is a mature, battle-tested implementation, so
matching its public surface and behavior lets vue-tui inherit years of bug-fixes and edge-case
handling for free. That — reducing bugs by reusing proven behavior — is the entire point of
alignment.

It follows that **alignment is not the top priority**. When Ink's behavior is itself a defect,
is unreasonable, or is un-idiomatic for Vue, **conformance to Vue's philosophy and the plain
reasonableness/correctness of the behavior outrank parity.** There vue-tui deliberately diverges,
and records it here so the choice is conscious and vouched, not drift.

This guards against two opposite failure modes:

- **Blind alignment** — copying Ink even where Ink is wrong, or where matching would force
  un-Vue machinery, merely to match. (Rejected e.g. in the `useCursor` corner-zombie, the
  resolve-on-throw exit, and the paint-time invalid-input crash — Ink behaviors vue-tui treats
  as defects, not contracts.)
- **Lazy divergence** — inventing a different behavior and rationalizing it as "Vue's way is
  better" with no genuine Vue-philosophy or correctness reason. Mere presence in this file is
  **not** a vouch; every kept divergence needs a real reason and an explicit `[VOUCHED @handle]` stamp.

So the test for any difference is never just "does it match Ink?" but "is this the most
reasonable, most Vue-idiomatic behavior — and where it diverges from Ink, is that because Ink is
wrong or un-Vue, recorded with a `[VOUCHED @handle]` stamp?" Reasonableness and Vue idiom come first;
alignment is simply the cheapest way to get there whenever Ink is already right.

## How to Classify a Divergence

Classify each divergence by the first rule that applies. The order matters: earlier
sections are narrower, while later sections are broader fallbacks.

1. If Ink's supported subset still behaves the same and vue-tui only accepts more inputs,
   supports more contexts, or exposes an extra capability, put it in **Additive
   Supersets**.
2. If the primary reason is alignment with Vue's API shape, framework model, mental
   model, or user expectations, put it in **Vue API and Mental Model Divergences**.
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
deliberate. Some entries also record consequences, costs, tests, or the reasoning behind a vouch
where those details are needed to understand the decision.

---

## Additive Supersets

vue-tui supports more than Ink in these cases. Ink-supported inputs and common use cases
remain compatible; vue-tui only adds accepted inputs, contexts, or capabilities.

### Multiple `<Static>` regions

- **Ink:** keeps a single `staticNode`; only one `<Static>` is honored.
- **vue-tui:** `findStatics(root)` renders **every** `<Static>` in the tree.
- **Why:** a tree with two `<Static>` regions renders both. KEEP. [VOUCHED @hyf0]

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
  out with `exitOnCtrlC: false`. KEEP. [VOUCHED @hyf0] Tests:
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
  node is reached via `$el`. Because `<Box>` is a `defineComponent`, the `$el` path is in
  fact the **primary** path a normal `ref` on `<Box>` takes — the bare host-node ref is the
  rarer raw-host case. Supporting both is a strict superset that matches how Vue refs behave;
  a bare host-node ref still works identically to Ink. KEEP
  — a reasonable Vue-idiomatic adoption (the component-instance ref is the natural Vue path;
  the bare host-node ref stays Ink-identical). [VOUCHED @hyf0]

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
  sharing one stdin both receive input..."). KEEP. [VOUCHED @hyf0]

## Vue API and Mental Model Divergences

These divergences come from choosing Vue's API shape, framework model, mental model, and
user expectations as the source of truth while tracking Ink. Some are model-implied:
matching Ink would require React-shaped machinery inside Vue, changing a core Vue-facing
contract, or handling a React-only concept that has no Vue equivalent. Others are
idiomatic choices: Ink could be copied, but vue-tui chooses the behavior or public
surface that better fits Vue's reactivity, lifecycle, component boundaries,
current-props model, or API conventions.

### Model-Implied Differences

#### Reactive composable state is a `shallowRef`, not a plain snapshot

- **Ink/React:** a hook re-runs on every render of its component, so it can return a plain
  value and the caller always reads the latest one. `useFocusManager().activeId`, for
  instance, is a bare `string | undefined`, re-read fresh each render.
- **vue-tui:** a composable's `setup()` runs **once**, so reactive state cannot be a plain
  snapshot: it would freeze at setup time. vue-tui returns a **`shallowRef`** whose `.value`
  updates and re-renders the template; read these as `.value`. Every stateful composable
  follows this — `useFocusManager().activeId` is a single ref read as `.value`, while a
  composable may instead return an **object of refs** (`useWindowSize()` returns
  `{ columns, rows }`, read as `.columns.value` / `.rows.value`). An empty single-ref state
  holds `null` (Vue's convention for an empty ref: a template ref is `ref<T | null>(null)`),
  where Ink's plain value is `undefined`.
- **Why:** the two frameworks track a changing value differently. React reads the newest
  value by re-running the hook; Vue wraps it in a ref the template subscribes to. This is
  the general rule, not a per-API choice. `useFocusManager().activeId` is just one
  instance. This follows Vue's philosophy: changing state is exposed as a reactive source,
  not as a one-time snapshot. KEEP. [VOUCHED @hyf0]

#### A `setup()`-throwing component emits a dev-only `[Vue warn]` on stderr

- **Ink:** a component that throws during render surfaces only through the error overview /
  exit path; React emits no extra framework warning on stderr (verified: stderr stays
  empty).
- **vue-tui:** in a **development** build, a component whose `setup()` throws additionally
  produces Vue's own `[Vue warn]` lines on stderr (for example, the missing-render-function
  warning) that Ink has no analog for. While console patching is active (the default;
  disabled by `patchConsole: false` or `debug`, independent of interactive mode), vue-tui
  treats the `[Vue warn]` prefix as Vue's framework-diagnostics channel and drops those
  stderr lines. The patch is installed before the first mount (matching Ink, which patches
  before the first render), so a `setup()` throw during the **initial** mount is filtered
  too. With patching off, every `[Vue warn]` surfaces.
- **Why:** these warnings come from Vue itself and are **dev-only** (stripped in production
  builds); they never enter the stdout frame and do not change the exit path. Documented so
  the stray warn is not mistaken for vue-tui behavior: it is Vue's framework diagnostics.
  The prefix filter may also drop user-authored stderr logs that intentionally reuse the
  reserved `[Vue warn]` prefix; use a different application prefix when that output must be
  preserved. KEEP. [VOUCHED @hyf0]

#### React concurrent mode

- **Ink:** built on React; `useTransition` / `useDeferredValue` work as ordinary React
  hooks. Ink v7 also exposes a `concurrent?: boolean` render option (default `false`)
  with two distinct halves (run-verified vs v7.0.4): the root-tag half is inert — under
  the pinned reconciler (react-reconciler 0.33.0 / React 19) every root is overwritten to
  ConcurrentRoot, and hook/preemption probes behave identically in both modes — but the
  dispatch half is live: the default commits the first frame synchronously inside
  `render()` / `rerender()` (bytes reach stdout before the call returns), while
  `concurrent: true` schedules the commit asynchronously on a later tick.
- **vue-tui:** no equivalent — no such composables, and `MountOptions` has no
  `concurrent` flag. `mount()` commits the first frame synchronously, matching Ink's
  default dispatch.
- **Why:** React scheduling concepts with no Vue counterpart; N/A rather than a parity
  gap. The absent `MountOptions.concurrent` is this entry, not an unlisted difference:
  the one observable behavior the flag adds (deferring the first paint past the mount
  call) has no Vue-side demand, and vue-tui already matches Ink's default.

#### `<Transform>` treats all-comment children as no children

- **Ink:** `Transform` returns `null` only for `undefined` / `null` children. React's
  `false` child and a literal `[]` child are not nullish, so each creates an empty
  `ink-text` node that consumes a flex-gap slot, and in screen-reader mode that node
  still announces `accessibilityLabel` (a `false` or `[]` child with a label reads the
  label).
- **vue-tui:** after slot resolution, `null` / `false` / `undefined` / `v-if="false"` /
  a `false`-yielding `&&` all materialize as the same Comment vnode — React's
  `false !== null` edge has no Vue equivalent. `<Transform>` treats an absent slot, an
  all-comment slot, or an empty slot array (`() => []`) as no renderable children and
  returns `null`: the node is omitted, no gap slot is consumed, and a
  `<Transform accessibilityLabel>` whose children all resolve this way announces nothing
  in screen-reader mode (the guard runs before label substitution, as in Ink). Boundary
  parity: `''` and `0` children are text vnodes, not comments — both engines render a
  node (`''` takes a gap slot; `0` prints `0`) — and a Vue JSX `{[]}` child is a
  Fragment vnode that still renders a node, matching Ink; only the bare `() => []` slot
  collapses.
- **Why:** a child set that renders nothing equals omitting the child — letting
  framework anchors occupy layout slots would be worse than matching Ink's React-only
  `false !== null` edge, which Vue cannot see. The same forcing covers the screen-reader
  case: Ink announces the label for `false` but not `null` children; vue-tui sees
  identical comments, cannot honor both, and consistently takes the `null` side. The
  `() => []` collapse alone is **not** model-forced (Vue can see the empty array); it is
  a deliberate consistency rider — in each engine `() => []` and `() => [false]` behave
  alike (Ink renders a node for both, vue-tui omits both), and aligning only `[]` would
  create an asymmetry that exists in neither engine without reaching parity. KEEP. [VOUCHED @hyf0]
  Test: `transform.test.tsx`.

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
  KEEP. [VOUCHED @hyf0]

#### Removing `display` resets to the default (visible)

- **Ink:** `applyDisplayStyles` (`styles.ts`) calls `setDisplay(DISPLAY_NONE)` whenever the
  prop diff carries a `display` that is not `'flex'`, and Ink's reconciler diff emits a
  withdrawn key as `display: undefined`. So clearing a previously-set `display` (`'none'` or
  `'flex'` → removed) **hides** the box: Ink treats the withdrawn prop as `none`, neither
  keeping the prior value nor restoring the default. (A box that simply **omits** `display`
  stays visible — `'display' in style` is false, so no `setDisplay` runs; but an explicit
  `display={undefined}` is itself applied as `DISPLAY_NONE` and hides, like any non-`'flex'`
  value.) In the common toggle `display={hidden ? 'none' : undefined}`, Ink stays hidden on
  the `undefined` branch; you must set `display="flex"` to show it again.
- **vue-tui:** a removed/undefined `display` resets to the Box default `DISPLAY_FLEX`
  (visible): the same state as if the prop had never been set.
- **Why:** render = f(current props): no `display` set means the default (visible).
  Persisting a withdrawn prop, or flipping it to hidden, does not match that model. KEEP.
  [VOUCHED @hyf0]

#### Nullish `flexDirection` / `flexWrap` reset to Box defaults

- **Ink:** the public `<Box>` injects `flexDirection:'row'` and `flexWrap:'nowrap'` before
  spreading user style. If a previously-set prop is **truly omitted**, that default reaches
  the host and both engines reset (`column` -> omitted renders `"A\nB"` -> `"AB"`; `wrap`
  -> omitted stops wrapping). But an explicit `flexDirection={undefined}` / `{null}` or
  `flexWrap={undefined}` / `{null}` overwrites the default before the host layer. Ink's
  `applyFlexStyles` has no reset branch for these two props, so a dynamic nullish value
  preserves the previous Yoga value. On first mount, nullish `flexDirection` leaves Yoga's
  column default; nullish `flexWrap` happens to match nowrap.
- **vue-tui:** nullish current values reset to the public Box defaults (`row` / `nowrap`)
  in the same way as true omission (G19). A conditional spread that removes the key remains
  parity with Ink; a live binding whose value becomes `null` or `undefined` intentionally
  resets instead of preserving prior Yoga state.
- **Why:** render = f(current props): a Vue binding with no current `flexDirection` /
  `flexWrap` value means "use the Box default", not "keep whatever Yoga had last render".
  Preserving the prior value would make layout depend on history rather than current props.
  The cost is limited to explicit nullish public bindings; true omission remains Ink-parity.
  Tests: `prop-reset.test.tsx`.

#### Withdrawing a `margin`/`padding` edge override falls back to the surviving shorthand

- **Ink:** when a box has both a shorthand and a more-specific override of the same family
  (`margin={5} marginTop={8}`, `margin={5} marginX={2}`, padding equivalents) and the override
  is later withdrawn, the edge **collapses to 0**, not back to the surviving shorthand
  (run-verified vs v7.0.4, both spread-removal and explicit `marginTop={undefined}`: with
  `margin:5 marginTop:8` the top margin renders 8 cells, and after removing `marginTop` it
  renders **0**, not 5). The cause is yoga edge precedence — a per-edge value (`EDGE_TOP`)
  overrides the all-edges shorthand (`EDGE_ALL`) **even when reset to 0** — combined with
  Ink's `applyMarginStyles`/`applyPaddingStyles` emitting one yoga setter per prop, so a
  withdrawn `marginTop` becomes `setMargin(EDGE_TOP, 0)` that still beats the surviving
  `EDGE_ALL=5`.
- **vue-tui:** the withdrawn override falls back to whatever shorthand still applies
  (`marginTop` removed from `margin={5} marginTop={8}` → top margin = 5). On any margin/padding
  prop change, `reconcileMarginEdges`/`reconcilePaddingEdges` recompute **all four physical
  edges** from the box's full current props with most-specific-wins precedence
  (`top = marginTop ?? marginY ?? margin ?? 0`, etc.) and zero the composite edges, so no stale
  per-edge value can shadow the shorthand. This mirrors the existing `reconcileBorderEdges`
  pattern (an edge that depends on several props can't be set correctly by a single
  per-prop yoga setter).
- **Spacing value contract:** an edge resolves from a prop only when it is a **finite number**
  (matching the `number` prop type + Ink's number-only margin/padding); a numeric **string**
  (`margin="5"`) is coerced for Vue **static-template attribute** ergonomics, but any other
  non-numeric value (`"50%"`, junk, `""`) is treated as **not-set** and falls through to the
  surviving shorthand rather than being forwarded to yoga. So the family recompute drops the
  OLD per-setter code's incidental, off-contract string forwarding — `marginTop="50%"` no longer
  becomes a yoga percent and `marginTop="foo"` no longer throws.
- **Why:** render = f(current props): with current props `{margin: 5}` the top margin is 5, full
  stop — a value that is no longer set must not linger via yoga's edge layering (G19, the same
  declarative-reset principle as the `display` and `flexDirection`/`flexWrap` entries above).
  This is NOT an Ink-parity item: Ink and pre-fix vue-tui both collapsed to 0 (the identical
  bug); the fix diverges from Ink by being declaratively correct. Verified against
  yoga-layout@3.2.1 that the recompute produces identical computed edges as the old per-setter
  code for the SET path (no layout regression), and the correct fallback on removal.
  Tests: `prop-reset.test.tsx`, `unit/yoga-prop-reset.test.ts`.

#### Public composable naming follows Vue conventions

- **Ink/React:** public APIs are hooks (`useFocus`, `useInput`, ...), but return-type naming
  is mixed: the stream/app hooks return exported context types named `XProps` (`useStdin` →
  `StdinProps`, `useStdout` → `StdoutProps`, `useApp` → `AppProps`), newer hooks return
  exported non-`XProps` types — result-named (`useBoxMetrics` → `UseBoxMetricsResult`,
  `useAnimation` → `AnimationResult`) or a bare data name (`useWindowSize` → `WindowSize`) —
  and the rest fit neither: `useInput`/`usePaste` return `void`, `useFocus`/`useFocusManager`
  return an unexported type, `useCursor` an inline shape, `useIsScreenReaderEnabled` a bare
  `boolean`.
- **vue-tui:** public APIs are Vue **composables** (`useFocus`, `useInput`, ...). Where a
  composable's return type is exported under a name, the name always follows VueUse's
  `UseXReturn` convention (`UseAppReturn`, `UseStdinReturn`, `UseStdoutReturn`,
  `UseStderrReturn`, `UseAnimationReturn`, `UseBoxMetricsReturn`); the remaining composables
  return `void`, plain `boolean`, or small unexported inline shapes — never an `XProps`
  type. `XProps` is reserved for component props (`BoxProps`/`TextProps`, derived via
  `ExtractPublicPropTypes`).
- **Options types follow the same principle:** Ink names a composable's options type locally
  `Options` / `Props` and usually does **not** export it (e.g. `useAnimation`'s `Options` is
  internal — only the return `AnimationResult` is exported, `use-animation.ts:14,30`). vue-tui
  exports each composable's options type under VueUse's `UseXOptions` name: `UseInputOptions`,
  `UsePasteOptions`, `UseFocusOptions`, `UseAnimationOptions`. `useAnimation`'s options type
  originally shipped as `AnimationOptions` — the lone holdout — and was renamed to
  `UseAnimationOptions` (a hard rename, no alias) while the package is pre-1.0 (`0.0.x`, no
  stability promise yet). **Export composable options types
  as `UseXOptions`; renamed `AnimationOptions` → `UseAnimationOptions`.** [VOUCHED @hyf0]
- **Why:** the public surface should read like Vue code: named composable return types get a
  single convention (`UseXReturn`) instead of Ink's mix of `XProps`, result names, and bare
  names, and `XProps` keeps its Vue meaning (component props). Return shapes still mirror
  Ink field-for-field where the same public state exists; reactive state is represented as
  refs for the model-implied reason documented above. Do not export Ink-compatible alias
  names for these types: Vue-first naming is more important than making type imports look
  portable across React and Vue. KEEP. [VOUCHED @hyf0]

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
  returns one. KEEP. [VOUCHED @hyf0]

#### `<Static>` uses a scoped slot object instead of positional render arguments

- **Ink/React:** `<Static>` receives a function-as-children render callback and calls it as
  `render(item, absoluteIndex)`.
- **vue-tui:** `<Static>` exposes a Vue scoped slot with `{ item, index }`, so template
  users write `v-slot="{ item, index }"` and TSX users pass a slot function that receives
  one props object.
- **Why:** this is the framework-native match for React render children. Vue scoped slots
  pass one props object, not multiple positional arguments, and that object form is what
  Vue users expect for slot payloads. The rendered item/index values remain equivalent.
  KEEP. [VOUCHED @hyf0]

#### ARIA props are typed camelCase; kebab still works but is not type-checked

Full design, type-safety findings, and precedent survey: [accessibility-api](./accessibility-api.md).

- **Ink:** kebab string-literal prop keys (`'aria-label'`, `'aria-hidden'`, `'aria-role'` union,
  `'aria-state'` object); JSX keys never camelize.
- **vue-tui:** the same vocabulary as typed **camelCase** props (`ariaLabel`/`ariaHidden`/
  `ariaRole`/`ariaState`; `AriaRole`/`AriaState` exported, identical to Ink's). Ink's kebab still
  works at runtime (Vue camelizes onto the declared prop), so `aria-role` ports unchanged.
- **Why (Vue idiom + reasonableness > parity — see "Why align to Ink"):** Vue's `prop-name-casing`
  mandates camelCase, and — run-verified with `tsc`/`vue-tsc` — **camelCase is the only spelling
  type-checked** (value/typo/compound mistakes compile-error in both TSX and templates), while
  kebab `aria-*` is not (Vue/Volar treat it as a global attr). So `ariaRole` is the type-safe
  spelling and `aria-role` the runtime-only porting escape; the rejected kebab-only `$attrs`
  alternative loses typing + Boolean coercion for nothing the checker doesn't already give.
  KEEP. [VOUCHED @hyf0]
- **Edges:** a future compound aria word must be declared as its mechanical camelize
  (`ariaHaspopup`, not `ariaHasPopup`) or folded into `ariaState`; `aria-hidden` is modeled
  boolean (bare → true), but the string `aria-hidden="false"` wrongly hides (recorded edge).

## Intentional Divergence Choices

These divergences are deliberate, but they are not strict supersets and are not primarily
driven by Vue's framework model or API conventions. vue-tui intentionally chooses a
different runtime behavior, ownership rule, or out-of-contract handling.

### Non-`Error` thrown values: uniform show-the-error-and-reject

- **Ink:** accepts the throw, but its handling is **non-uniform** (run-verified vs v7.0.4):
  for a **truthy** non-`Error` it renders an `ErrorOverview` showing a string `.message`
  (**blank** for a bare string, since `'boom'.message` is `undefined`) **and RESOLVES**
  `waitUntilExit()` with the **raw** thrown value — a throw looks like a clean exit. For a
  **falsy** throw (`0` / `''` / `null`) it renders **no** overview and leaves
  `waitUntilExit()` **PENDING** (recoverable — a later unmount resolves it with `undefined`).
- **vue-tui:** **any** thrown value renders an `ErrorOverview` (message = a string `.message`
  if present, else `String(value)`) **and REJECTS** `waitUntilExit()` with an `Error` whose
  `.message` **EQUALS the displayed message** — one `messageForNonError(value)` helper feeds
  both the overview header and the reject-wrap, so display and reject can't drift (e17). No
  synthetic stack (a value with no `.stack` renders only the header).
- **Why:** aligning to Ink reduces bugs only where Ink is correct. Ink resolving the exit
  promise with a thrown value, and silently hanging on a falsy throw, are abnormal, so
  vue-tui deliberately diverges to one uniform contract: show the error, reject the exit. Same
  recover-vs-crash family as the invalid-input-validation divergence. Showing a real message
  (string `.message` else `String(value)`) is useful for the lint-discouraged non-`Error`
  throw, and matching the rejected message to it removes a confusing internal inconsistency
  (`throw {message:'x'}` once displayed `x` but rejected `[object Object]`). Introduced
  2026-05-31; consistency fixed 2026-06-12. KEEP. [VOUCHED @hyf0]

### Second `mount()` on a live stdout is an inert no-op

- **Ink:** `render()` keeps one instance per stdout (`WeakMap<WriteStream, Ink>`); a second
  `render(node, {stdout})` on a stream that already has a live instance warns on stderr but
  **reuses** that instance and `rerender`s the new tree into it.
- **vue-tui:** a second `mount()` on a still-live stdout warns on stderr, wires no second
  renderer, renders nothing, and returns an empty placeholder object (the real controls —
  `unmount()`, `waitUntilExit()` — live on the app, not on `mount()`'s return value). The
  first app's tree stays on screen. The skip is scoped to that one guarded call — derived
  from what the app actually wired, never sticky: a guarded _different_ app's `unmount()`
  settles only its own exit promise and never touches the owner's stream or registry entry;
  the _owner_ double-firing `mount()` on its own stdout keeps a fully working `unmount()`
  (the warning's recovery path); an app that once hit the guard can later mount — and
  cleanly unmount — on a free stdout; and a live app that merely targeted another app's
  busy stream stays fully killable.
- **Why:** a second `mount()` on a live stdout is a misuse (forgot to `unmount()`, a
  re-render glitch fired `mount()` twice, or expecting `mount()` to re-render — it doesn't;
  update reactive state for that). Ink treats it as unsupported and warns too. vue-tui fails
  safe: it ignores the second mount, keeps the live app rendering, and warns with the two
  recovery paths. It deliberately doesn't copy Ink's reuse-and-rerender: there's no clean
  public path to it (`createApp` binds the tree to the app, so an Ink-style rerender would
  mean reaching into the live app's container or tearing it down first), and on a misuse path
  keeping the running app stable beats auto-tearing it down (which would churn on a re-render
  glitch). KEEP. [VOUCHED @hyf0] Test: `instance-reuse-guard.test.tsx`.

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
  oscillation). KEEP. [VOUCHED @hyf0]

### `useCursor()` re-asserts the declared caret every commit (persistent declaration)

- **Ink:** `useCursor`'s no-deps `useInsertionEffect` (`use-cursor.ts:27-32`) re-marks the
  cursor dirty only when **the cursor's React component re-renders**, and log-update emits
  the caret only on a dirty commit. React's render cascade re-renders the child on an
  **ancestor**-driven commit (so Ink re-asserts there), but on an unrelated **sibling/leaf**
  repaint the cursor component does not re-render — Ink does **not** re-assert and the caret
  is dropped, **zombieing** to the bottom-left corner (run-verified vs v7.0.4: a sibling
  spinner tick ends `…> hello\n` with no caret suffix, leaving the caret at row 2 col 0).
- **vue-tui:** the runtime re-emits the **last-declared** caret at the **end of every
  commit** (until the declaration changes or is cleared), so a focused input's caret stays
  at its edit point across unrelated repaints (spinner / log line / progress bar) in **all**
  component topologies. The hide-before-erase / show-at-resolved-position flicker discipline
  is preserved (no corner streak), and the re-emitted position is clamped to the visible
  region (y to the line count, x to the width) so a post-resize/shrink stale coordinate
  never moves out of range.
- **Why:** this is a **deliberate divergence FROM Ink toward correct terminal-app
  behavior**, not Ink-alignment. Real terminal programs that own an edit point re-place the
  caret at that point **every frame** (vim emits `\e[<row>;<col>H` after each repaint;
  readline re-lands the buffer offset on SIGWINCH; nano homes to its edit cell) — they never
  leave the caret where the repaint dragged it. Aligning to Ink exists to reduce bugs, not to
  preserve abnormal behavior; matching Ink's topology-conditional zombie would preserve
  abnormal behavior, so vue-tui diverges. Per the classification flow this is **not** a
  Model-Implied difference (Vue is not _forced_ here — fine-grained reactivity could also be
  made to re-run the child; the runtime simply chooses to be more correct than Ink at the
  commit level), and it is not Vue-API-shaped, so it lands in **Intentional Divergence
  Choices**. The `{x,y}` `setCursorPosition` surface is **unchanged** — it remains the right
  low-level IME primitive (a composing glyph offset deliberately decoupled from the buffer
  point); the fix is an internal per-commit re-emit, so the public API stays compatible. A
  cleared declaration (`setCursorPosition(undefined)`, e.g. `useCursor`'s `onScopeDispose`
  on unmount) re-emits no caret, so teardown still ends with the cursor shown and handed back
  (`\x1b[?25h`); the persistent re-emit runs **before** the unmount clear, so it cannot
  resurrect a torn-down caret. The one accepted residue is a stale-but-in-range absolute
  position if an app declares a fixed `{x,y}` and then shrinks content without re-declaring
  (it parks at a plausible spot, strictly better than a corner-zombie); a future **Stage 2**
  focus-owned, content-tracking caret (recomputed from the focused widget's layout each
  frame) would dissolve that residue. Tests: PTY `cursor-sibling-repaint.test.ts` (a
  sibling-topology spinner tick re-asserts the caret, not the corner) and unit
  `frame-writer.test.ts` (a non-dirty changed-output re-render re-emits the declared suffix;
  D5 clamp). **OVERRIDE prior KEEP — adopt per-commit
  re-assert.** [VOUCHED @hyf0] The prior KEEP (2026-06-01) had kept the reactivity-tied behavior to avoid
  diverging from Ink in the sibling direction; that rationale was overturned when running
  real terminal apps showed Ink itself zombies the caret there, so matching Ink was matching
  a defect, not parity.

### Resize unconditionally cancels the pending trailing commit

- **Ink:** `resized()` paints synchronously via `onRender()` but does **not** cancel a
  pending throttled `onRender`; when that trailing commit re-runs and
  `shouldClearTerminalForFrame` clears (because the previous frame overflowed), Ink emits a
  **second** `clearTerminal`.
- **vue-tui:** `onResize` calls `scheduler.cancel()` as its **first, unconditional** step on
  **every** resize (not only narrowing ones), dropping any pending throttled commit before
  its synchronous commit, so the redundant trailing clear never fires.
- **Why:** the synchronous resize commit already reflects the current tree, so the pending
  commit would repeat the same clear. The dedup is triggered by an overflowing frame plus a
  pending commit — not by narrowing specifically; a widening resize cancels the pending
  commit too. Emitting one clear instead of two has no visible behavior difference
  (issue #26). The separate narrowing-only `writer.clear()` frame reset is a distinct
  mechanism.

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
  temporarily removes that Box's **in-flow** yoga children from the layout when either
  dimension is zero. Paint applies the same inner-content gate, so the in-flow child subtree
  neither reserves invisible rows nor writes glyphs outside a nonexistent content area.
  Border and background are still painted as far as the outer area permits.
  **Absolutely-positioned children are exempt** — their containing block is the padding box
  (inside the borders), not the content rect, so they still lay out and paint (clipped only
  by `overflow:hidden`), matching Ink. Positive-size content areas keep the
  existing overflow behavior; this is not a blanket `overflow:hidden`.
- **Layout model guidance:** primitive `Box` should preserve the Yoga/flexbox model rather
  than paper over it with ad-hoc layout corrections. Defaults such as `flexShrink: 1` are
  part of that model, and a child resolving to zero width or height can be a valid layout
  result. Higher-level components are where stronger user intent belongs: scroll, list, and
  viewport abstractions should keep their content at natural size (`flexShrink: 0`, or an
  equivalent encapsulated default) and let a bounded viewport clip or offset what is visible.
  Paint containment is the renderer invariant underneath both cases: whatever Yoga resolves,
  **in-flow** children may only paint inside their owning Box's content rectangle; if that
  rectangle has no positive width or height, the in-flow child subtree does not paint.
  Absolutely-positioned children are the exception — they paint against the containing block
  and are suppressed only by `overflow:hidden`, matching Ink.
- **Why:** children need a real content rectangle to lay out and paint into. If the
  resolved content width or height is zero, rendering child text or nested borders on top
  of the frame, outside the box, or on later rows is an implementation artifact, not useful
  output. This follows the common TUI box model: Ratatui renders child widgets into an
  inner `Rect`, Textual reduces content space from the assigned box, and Rich panels render
  children with child width/height after subtracting the border. Bubble Tea's viewport
  follows the same separation at the component level: content keeps its natural size while
  the viewport exposes a bounded visible window and offsets. The behavior also prevents
  negative repeat/count math and paint crashes in tiny legal boxes. KEEP. [VOUCHED @hyf0]
  Tests: `text-wrap-width.test.tsx`, `flex.test.tsx`,
  `text.test.tsx`, `absolute-in-degenerate-box.test.tsx`.
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
  accept (`space-*`/`auto` on `alignItems`) reach yoga rather than being ignored.
- **Why:** every one of these is reachable **only** via a TS-bypass. The public prop types
  forbid them. Within the typed contract Ink and vue-tui are identical. Ink's per-value
  coercion is defensive code for runtime values vue-tui's types already exclude. Duplicating
  those `typeof`/falsy guards would add checks for inputs the public types reject.
  (`flexGrow` is not in this set: both only coerce null/undefined -> `0`.) If a reviewer
  shows any case is reachable in-type, it becomes a bug to fix, not a divergence.

### Composables throw outside a render tree

- **Ink:** the hooks read a React context whose **default** value is a no-op object, so
  calling e.g. `useStdin()` outside an Ink tree returns inert defaults without an error.
- **vue-tui:** `useApp`, `useStdout`, `useStderr`, `useStdin`, `useWindowSize`,
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
  KEEP. [VOUCHED @hyf0]

### Invalid input is validated at the component layer, not the paint layer

- **Principle:** vue-tui validates the covered invalid render inputs — a
  chalk-**modifier** `backgroundColor` like `"bold"`, a foreground color key that exists
  on chalk but is not callable like `"level"`, and an unknown `borderStyle` — at the
  **component-render layer** (`box-validate.ts` for `<Box>`, `text.vue` for `<Text>`), not
  down at the **paint layer**. A bad
  value therefore throws where the **error boundary** catches it -> `ErrorOverview` -> a
  clean `reject` of `waitUntilExit()`, exactly like any other component error. The app
  reports the error instead of crashing.
- **Ink:** validates the same covered inputs **lazily at paint** (`colorize` /
  `render-border`, run from the reconciler's commit hook): **outside** React's
  ErrorBoundary, so a bad value is an uncaught crash, not a recoverable error.
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
  than a model-implied one. Provenance: the wedge claim rests on the earlier paint-throw
  investigation; the 2026-06-12 audit could not reach a paint throw from public or raw-host
  input (paint's `if (!chars) return;` border fallback intercepts an invalid `borderStyle`
  that bypasses component validation), so it stands on that prior record, not an in-audit
  reproduction.
- **Cost:** the component-layer check is eager (no paint-time layout/squash info), so it
  over-throws in a few degenerate, invalid-input-only cases Ink never reaches. For the
  covered public inputs in normal reachable cases, both libraries error; only the channel
  (recoverable reject vs crash) differs. KEEP. [VOUCHED @hyf0] vue-tui
  makes the more reliable library choice here: reject the same invalid input with a
  recoverable, prop-specific error instead of preserving Ink's lower-level paint crash and
  chalk implementation message. Tests: `background-color.test.tsx`, plus the `borderStyle`
  validation tests.
- **Text validates regardless of content:** `<Text>` now
  validates `color` and `backgroundColor` on every render, not only when its content is
  non-empty — matching `<Box>`, which already validates its own colors unconditionally. Ink
  does not throw for empty text only because its colorize call is lazy (an incidental
  implementation artifact, not a design choice); an invalid value is invalid regardless of
  content, and content-gated validation is a latent footgun. Principle: reasonable behavior
  over incidental Ink parity. The former `wouldRenderNonEmptyText` gate was removed.
  Screen-reader-hidden Text still returns before validation (matches Box). [VOUCHED @hyf0]

## Non-Behavioral Notes

These notes are not divergence entries. They document Vue-facing conventions or internal
mechanics so they are not mistaken for parity gaps.

- The exported host-node type is **`TuiNode`** (`TuiContainer | TuiTextLeaf | TuiComment`,
  from `@vue-tui/runtime/internal`), not Ink's DOM-emulation `DOMElement`
  (`nodeName` / `attributes` / `childNodes`). vue-tui keeps a native host tree, so the
  exported type names that tree; `measureElement` and template refs accept it. The type
  rename itself does not imply a runtime behavior difference from Ink's DOM-emulation node.
- `null` / `false` / `undefined` / `v-if="false"` children are materialized by Vue as
  comment vnodes, which vue-tui's host renderer turns into an inert `TuiComment`: no yoga
  node, paints nothing, never shifts a sibling, and skipped when counting child positions
  (the `child.type !== "comment"` guards in `paint.ts`, `text-measure.ts`, and
  `screen-reader.ts`; `G52`). This is renderer mechanics, not a divergence entry by
  itself. The observable `<Transform>` literal-`false` edge is documented above as a
  **model-implied divergence**.
- Commit timing is deliberately Ink-aligned: leading+trailing throttle at
  `Math.max(1, Math.ceil(1000/maxFps))` ms behind a `maxFps > 0` guard (34ms at the
  default `maxFps=30` — both engines compute exactly this), synchronous resize. The
  scheduler mirrors the observable timing of Ink's es-toolkit throttle (run-verified vs
  v7.0.4): the trailing timer re-arms on every deferred call, so the trailing commit
  fires at `lastCall+wait` (not `windowStart+wait`), and a call arriving a full window
  after the first deferral commits synchronously (es-toolkit's `maxWait`), keeping a
  ~`wait` cadence under sustained updates. This remains true even though re-renders come
  from Vue's fine-grained reactivity, not a React subtree re-render. One deliberate
  exception: resize cancels the pending trailing commit — see the divergence entry
  "Resize unconditionally cancels the pending trailing commit".
