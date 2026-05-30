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

- **Ink:** `render(<App/>)`.
- **vue-tui:** `createApp(App).mount(options)`.
- **Why:** mirrors Vue's own `createApp` mental model — a Vue developer expects an app
  object they mount, not a one-shot render call.

### Named type / prop re-exports

- **Ink:** re-exports its component prop types plus a few data/handle types:
  `BoxProps`, `TextProps`, `StaticProps`, `TransformProps`, `NewlineProps`,
  `WindowSize`, `CursorPosition`, `DOMElement`, `RenderOptions`, `Instance`,
  `AppProps`, `StdinProps`, `StdoutProps`, `StderrProps`.
- **vue-tui:** re-exports the framework-neutral ones under the **same names** —
  `BoxProps`, `TextProps`, `StaticProps`, `TransformProps`, `NewlineProps`,
  `WindowSize` (`{ columns, rows }`) and `CursorPosition` (`{ x, y }`). These are
  **not** divergences: a `<Box>` has props in Vue exactly as in React, so the names
  carry over. They are derived from the runtime `props` objects via Vue's
  `ExtractPublicPropTypes`, so they never drift from the components' real props.
  Only the remaining few genuinely differ, each for a concrete reason — never merely
  to "avoid React-shaped names":
  - `DOMElement` → **`TuiNode`**. The one genuinely DOM-shaped type: Ink's
    `DOMElement` models a DOM-emulation node (`nodeName` / `attributes` /
    `childNodes`). vue-tui's host tree is a different representation
    (`TuiContainer | TuiTextLeaf | TuiComment`), exported as `TuiNode` from
    `@vue-tui/runtime/internal`.
  - `RenderOptions` / `Instance` → **`MountOptions`** / **`TuiApp`**. Downstream of
    the `createApp()` entry above — vue-tui mounts a Vue app, so the options bag and
    the returned handle are Vue-shaped, not `render()`-shaped.
  - `AppProps` / `StdinProps` / `StdoutProps` / `StderrProps` → **N/A**. These are the
    props of Ink's internal React _context-provider components_ (`<AppContext>`,
    `<StdinContext>`, …). vue-tui has no such components — that state is reached via
    `createApp` plus the `useStdin` / `useStdout` / `useStderr` composables — so there
    is nothing to name.
- **Why:** the earlier blanket "expose a Vue-native type surface, don't leak
  React-shaped names" over-reached — it withheld names like `BoxProps` that have no
  React vs Vue content at all. The rule is narrower: mirror Ink's names wherever the
  underlying type is framework-neutral; reshape only where Vue genuinely has a
  different thing (a host node, a mounted app) or no thing at all.

## Additive features (vue-tui is a strict superset)

### Multiple `<Static>` regions

- **Ink:** keeps a single `staticNode`; only one `<Static>` is honored.
- **vue-tui:** `findStatics(root)` renders **every** `<Static>` in the tree.
- **Why:** strictly more capable — a tree with two `<Static>` regions both render.
  Maintainer decision (2026-05-30): KEEP.

### Ctrl+C exits under the kitty protocol too

- **Ink:** wires `exitOnCtrlC` only to the legacy `\x03` path, so a kitty-protocol Ctrl+C
  (`\x1b[99;5u`) does **not** exit.
- **vue-tui:** `useInput` exits on `input === 'c' && key.ctrl`, gated on `exitOnCtrlC`
  (default `true`), so Ctrl+C exits under **both** legacy and kitty protocols.
- **Why:** `exitOnCtrlC` reliably exiting under all protocols is the intended behavior; opt
  out with `exitOnCtrlC: false`. Maintainer decision (2026-05-30): KEEP.

## Framework-semantic divergences (Vue ≠ React)

### Removing `flexDirection` / `flexWrap` resets to the default

- **Ink:** `applyFlexStyles` has no `undefined` branch for `flexDirection`/`flexWrap`, so an
  explicit `flexDirection={undefined}` leaves the yoga node's **stale** value in place. (For
  an _omitted_ prop, Ink's `<Box>` re-applies its `row`/`nowrap` default before the style
  spread.)
- **vue-tui:** resets `flexDirection`/`flexWrap` to the Box default (`row`/`nowrap`) when the
  prop is removed across renders.
- **Why:** **Vue cannot distinguish** an omitted prop from an explicit `undefined` — both
  collapse to the prop's default — so vue-tui must pick one behavior. It matches Ink's
  **common** case (omitted → `row`/`nowrap`) and the Vue-idiomatic expectation (drop the
  override → get the default). The residual difference (explicit `={undefined}` → vue-tui
  resets, Ink keeps stale) is an unavoidable Vue-vs-React semantic. Maintainer decision
  (2026-05-30): KEEP.

### Other Vue-vs-React semantics _(placeholder)_

- _(maintainer: candidates to document — `v-if`/`null` rendering as comment host nodes;
  reactivity-driven re-render timing vs React's render cycle; keyed reconciliation order.
  Add the ones that are genuinely by-design.)_

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

---

## Maintainer additions

_Space for divergences to add or refine. For each, capture: **what Ink does**, **what
vue-tui does**, and **why** it's deliberate (the trade-off, not just the what)._

-
