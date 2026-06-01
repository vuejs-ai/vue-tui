# vue-tui — Intentional Divergences from Ink

> vue-tui started as a Vue 3 port of [Ink](https://github.com/vadimdemedes/ink), and it
> still tracks Ink closely — the aim is behavioral parity **except** where a difference is
> deliberate. But it is no longer _just_ a port: it has grown its own design decisions,
> additive features, and Vue-native choices. This document records the places vue-tui
> **intentionally** differs from Ink — by design, not as a gap to fix. A difference that is
> _not_ listed here is treated as a bug (or simply unverified), not a design choice.
>
> Reference baseline: Ink **v7.0.4** (commit `40b3a7578811fd616341ca4e31cc7748aeeff12f`).
> When bumping the target Ink version, re-validate every entry below against the new source.

## How to read this

Each entry states **what Ink does**, **what vue-tui does**, and **why** the divergence is
deliberate. Divergences fall into a few kinds:

- **API surface** — public API renamed/reshaped to fit Vue idioms.
- **Additive** — vue-tui supports something Ink doesn't (a strict superset).
- **Framework semantics** — a consequence of Vue ≠ React that cannot be papered over.
- **N/A** — a React-only concept with no Vue equivalent.

---

## Public API surface

### Entry point — `createApp()` instead of `render()`

- **Ink:** `render(<App/>, options?)` — `options` is `RenderOptions`; returns an `Instance`.
- **vue-tui:** `createApp(App)` returns a `TuiApp`; `app.mount(options?)` takes `MountOptions`.
- **Why:** mirrors Vue's own `createApp` mental model — a Vue developer expects an app
  object (`TuiApp`) they mount, not a one-shot render call. The mount-options bag and the
  app handle are therefore Vue-shaped (`MountOptions` / `TuiApp`), not `render()`-shaped
  (`RenderOptions` / `Instance`).

### Host-node type — `DOMElement` → `TuiNode`

- **Ink:** exports `DOMElement`, a DOM-emulation node (`nodeName` / `attributes` /
  `childNodes`).
- **vue-tui:** the host tree is a different representation
  (`TuiContainer | TuiTextLeaf | TuiComment`), exported as **`TuiNode`** from
  `@vue-tui/runtime/internal`.
- **Why:** vue-tui's renderer keeps a native host-node tree rather than a DOM emulation,
  so the exported node type names that tree, not a DOM node.

### `useFocusManager().activeId` empty value is `null`, not `undefined`

- **Ink:** `useFocusManager().activeId` is a `string` and `undefined` when nothing is focused.
- **vue-tui:** `activeId` is a **`ShallowRef<string | null>`** — reactive, and `null` (not
  `undefined`) when nothing is focused.
- **Why:** vue surfaces focus state as a reactive ref so a template re-renders when focus
  moves, and `null` is vue-tui's house convention for an empty ref (a deliberate "no value",
  distinct from an unset `undefined`). Field meaning is unchanged. Test:
  `focus-manager.test.tsx` ("activeId is null when nothing is focused").

### Second `mount()` on a live stdout is an inert no-op

- **Ink:** `render()` keeps one instance per stdout (`WeakMap<WriteStream, Ink>`); a second
  `render(node, {stdout})` on a stream that already has a live instance warns on stderr but
  **reuses** that instance and `rerender`s the new tree into it.
- **vue-tui:** a second `mount()` on a still-live stdout warns on stderr and returns an
  **inert handle** — it wires no second renderer and renders nothing; the first app's tree
  stays on screen. `unmount()`/`teardown()` on that handle are complete no-ops (they never
  touch the owner's stream or registry entry).
- **Why:** a direct consequence of the `createApp()`-vs-`render()` model — an app is an object
  you `mount()`, not a one-shot call that doubles as a re-render. "Re-render the live instance"
  has no place to land when the second call is a separate `TuiApp`; the correct path is
  `unmount()` then mount again (or keep one app and update its reactive state). Failing closed
  (no competing renderer on the shared stream) over silently hijacking the output is the
  principled choice. Test: `instance-reuse-guard.test.tsx`.

### Package `.` exports use a bare-string target, not an explicit `types` condition

- **Ink:** `package.json` `exports` uses an explicit `types` condition (`{"types": …,
"default": …}`).
- **vue-tui:** runtime/testing `.` (and `./internal`) exports are a **bare string**
  (`"./dist/index.mjs"`) — TS resolves the declaration via the `.d.mts`-next-to-`.mjs`
  adjacency tsdown emits (`index.d.mts` beside `index.mjs`).
- **Why:** with the adjacency present, an explicit `types` condition is redundant. Noted so a
  future reader does **not** "restore parity" by adding a `types` condition the toolchain
  already satisfies. (The `cli` package needs no `types` at all — it has no public type surface.)

## Additive features (vue-tui is a strict superset)

### Multiple `<Static>` regions

- **Ink:** keeps a single `staticNode`; only one `<Static>` is honored.
- **vue-tui:** `findStatics(root)` renders **every** `<Static>` in the tree.
- **Why:** strictly more capable — a tree with two `<Static>` regions both render.
  Maintainer decision (2026-05-30): KEEP.

### Ctrl+C exits under the kitty protocol too

- **Ink:** exits only on the legacy `\x03` byte (in `App`), so a kitty-protocol Ctrl+C
  (`\x1b[99;5u`) parses fine but never exits — its guard is byte-specific, not Ctrl+C-specific.
- **vue-tui:** one encoding-agnostic exit in the always-on stdin controller (`emitInput`), via
  `parseKeypress` — matches Ctrl+C in both the legacy and kitty forms (but not Ctrl+Shift+C), so
  it fires no matter which composable holds raw mode (`useInput` / `useFocus` / `usePaste`, or none).
- **Why:** `exitOnCtrlC` is a contract that shouldn't depend on the wire encoding; keeping the lone
  exit at the single always-on layer avoids a two-place seam. Opt out with `exitOnCtrlC: false`.
  Maintainer decision (2026-05-30): KEEP. Tests: `usePaste-only app exits on {legacy,kitty} Ctrl+C`
  in `input-kitty.test.ts`.

### `parseKeypress` filters kitty query-responses (second safety net)

- **Ink:** filters kitty keyboard-protocol query-responses (`ESC[?Nu`) in exactly **one** place —
  the auto-detection lifecycle in `ink.tsx` (`stripKittyQueryResponsesAndTrailingPartial` on a
  private `onData` buffer). Its `parse-keypress.ts` has no query-response branch.
- **vue-tui:** mirrors that detection layer (in `kitty-keyboard.ts`) **and** adds a second net —
  `parseKeypress` returns `{ ignore: true }` for `ESC[?Nu`, which `useInput` then drops.
- **Why:** the detection layer does **not** cover the real input pipeline (`stdin 'data'` →
  `inputParser` → `emitInput` → `useInput` → `parseKeypress`). In `enabled` mode it never runs;
  in `auto` mode its `onData` listener and the stdin controller's `handleData` both subscribe to
  the same `'data'` event, so stripping its private buffer can't stop the chunk reaching
  `handleData`; and after detection settles the listener is gone. Empirically (Layer 2 removed,
  rebuilt) a stray query-response reaches a `useInput` handler as spurious `"[?1u"` input in all
  of those cases — including a response split across two reads, which `inputParser` reassembles
  before dispatch. So this is load-bearing, not redundant. Introduced 2026-05-31. Tests: "kitty
  query-response - end-to-end filtering" in `kitty-lifecycle.test.ts` (RED without it).

### Non-`Error` thrown values keep their message in the error overview

- **Ink:** `ErrorOverview` renders `error.message`; a thrown non-`Error` (`throw 'boom'`) has no
  `.message`, so the overview shows a blank message.
- **vue-tui:** the error boundary keeps the **raw** thrown value and `ErrorOverview` shows
  `String(value)` as the message, so `throw 'boom'` renders ` ERROR  boom`, not a blank
  `ERROR`. Like Ink, no stack block is rendered when the value carries no stack.
- **Why:** strictly more informative for the (lint-discouraged) non-`Error` throw, and it keeps
  the message vue-tui already surfaced before — when the boundary wrapped such throws in
  `new Error(String(value))`, which also produced a misleading synthetic stack pointing at the
  framework internals (that synthetic stack is now gone). Introduced 2026-05-31.

### RGB `[r, g, b]` tuples on every color prop

- **Ink:** all color props (`<Text>` color/backgroundColor, `<Box>` backgroundColor, and every
  border color/background prop) are **string-only** — `colorize`/`stylePiece` call
  `color.startsWith('#')`, so passing an array **throws** (`.startsWith` is not a function).
- **vue-tui:** the public `Color` type is `string | [number, number, number]`; `applyColor`
  handles an array via `chalk.rgb(...)` / `chalk.bgRgb(...)`. Accepted uniformly on Text color,
  Text/Box backgroundColor, and all border color/background props.
- **Why:** a strict superset — every string Ink accepts still works, plus an ergonomic RGB
  tuple. The tuple is part of the typed surface (not a TS-bypass), so it's a supported input,
  not undefined behavior. Tested.

### `backgroundColor` of a chalk modifier name degrades to bare text

- **Ink:** `backgroundColor='bold'` (any chalk **modifier** name, not a color) resolves
  `isNamedColor('bold')` true (`'bold' in chalk`), then calls `chalk['bgBold']` — which doesn't
  exist — and **throws** ("chalk.bgBold is not a function").
- **vue-tui:** `applyColor`'s `typeof named === 'function'` guard sees `chalk['bgBold']` is
  `undefined`, falls through `#`/`ansi256`/`rgb` (all non-matching), and returns the text
  **unstyled** — no SGR, no throw.
- **Why:** same fallback policy vue already applies to an unparseable `ansi256(...)`/`rgb(...)`
  string ("no match → bare text"). A non-color background name is junk input; degrading to bare
  text is more robust than crashing the render. Additive robustness.

### `useAnimation()` outside a render tree drives a real standalone animation

- **Ink:** the default `AnimationContext.subscribe()` is a no-op (`{startTime: 0,
unsubscribe(){}}`) — a `useAnimation` rendered outside an Ink tree never ticks.
- **vue-tui:** `useAnimation` falls back to a freshly created standalone scheduler
  (`inject(AnimationSchedulerKey, null) ?? createAnimationScheduler()`), so `frame`/`time`/
  `delta` actually advance even with no surrounding app.
- **Why:** graceful degradation over a silent dead animation — the composable still does
  something useful in isolation (e.g. a unit test, or a non-rendered driver). Additive; inside
  a tree the injected scheduler is used exactly as Ink's. (Contrast with the terminal-bound
  composables in the fail-fast section, which throw — those have no meaningful standalone mode.)

### `measureElement` / `useBoxMetrics` also accept a Vue component-instance ref

- **Ink:** `measureElement(node: DOMElement)` and `useBoxMetrics(ref: RefObject<DOMElement>)`
  read `node.yogaNode` directly — a host `DOMElement` only.
- **vue-tui:** the ref is resolved through `$el` as well — a `ref` bound to a **Vue component**
  (whose root host node is on `$el`), not just a host-node ref, resolves to the underlying yoga
  node.
- **Why:** in Vue a template ref on a component yields the component instance, and its host node
  is reached via `$el`. Supporting both shapes is a strict superset that matches how Vue refs
  actually behave; a bare host-node ref still works identically to Ink.

### `renderToString` supports screen-reader mode

- **Ink:** `renderToString` has only a `columns` option; it always renders the non-SR (ANSI)
  frame.
- **vue-tui:** `renderToString` accepts `isScreenReaderEnabled?: boolean`. In SR mode it returns
  the linearized accessibility text (`renderScreenReaderOutput`) and prepends the linearized
  `<Static>` output, just as the non-SR path prepends the painted static frame.
- **Why:** vue-tui already has a parity SR renderer for the live path; surfacing it through the
  string API is a strict superset (default `false` is byte-identical to Ink) and avoids
  silently dropping `<Static>` content when generating SR snapshots. Additive.

### Narrowing resize cancels the redundant trailing `clearTerminal`

- **Ink:** `resized()` paints synchronously via `onRender()` but does **not** cancel a pending
  throttled `onRender`; on a narrowing resize that trailing commit re-runs and, because
  `shouldClearTerminalForFrame` clears whenever the previous frame overflowed, Ink emits a
  **second** `clearTerminal`.
- **vue-tui:** `onResize` calls `scheduler.cancel()` before its synchronous commit, dropping the
  now-redundant trailing commit — so the screen is cleared **once** per narrowing resize.
- **Why:** the synchronous resize commit already reflects the current tree, so the pending
  commit is pure duplication; emitting one clear instead of two is strictly cleaner with no
  visible difference (issue #26). Additive robustness.

### Two apps sharing one stdin both receive input

- **Ink:** raw-mode count and the input listener are **per-`App`** (`useRef`), and Ink reads via
  the `'readable'` event + `stdin.read()` (pull, `App.tsx:278-313`). Two `render()`s to different
  stdout but one stdin each attach a `readable` listener, but the first-registered listener's
  `read()` loop **drains** the buffer every tick, so the second app stays **deaf** until the first
  unmounts (it self-heals then). And because counts are per-`App`, the first app's unmount calls
  `stdin.setRawMode(false)`, dropping raw mode while the second still needs it.
- **vue-tui:** the terminal raw-mode toggle is refcounted **per-stdin** (a shared `WeakMap`), so one
  app's unmount can't drop raw mode while another holds it; and the `'data'` input listener is
  **per-controller** — each app attaches its own `handleData` → own parser → own emitter. Since
  `'data'` (push) broadcasts to **every** listener, both apps receive every keystroke, and the
  second keeps receiving after the first unmounts.
- **Why:** strictly more correct for a combination vue-tui already allows (two `createApp`s to
  different stdout — cf. the same-stdout no-op above is keyed on stdout, not stdin). The push model
  has no drain race, and a shared raw-mode refcount is the right ownership model when several
  renderers share one input. Rare in practice (the common one-app→terminal flow never hits it;
  realistic only for stdout+stderr both-interactive, or an embedding host), so it's robustness, not
  a headline feature. Single-app behavior is byte-identical (one controller's `localRefs` ≡ the
  shared `refs`). Test: `raw-mode-lifecycle.test.tsx` ("two apps sharing one stdin both receive
  input…").

## Framework-semantic divergences (Vue ≠ React)

### Removing `flexDirection` / `flexWrap` resets to the default

- **Ink:** these two props have no reset branch in `applyFlexStyles` (every _other_ flex prop
  does), so an explicit `flexDirection={undefined}` leaves the previous value in place.
- **vue-tui:** resets to the Box default (`row` / `nowrap`) — the same state as if the prop
  had never been set.
- **Why:** the render is a function of the current props — with no value set you get the
  default, and (absent a special contract) dropping or changing a prop changes the output.
  Keeping a previous render's value, as Ink does for these two props, is the anomaly — and an
  inconsistent one, since every other flex prop resets. Maintainer decision (2026-05-30): KEEP.

### Removing `display` resets to the default (visible)

- **Ink:** `applyDisplayStyles` (`styles.ts`) sets `DISPLAY_NONE` whenever an explicit
  `display` is present and not `'flex'` — so a present-but-undefined `display={undefined}`
  **hides** the box, and an omitted `display` **persists** the prior value.
- **vue-tui:** a removed/undefined `display` resets to the Box default `DISPLAY_FLEX`
  (visible) — the same state as if the prop had never been set.
- **Why:** same reasoning as the `flexDirection`/`flexWrap` reset above — render =
  f(current props): no `display` set → the default (visible). Persisting a withdrawn prop,
  or flipping it to hidden, is the anomaly. Maintainer decision (2026-05-31): KEEP.

### `useCursor()` re-assertion follows fine-grained reactivity, not React's render cascade

- **Ink:** `useCursor`'s no-deps `useInsertionEffect` (`use-cursor.ts:27-32`) re-runs on every
  render **of the cursor component**, re-marking the cursor dirty (`ink.tsx:494-497`); log-update
  resets `cursorDirty` each commit. React re-renders a whole subtree when an ancestor commits, so
  if the cursor component is in that subtree it re-renders and the cursor is re-asserted — even
  when only an ancestor's unrelated state changed. (If an _unrelated sibling_ owns the changing
  state, the cursor component does **not** re-render, so Ink does **not** re-assert and the cursor
  is dropped that commit.)
- **vue-tui:** `useCursor` propagates via `watch(positionRef, …, {flush:'sync'})` — it re-asserts
  when the position **reference changes** (or the owning component re-renders and re-sets it). Vue's
  fine-grained reactivity re-runs only components whose own deps changed, so an _ancestor_-driven
  commit does **not** re-run a cursor child that didn't depend on the changed value, and a
  set-once cursor is dropped that commit.
- **Why:** the two agree for the **recommended** usage — set the position reactively (in the render
  body / from a ref the component reads), as Ink's apps and vue-tui's parity tests do — and they
  agree in the unrelated-sibling case (both drop). They differ only in the narrow edge of a
  **set-once** cursor plus an **ancestor-driven** commit: React's render cascade re-asserts it,
  Vue's fine-grained reactivity does not. This is a direct consequence of Vue ≠ React (cascade vs
  fine-grained re-render) and cannot be papered over: a global per-commit re-assert would make vue
  diverge from Ink in the _opposite_ (unrelated-sibling) direction, where Ink drops the cursor.
  Keep the reactivity-tied behavior. Maintainer decision (2026-06-01): KEEP.

### An off-spec `display` value stays visible instead of hiding

- **Ink:** `applyDisplayStyles` sets `DISPLAY_NONE` for **any** present `display` that isn't
  `'flex'` — so a typo or off-spec value (`display="block"`, `display=""`, reachable via a
  TS-bypass) **hides** the box.
- **vue-tui:** `toDisplay` hides only on the exact value `'none'`; every other value (including
  off-spec) falls back to the visible default `DISPLAY_FLEX`.
- **Why:** an unknown/typo `display` shouldn't silently delete content — failing visible is the
  safer default. It's also consistent with the removal-reset above: a withdrawn `display` returns
  to visible, and so does an unrecognized one. (The only honored hide is the documented `'none'`.)

### Out-of-type style values are forwarded, not defensively coerced

- **Ink:** several flex/align setters coerce a runtime junk value to a default — `flexShrink`
  non-number → `1`; `alignItems`/`alignSelf`/`alignContent`/`justifyContent` falsy (`""`) →
  their default (STRETCH / AUTO / FLEX_START); and an out-of-set value matches none of Ink's
  `if`-chain branches, so no setter runs and the previous/default value persists.
- **vue-tui:** these setters trust the typed prop surface and forward the raw value to yoga:
  a non-number `flexShrink` is passed through; `toAlign("")`/`toJustify("")` look up `""` and
  pass `undefined` to the setter; and out-of-set values that yoga happens to accept
  (`space-*`/`baseline`/`auto` on `alignItems`) reach yoga rather than being ignored.
- **Why:** every one of these is reachable **only** via a TS-bypass — the public prop types
  forbid them. Within the typed contract Ink and vue-tui are identical. Ink's per-value
  coercion is defensive code for runtime junk vue-tui's types already exclude; duplicating a
  family of `typeof`/falsy guards for inputs the type system rejects buys nothing. (`flexGrow`
  is not in this set — both only coerce null/undefined → `0`.) If a reviewer shows any case is
  reachable in-type, it becomes a bug to fix, not a divergence.

### Duplicate explicit-`id` `useFocus` calls dedup to one registry entry

- **Ink:** `addFocusable` unconditionally appends, so two `useFocus({id: 'x'})` create **two**
  focusables with the same id — Tab visits "x" twice, and unmounting one calls `removeFocusable`
  which filters by id and removes **both**.
- **vue-tui:** `add(id)` is id-keyed (`if (!focusables.some(f => f.id === id))`), so a duplicate
  explicit id registers **one** entry.
- **Why:** an id-keyed registry is the principled model — an id identifies one focusable, so Tab
  visiting a duplicate twice and one unmount silently dropping the other are Ink anomalies, not
  contracts. Auto-generated ids never collide, so this only differs for an explicit duplicate id
  (already a user error).

### Composables fail fast outside a render tree

- **Ink:** the hooks read a React context whose **default** value is a no-op object, so calling
  e.g. `useStdin()` outside an Ink tree returns inert defaults silently.
- **vue-tui:** `useApp`, `useStdout`, `useStderr`, `useStdin`, `useTerminalSize`, `useFocus`,
  `useFocusManager`, `useInput`, `usePaste`, `useCursor`, and `useIsScreenReaderEnabled`
  **throw** when their context is absent ("… must be called inside a vue-tui render tree").
  (`useBoxMetrics` and `useAnimation` do **not** throw — they degrade: `useBoxMetrics` reports
  zero metrics, `useAnimation` drives a real standalone scheduler. See the additive entry.)
- **Why:** fail-fast beats a silent footgun — a composable used in the wrong place is a bug, and
  a thrown error names it at the call site instead of returning a context that quietly does
  nothing. The two exceptions degrade because they have a meaningful standalone behavior (a
  measurable-zero / a working animation), so throwing would remove a useful capability.

### A `setup()`-throwing component emits a dev-only `[Vue warn]` on stderr

- **Ink:** a component that throws during render surfaces only through the error overview /
  exit path; React emits no extra framework warning.
- **vue-tui:** in a **development** build, a component whose `setup()` throws additionally
  produces Vue's own `[Vue warn]` lines on stderr (e.g. the missing-render-function warning)
  that Ink has no analog for. In interactive mode patchConsole filters `[Vue warn]` out of the
  frame; outside that path (debug, non-patched stderr) it surfaces.
- **Why:** these warnings come from Vue itself and are **dev-only** (stripped in production
  builds); they have no effect on stdout output or the exit code. Documented so the stray
  warn isn't mistaken for a vue-tui behavior — it's Vue's framework diagnostics.

## Not applicable in Vue

### React concurrent mode

- **Ink:** built on React; Suspense / `useTransition` are React features.
- **vue-tui:** no equivalent — N/A, not a gap.

## Framework idioms (noted, not behavioral divergences)

Surface conventions, listed so they aren't mistaken for gaps:

- Vue **composables** (`useFocus`, `useInput`, …) instead of React **hooks**.
- Composable **return types** follow VueUse's `UseXReturn` convention (`UseStdinReturn`,
  `UseAppReturn`, …) — Ink names the equivalent hook-return types `XProps` (`StdinProps`,
  `AppProps`, …), but in vue-tui `XProps` is reserved for component props (`BoxProps`,
  derived via `ExtractPublicPropTypes`). The return shapes still mirror Ink field-for-field
  (e.g. `useStdin()` exposes only Ink's public `{ stdin, setRawMode, isRawModeSupported }`).
- `<script setup>` SFCs / `defineComponent` instead of function components.
- kebab-case filenames; `.ts` over `.tsx` where there's no JSX.
- `shallowRef` by default for reactive state.

Reconciler/runtime mechanics that differ from React internally yet produce **byte-identical**
terminal output, because a commit always paints `f(current host tree)` — _how_ the tree was
built never reaches the terminal:

- **A `v-if=false` branch (or a `null`/`false`/`undefined` child) leaves a comment anchor
  (`TuiComment`)** where Ink emits no node, but it is inert: no yoga node, paints nothing,
  never shifts a sibling's yoga index, and is skipped for the positional `<Transform>` index
  in all three squash paths (`G52`). Output equals omitting the element. This also governs
  `<Transform>`'s own children guard: a childless `<Transform>` (or one whose only child is a
  `null`/`false`/`v-if=false` comment anchor) renders **no node** (matching Ink for `null`,
  consistent with every other component). It diverges from Ink only for a literal `{false}` /
  `{cond && x}`-false child — React's `false !== null`, so Ink renders an empty node (and a gap
  slot); Vue collapses `false`/`null` to the same `TuiComment` and cannot distinguish them, so
  it omits the node. Keeping `<Transform>` consistent with the comment-anchor model is the
  principled choice.
- **Commit timing is deliberately Ink-aligned** — leading+trailing throttle at
  `ceil(1000/maxFps)` ≈ 32 ms (Ink's `renderThrottleMs`), synchronous resize — even though
  re-renders are Vue's fine-grained reactivity, not a React subtree re-render.
- **Keyed lists use Vue core's `patchKeyedChildren`** (LIS), not React's fiber diff; output
  depends on the final tree, not the move order.
- **`wrapText` truncate has a per-line short-circuit** before its whole-string `cli-truncate`:
  if every `\n`-split line already fits `width` it returns the lines unchanged, otherwise it
  truncates the whole string once (as Ink does). Ink instead gates at paint time on the
  **widest line** (`widestLine(text) > maxWidth`) before calling `wrapText`, which then
  whole-string-truncates with no per-line check. The two paint-time gates (vue's per-line
  `every`, Ink's widest-line) admit the same multi-line texts in practice, so production output
  matches — documented so the divergent short-circuit branch isn't "fixed" to bare whole-string
  truncate (which would collapse perfectly-fitting multi-line text to one line).
- **The animation scheduler rounds the `setTimeout` delay up** (`Math.ceil(earliest - now)`)
  where Ink passes the raw fractional delay. `setTimeout` truncates a fractional delay and would
  fire early, re-skip (`now < nextDueTime`), and reschedule a ~0 ms delay — a sub-ms busy-loop.
  Non-behavioral (Node coerces the delay to an int anyway); the in-code comment explains it.

---

## Maintainer additions

_Space for divergences to add or refine. For each, capture: **what Ink does**, **what
vue-tui does**, and **why** it's deliberate (the trade-off, not just the what)._

-
