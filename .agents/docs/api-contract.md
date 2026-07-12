# Public API contract & surface

What is — and isn't — part of `@vue-tui/runtime`'s public contract, and how the contract is
tested. The principles and capability work used to choose future APIs live in
[api-design](./api-design.md). Behavioral _divergences_ from Ink live in
[ink-divergences](./ink-divergences.md); this file is about the SHAPE of the public surface itself.

## Experimental stability policy

Here, “public contract” means the authoring surface intentionally supported, documented, typed, and tested in the current version. It does not promise cross-release backward compatibility while vue-tui remains experimental. Under the [vouched product policy](./goal.md#api-stability-during-experimentation), a public value, type, option, path, or behavior may be renamed, moved, changed, or removed directly when an accepted target design supports that change; aliases, deprecation windows, and runtime shims are not required merely because an API shipped before 1.0.

The public-surface guards remain important. They make every change deliberate, prevent accidental exports or type drift, and prove that the resulting current API is internally coherent. A clean-slate change updates the implementation, value and type guards, documentation, examples, tests, and first-party consumers together.

F1.8 applied that process to the public render-session surface: `useRenderSession()` and `useLayoutSize()` are verified exports, while `useWindowSize()` and `useIsScreenReaderEnabled()` were removed rather than retained as aliases. The named `RenderMode`, `RenderModeResolution`, `RenderOutput`, `RenderSession`, `RenderSize`, `RenderLayoutSize`, and `UseLayoutSizeReturn` types are part of the guarded public type contract. Repository, packed-consumer, PTY, visual, restoration, CI, and independent-review gates all agree with those exports, so F1 is complete.

## The contract = public exports **and their user-consumable types**

The public API is everything exported from the main barrel (`@vue-tui/runtime`): components,
composables, entry points — **and their TYPES** (component prop types, composable return/options
types, and named types such as `AriaRole`, `RenderSession`, `BoxProps`, `UseXReturn` / `UseXOptions`).

A type is **as much a part of the current contract as runtime behavior**. If user code can name a type and annotate with it, changing or removing it changes the supported authoring surface at compile time. That is allowed during experimentation when deliberate, but the type surface must be designed, updated, and tested with the same care as runtime behavior.

Because it is contract, it is **tested, not merely shipped**:

- `public-api.test.ts` snapshots the **exact** public value-export set — adding, removing, or
  renaming any runtime export fails it, so every surface change must be a deliberate edit there.
  Specific internal-only members (`measureText`, the screen-reader linearizer) are additionally
  tripwired, and internal-only _types_ (e.g. `ScreenReaderOptions`) are guarded with a compile-time
  `@ts-expect-error`. Type-only exports are erased at runtime, so the _type_ surface is guarded
  individually rather than exhaustively snapshotted.
- Type-_safety_ behavior is established by RUNNING the type-checker against real usage (`tsc` for
  TSX, `vue-tsc` for templates), never assumed. See [accessibility-api](./accessibility-api.md) for a worked example —
  which aria spellings the compiler does and does not catch, proven with both tools.

## `/internal` is NOT the contract

`@vue-tui/runtime/internal` is an explicitly internal / advanced surface — host-node types (`TuiNode`, …), test-only helpers (`renderToStringWithScreenReader`), dev/HMR types (`DevState`, `DevErrorInfo`), kitty-controller internals, etc. It is **not a supported authoring surface**: its exports are not documented or guarded as a complete set by `public-api.test.ts` (a member may be tripwired there to prove it is internal), and may change without the deliberate public-surface process above.

Placement rule for any export:

- A user-facing contract → the **main barrel** (and it is tested).
- Needed only by tests or advanced integrators → **`/internal`**, never the main barrel.

Packaging/build internals (the `exports` field shape, `.mjs` paths, `dist` layout) are likewise
**not** part of the behavioral/type contract and are not aligned to Ink — see the alignment-scope
note in [ink-divergences](./ink-divergences.md).

### Accepted incidental exposure: `TuiNode` via `TuiApp`

`TuiNode` is an `/internal` type, but it is **incidentally reachable** through the public `TuiApp`, which `extends Omit<App<TuiNode>, "mount">` to inherit Vue's full app surface — Vue's `App<HostElement>` carries the host type on its internal `_container` field. This is a **conscious non-fix, not a supported authoring contract**: `_container` is a Vue-internal field no consumer uses, so the exposure is cosmetic. Narrowing it (`App<unknown>` / a `Pick<App, …>` allowlist) was considered and skipped as ceremony without user-visible benefit. Treat `TuiNode`-through-`TuiApp` as unsupported and don't re-flag it. [VOUCHED @hyf0]
