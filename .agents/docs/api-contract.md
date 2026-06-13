# Public API contract & surface

What is — and isn't — part of `@vue-tui/runtime`'s public contract, and how the contract is
tested. (Behavioral _divergences_ from Ink live in [[ink-divergences]]; this file is about the
SHAPE of the public surface itself.)

## The contract = public exports **and their user-consumable types**

The public API is everything exported from the main barrel (`@vue-tui/runtime`): components,
composables, entry points — **and their TYPES** (component prop types, composable return/options
types, and named types such as `AriaRole`, `WindowSize`, `BoxProps`, `UseXReturn` / `UseXOptions`).

A type is **as much a part of the contract as runtime behavior**. If user code can name a type
and annotate with it, renaming or removing it breaks that code at COMPILE time — exactly as
severe as a runtime break. So a type rename/removal is a breaking change, and the type surface is
the most important part of the contract to get right.

Because it is contract, it is **tested, not merely shipped**:

- `public-api.test.ts` checks the public barrel: every documented export must be present (a
  removed or renamed one fails it), and specific internal-only members (`measureText`, the
  screen-reader linearizer) are asserted absent — including a compile-time `@ts-expect-error`
  guard that their internal-only _types_ (e.g. `ScreenReaderOptions`) stay off the public barrel.
  It is not yet an exhaustive snapshot, so an accidentally-_added_ export would not fail it.
- Type-_safety_ behavior is established by RUNNING the type-checker against real usage (`tsc` for
  TSX, `vue-tsc` for templates), never assumed. See [[accessibility-api]] for a worked example —
  which aria spellings the compiler does and does not catch, proven with both tools.

## `/internal` is NOT the contract

`@vue-tui/runtime/internal` is an explicitly internal / advanced surface — host-node types
(`TuiNode`, …), test-only helpers (`renderToStringWithScreenReader`), dev/HMR types (`DevState`,
`DevErrorInfo`), kitty-controller internals, etc. It carries **no stability guarantee**, is not
covered by `public-api.test.ts`, and may change freely between releases.

Placement rule for any export:

- A user-facing contract → the **main barrel** (and it is tested).
- Needed only by tests or advanced integrators → **`/internal`**, never the main barrel.

Packaging/build internals (the `exports` field shape, `.mjs` paths, `dist` layout) are likewise
**not** part of the behavioral/type contract and are not aligned to Ink — see the alignment-scope
note in [[ink-divergences]].
