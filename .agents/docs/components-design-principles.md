# @vue-tui/components — Design Principles & Conventions

> AI-accumulated working notes (unstamped lines are challengeable — see PCR provenance).
> This is **not** a contribution checklist: each component's actual API is decided in its own
> issue, not here. It records how components in `@vue-tui/components` should be _shaped_ and
> _styled_, and the bar for adding one in the first place.
>
> **Status:** planned — no `@vue-tui/components` code exists yet. This is design intent, not a
> description of shipped code.

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

## Inclusion bar — demand-driven

A component earns its place by **demonstrated community need** — a real use case people actually
hit. "Ink (or Textual, or any framework) has it" is not a reason on its own.

This **extends** the [alignment-is-a-means principle](./ink-divergences.md) to a different axis.
That principle governs _behavior_ (match Ink only where Ink is already correct); this one governs
_set-membership_ (which components exist at all). "Ink has it" justifies neither — but for a
component we _do_ ship, we still borrow its proven behavior (see _Vue-idiomatic, Ink-inspired_).

## The runtime ↔ component boundary

The runtime owns anything that touches the terminal I/O boundary or the layout/commit engine.
A candidate is **runtime work** (or blocked on a runtime addition) if it must:

- emit a new escape sequence, or flip a terminal mode;
- hook the commit/animation scheduler _directly_ — note `useAnimation` already exposes
  frame-driven animation, so needing animation is _not_ runtime work;
- read geometry the runtime primitives (incl. `useBoxMetrics` / `measureElement`) don't already
  expose.

Otherwise it is a component. The clean illustration: **pointer/mouse input is runtime work** —
input decoding lives in the runtime, and it is currently absent (#207) — whereas anything driven
by existing keyboard input plus measured layout is a pure composition. (`overflow:"hidden"`
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

## Deliberately omitted

- **No accessibility requirement.** Components are not required to set `ariaRole` / `ariaState`.
  It isn't always cheap to get right, and mandating it would tax contribution; a component may opt
  in where it's natural.
