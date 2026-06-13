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

- `public-api.test.ts` snapshots the **exact** public value-export set — adding, removing, or
  renaming any runtime export fails it, so every surface change must be a deliberate edit there.
  Specific internal-only members (`measureText`, the screen-reader linearizer) are additionally
  tripwired, and internal-only _types_ (e.g. `ScreenReaderOptions`) are guarded with a compile-time
  `@ts-expect-error`. Type-only exports are erased at runtime, so the _type_ surface is guarded
  individually rather than exhaustively snapshotted.
- Type-_safety_ behavior is established by RUNNING the type-checker against real usage (`tsc` for
  TSX, `vue-tsc` for templates), never assumed. See [[accessibility-api]] for a worked example —
  which aria spellings the compiler does and does not catch, proven with both tools.

## `/internal` is NOT the contract

`@vue-tui/runtime/internal` is an explicitly internal / advanced surface — host-node types
(`TuiNode`, …), test-only helpers (`renderToStringWithScreenReader`), dev/HMR types (`DevState`,
`DevErrorInfo`), kitty-controller internals, etc. It carries **no stability guarantee**: its
surface is not snapshotted by `public-api.test.ts` (a member may be tripwired there to prove it is
internal, but the surface itself carries no contract), and may change freely between releases.

Placement rule for any export:

- A user-facing contract → the **main barrel** (and it is tested).
- Needed only by tests or advanced integrators → **`/internal`**, never the main barrel.

Packaging/build internals (the `exports` field shape, `.mjs` paths, `dist` layout) are likewise
**not** part of the behavioral/type contract and are not aligned to Ink — see the alignment-scope
note in [[ink-divergences]].
