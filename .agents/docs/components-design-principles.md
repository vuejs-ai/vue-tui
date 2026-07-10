# @vue-tui/components — Design Principles & Conventions

> AI-accumulated working notes (unstamped lines are challengeable — see PCR provenance).
> This is **not** a contribution checklist: each component's actual API is decided in its own
> issue, not here. It records how components in `@vue-tui/components` should be _shaped_ and
> _styled_, and the bar for adding one in the first place.
>
> **Status:** active — the package now ships `ScrollBox` and `Spinner` (see per-component
> records below). The principles here are design intent for the package as a whole.
>
> **Per-component records:** [scroll-box](./components/scroll-box.md), [spinner](./components/spinner.md).

**The governing idea:** components in `@vue-tui/components` are **pure compositions of
`@vue-tui/runtime` primitives**. The runtime owns the terminal-I/O and layout/commit boundary;
this package owns everything you can build by arranging `Box` / `Text` / `Static` / `Transform`
and reacting to the public composables. Every principle below follows from that one.

## What this package is — and isn't

`@vue-tui/runtime` ships the primitives and the I/O composables; `@vue-tui/components` ships the
higher-level components built _only_ out of them. The
authoritative list of what the runtime exposes is its public barrel — see
[api-contract.md](./api-contract.md) (snapshotted by `public-api.test.ts`). This doc does not
re-enumerate it: a second copy would drift.

## Inclusion bar — product-driven and evidence-backed

[VOUCHED @hyf0 2026-07-10]

A component earns its place by closing a recurring need in an [active product scenario](./product-scenarios.md#active-application-scenarios) or a real consumer. A representative journey is product evidence: when it repeatedly hand-rolls the same difficult interaction, the project may add a first-party component proactively instead of waiting for a separate community request. Demonstrated broader community demand remains equally valid.

"Ink (or Textual, OpenTUI, or any framework) has it" is not a reason on its own. Another project can show that a problem exists, but vue-tui still needs evidence that the problem belongs in its own scenario journeys or consumer workflows.

The public piece must remain generic. Provider protocols, agent or tool-call models, Git and database schemas, monitor collectors, and purely application-specific visual treatment stay in applications or specialized libraries. Repeated behavior may become a component, an independent composable, or a missing runtime capability; the scenario does not predetermine the layer.

This **extends** the [alignment-is-a-means principle](./ink-divergences.md) to a different axis.
That principle governs _behavior_ (match Ink only where Ink is already correct); this one governs
_set-membership_ (which components exist at all). "Ink has it" justifies neither — but for a
component we _do_ ship, we still borrow proven behavior where it fits (see _Vue-idiomatic,
Ink-inspired_).

## The runtime ↔ component boundary

The runtime owns anything that touches the terminal I/O boundary or the layout/commit engine.
A candidate is **runtime work** (or blocked on a runtime addition) if it must:

- emit a new escape sequence, or flip a terminal mode;
- hook the commit/animation scheduler _directly_ — note `useAnimation` already exposes
  frame-driven animation, so needing animation is _not_ runtime work;
- read geometry the runtime primitives (incl. `useBoxMetrics` / `measureElement`) don't already
  expose.

Otherwise it is a component. The clean illustration: **pointer/mouse input is runtime work** —
input decoding, terminal-mode ownership, hit testing, and dispatch live in the runtime
(`useMouseInput`, targeted handlers, and `useDraggable`; see [mouse-input.md](./mouse-input.md)) —
whereas anything driven by existing keyboard input plus measured layout is a pure composition.
(`overflow:"hidden"`
clipping is paint-only and does not change Yoga layout, so clipped content stays measurable; see
the related layout-model guidance in [ink-divergences.md](./ink-divergences.md).)

## Vue-idiomatic, Ink-inspired

Look to prior art — Ink's ecosystem, and Textual / Bubble Tea / Ratatui — for behavior _ideas_,
not for React's (or any framework's) signatures. Correctness and Vue philosophy **outrank
parity**; see the governing principle in [ink-divergences.md](./ink-divergences.md) (not
re-derived here). A component should feel like Vue: props, `v-model`, events, slots, composables —
not a transliterated render prop.

## Pure composition

Build only on the runtime's **public barrel**, never `@vue-tui/runtime/internal`. Two reasons:
`/internal` carries no stability guarantee ([api-contract.md](./api-contract.md)), and staying on
the public surface **dogfoods** it — a missing capability surfaces as a real gap to fix in the
runtime (see _The runtime ↔ component boundary_) rather than something papered over from the
inside.

## Type-friendliness — Volar / vue-tsc must catch misuse at compile time

The overriding goal: wrong usage in a consumer's `<template>` should surface as a **Volar**
squiggle and fail **vue-tsc** — caught at compile time, never as a runtime surprise. A
component's types should be treated as contract — the same principle
[api-contract.md](./api-contract.md) applies to the runtime. What that takes:

- typed props, typed `v-model` (`defineModel<T>()`), typed scoped-slot payloads, and typed
  `defineExpose` handles — so a wrong-typed prop, a mismatched `v-model` binding, or a misused
  slot variable is a **compile error**, not a silent no-op;
- a component over a collection or value is **generic** and infers it — the way `Static<T>` flows
  its item type into the `{ item, index }` slot — so the consumer annotates nothing and misuse
  still type-checks;
- no leaked `any` (it silently switches checking off); keep the `WithChildren` shim so JSX
  children stay typed;
- **prove it by running the checker** against real template _and_ TSX usage (`vue-tsc` for
  templates, `tsc` for TSX), the way [accessibility-api.md](./accessibility-api.md) does — what
  Volar / vue-tsc actually catch is established by running, not assumed (the project runs without
  `strictTemplates`, so some template checks are looser than they look).

## Idiomatic patterns — reference, not rules

These are patterns an implementer **may** reach for. They are **not** a per-component API spec —
each component's surface is decided in its own issue. They exist to keep the library internally
consistent and to flag real authoring traps:

- **Two-way value** → author with `defineModel()` (Vue 3.4+); it generates `modelValue` +
  `update:modelValue`. Use named models (`defineModel("query")`) when there is more than one
  binding. Display-only components have no model — the pattern simply doesn't apply.
- **Slots (correctness constraint, not just a pattern)** → primary / repeated content goes in the
  **default** scoped slot exposing `{ item, index }` (mirrors `Static`). This is load-bearing:
  Vue's automatic JSX runtime routes JSX children to a `children` prop that resolves to the
  **default** slot (the `WithChildren` shim only makes that type-check), so primary content placed
  in a **named** slot silently drops for JSX consumers. Reserve **named** scoped slots for
  secondary regions (indicator, empty state, header/footer) — which, for the same reason, aren't
  reachable as JSX children.
- **Handler props (correctness constraint, not just a pattern)** → declare as plain
  `PropType<Handler>` (props are already reactive). When
  forwarding a handler into a runtime composable, never pass a one-time snapshot
  (`useInput(props.onInput)`) — use `toRef(props, "onInput")`, or a wrapper that calls
  `props.onInput(...)` at event time. This is the load-bearing half of the
  [AGENTS.md](../../AGENTS.md) handler rule; the `MaybeRef<Handler> + unref()` form is for a
  composable you _author_, not for component props.
- **Imperative handles** → prefer props / `v-model` / events / slots and the existing runtime
  composables (`useFocus`, `useFocusManager`) first. Reach for `defineExpose` only for genuinely
  imperative actions that can't be modeled declaratively (`reset()`, `scrollTo()`) — never to
  re-implement focus control the runtime already owns.
- **Authoring mechanics** → for the parts that generalize, defer to
  [component-authoring.md](./component-authoring.md): SFC by default, and a render function only
  when a component must inspect its own child vnodes. (That doc is mostly about the runtime's
  _primitives_ — `tui-*` host tags, `isCustomElement`, camelCase host-prop binding — which a
  composition author, using only `<Box>` / `<Text>`, never touches.)

## Boolean prop naming & defaults

[VOUCHED @hyf0]

Component boolean props follow Vue-ecosystem and terminal-UI convention — not verb-prefixed toggles.

- **A boolean prop is a noun or an adjective, never a verb.** `bordered`, `clearable`, `mouse`, `keys` — not `enableBorder` / `enableMouse`. None of the major Vue libraries (Element Plus, Naive UI, Vuetify, Ant Design Vue, PrimeVue) use an `enable*` boolean prop; the terminal-UI precedent (blessed) is bare `mouse` / `keys`. (`enable*` is a React-library pattern, e.g. TanStack Table — not idiomatic in Vue or in TUIs.)
- **Booleans default to `false`.** `<Comp foo>` then reads as "turn foo on." A feature that must be on by default is named as its negative (`disabled`) so the prop still defaults `false`; avoid a verb-boolean that defaults `true`, which forces the backwards `:enable-foo="false"`. (Matches MUI's published API-design guidance.)
- **Name for precision — what is toggled, not the device.** A bare device noun reads ambiguously; prefer the specific behavior it controls (e.g. `wheel` for mouse-wheel scrolling rather than `mouse`, which would also imply clicks).
- **A prop with a global / terminal-wide side effect is opt-in (`false` by default), and the side effect is documented.** Example: enabling terminal mouse tracking suppresses the terminal's native text selection window-wide (users bypass with Shift) — so such a prop must be opt-in, not on by default.

## Deliberately omitted

[VOUCHED @hyf0 2026-07-10]

- **No accessibility requirement.** Components are not required to set `ariaRole` / `ariaState`.
  It isn't always cheap to get right, and mandating it would tax contribution; a component may opt
  in where it's natural.
