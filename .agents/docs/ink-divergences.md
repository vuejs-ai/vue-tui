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

## Not applicable in Vue

### React concurrent mode

- **Ink:** built on React; Suspense / `useTransition` are React features.
- **vue-tui:** no equivalent — N/A, not a gap.

## Framework idioms (noted, not behavioral divergences)

Surface conventions, listed so they aren't mistaken for gaps:

- Vue **composables** (`useFocus`, `useInput`, …) instead of React **hooks**.
- `<script setup>` SFCs / `defineComponent` instead of function components.
- kebab-case filenames; `.ts` over `.tsx` where there's no JSX.
- `shallowRef` by default for reactive state.

Reconciler/runtime mechanics that differ from React internally yet produce **byte-identical**
terminal output, because a commit always paints `f(current host tree)` — _how_ the tree was
built never reaches the terminal:

- **A `v-if=false` branch (or a `null`/`false`/`undefined` child) leaves a comment anchor
  (`TuiComment`)** where Ink emits no node, but it is inert: no yoga node, paints nothing,
  never shifts a sibling's yoga index, and is skipped for the positional `<Transform>` index
  in all three squash paths (`G52`). Output equals omitting the element.
- **Commit timing is deliberately Ink-aligned** — leading+trailing throttle at
  `ceil(1000/maxFps)` ≈ 32 ms (Ink's `renderThrottleMs`), synchronous resize — even though
  re-renders are Vue's fine-grained reactivity, not a React subtree re-render.
- **Keyed lists use Vue core's `patchKeyedChildren`** (LIS), not React's fiber diff; output
  depends on the final tree, not the move order.

---

## Maintainer additions

_Space for divergences to add or refine. For each, capture: **what Ink does**, **what
vue-tui does**, and **why** it's deliberate (the trade-off, not just the what)._

-
