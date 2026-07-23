# Package Layers & Dependency Direction

> Records how vue-tui's packages are layered by responsibility, the strict one-way
> dependency direction between them, and where a new piece of code (a component vs a hook)
> belongs. The three-layer set, the one-way dependency direction, and the split between
> component-tied hooks (`components`) and independent hooks (`use`) are **[VOUCHED @hyfdev]**.
> Runtime's own terminal-I/O boundary is governed by
> [components-design-principles.md](./components-design-principles.md) — deferred to there,
> not restated or changed here.

## The layers (bottom → top)

vue-tui is layered by responsibility; each layer may depend **only downward**.

- **`@vue-tui/runtime`** — the engine and only the public primitives whose correct behavior requires ownership of the terminal, renderer tree, accepted layout or paint, input protocol, lifecycle, or terminal resources. The current branch candidate includes `createApp`, `renderToString`, `Box`, `Text`, `useApp`, `useInput`, `useStdin`, direct layout and Box facts, `/inline`'s `Static`, and the narrow `/devtools` and `/testing` integration seams; the [decision ledger](./runtime-public-api-decisions.md) separates accepted entries from Open contracts. Rich session, routing, focus, paint geometry, caret, pointer, selection, clipboard, and output-coordination state remains internal. Runtime depends on nothing else in the family. `Static` remains Runtime work because its one-attempt acceptance and stream-commit ownership are renderer/output mechanics even though Vue owns collection iteration and its authoring path is surface-specific.
- **`@vue-tui/use`** — independent, reusable hooks that are **not tied to any single
  component** (shared headless behavior/logic). May depend on `runtime`; **must never depend
  on `components`.**
- **`@vue-tui/components`** — the rendered components (`Spinner`, `ScrollBox`, …) plus the
  hooks that **belong to a specific component**: headless internals (e.g. a `useScroll`
  behind a `ScrollBox`) and required companions (e.g. a future `useToast` beside
  `<Toast>`). May depend on `use` and `runtime`; composes runtime primitives (see
  [components-design-principles.md](./components-design-principles.md)).

```
runtime  ←  use  ←  components        (arrow = "is depended on by")
```

**Dependency direction is strict and one-way:** `components` may depend on `use`, and `use`
may depend on `runtime`; the reverse edges are forbidden. `use` never imports `components` —
logic must not depend on rendered UI. (Mirrors VueUse, where `@vueuse/components` depends on
`@vueuse/core`, never the reverse.)

## Where a new hook goes

Apply in order — first match wins:

1. **Runtime work** — can the behavior be implemented correctly without Runtime-private ownership? If it needs the terminal, renderer tree, accepted layout or paint, input protocol, lifecycle, or terminal resources, identify the smallest stable fact or operation Runtime must expose. Being a composable, reading terminal-related state, or using an existing internal mechanism is not enough. A broader policy stays above Runtime when a third party can build it from smaller supported primitives.
2. **The headless guts of — or a required companion to — one specific component we ship?**
   → `@vue-tui/components`, co-located with that component (e.g. `scroll-box/scroll-box.vue`
   beside `scroll-box/use-scroll.ts`), exported from the package root. Not a separate
   package: splitting a component's own hook off would fragment one feature across two
   packages.
3. **Otherwise** — an independent, reusable hook tied to no component and not runtime work →
   `@vue-tui/use`.

Step 3 is the split this record adds: the boundary doc's non-runtime branch (which it calls
"a component") divides into component-tied → `components` and independent → `use`.

`@vue-tui/components` deliberately **keeps its name** even though it exports `useXxx`: the
hooks it holds belong to its components. Independent hooks live in `@vue-tui/use`, not here —
which is exactly why `components` needs no broader name.

## Status

`runtime` and `components` exist today. `use` is a **reserved, replaceable layer**: its dependency contract is fixed now, but the package is created only when real application practice produces its first independent reusable behavior. It must use only Runtime's supported public API, exactly like a third party. Creating the layer does not by itself justify inventing hooks, renaming `components`, or repurposing it; any package-boundary change requires its own accepted architectural reason.
