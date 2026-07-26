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

- **`@vue-tui/runtime`** — the engine and only the public primitives whose correct behavior requires ownership of the terminal, renderer tree, accepted layout or paint, input protocol, lifecycle, or terminal resources. The selected minimum public foundation includes `createApp`, `renderToString`, `Box`, `Text`, `useApp`, `useInput`, `useStdin`, minimal focus ownership, direct layout and Box facts, `/inline`'s `Static`, and package metadata resolution. The official `@vue-tui/vite` and `@vue-tui/testing` packages may use narrow, version-coupled Runtime internals; those privileged connections are not public extension contracts and do not relax the public-only rule for `@vue-tui/use`, `@vue-tui/components`, or applications. The broad public session, routing, paint geometry, caret, pointer, selection, and clipboard experiments were removed rather than preserved as internal features. Runtime retains only the private resolver, renderer, input, output-coordination, lifecycle, and official-tooling mechanisms required by accepted behavior. Runtime depends on nothing else in the family. `Static` remains Runtime work because its one-attempt acceptance and stream-commit ownership are renderer/output mechanics even though Vue owns collection iteration and its authoring path is surface-specific; mounted identity, rendered-tree ordering, and Inline ownership are public while unsupported malformed placement and exact failure timing remain internal behavior. A future physical-interaction feature may add a narrow Runtime operation when a concrete task proves it, without treating the removed experiments as a predetermined design.
- **`@vue-tui/use`** — independent, reusable headless behavior that is **not tied to any single rendered component**. The composable is the primary form; the same package may also expose a renderless component companion from its `/components` subpath when that gives templates a direct form of exactly the same lifecycle behavior. It may depend on `@vue-tui/runtime`; it **must never depend on `@vue-tui/components`**.
- **`@vue-tui/components`** — the rendered components (`Spinner`, `ScrollBox`, …) plus the
  hooks that **belong to a specific component**: headless internals (e.g. a `useScroll`
  behind a `ScrollBox`) and required companions (e.g. a future `useToast` beside
  `<Toast>`). May depend on `use` and `runtime`; composes runtime primitives (see
  [components-design-principles.md](./components-design-principles.md)).

```
runtime  ←  use  ←  components        (arrow = "is depended on by")
```

**Dependency direction is strict and one-way:** `@vue-tui/components` may depend on `@vue-tui/use`, and `@vue-tui/use` may depend on `@vue-tui/runtime`; the reverse edges are forbidden. `@vue-tui/use` never imports `@vue-tui/components` — logic must not depend on rendered UI. (Mirrors VueUse, where `@vueuse/components` depends on `@vueuse/core`, never the reverse.)

The current external reference is VueUse's [Components guide](https://vueuse.org/guide/components), which documents separate core-composable and renderless-component imports.

## Renderless companions of independent hooks

[VOUCHED @hyfdev 2026-07-26]

Export an independent composable from the `@vue-tui/use` root and its paired renderless `UseXxx` component from `@vue-tui/use/components`. Do not mix the renderless component into the `use` root, and do not put it in the existing `@vue-tui/components` rendered-UI catalog. Future composable/component pairs should follow this split by default. This adapts VueUse's separation between core composables and renderless components without changing vue-tui's existing visual component package.

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

An independent hook's renderless component form stays beside it on `@vue-tui/use/components`; being authored as a Vue component does not by itself make it part of the rendered component catalog. A component that renders named UI, owns layout or paint, or needs a component-specific companion still belongs in `@vue-tui/components`.

`@vue-tui/components` deliberately **keeps its name** even though it exports `useXxx`: the
hooks it holds belong to its components. Independent hooks live in `@vue-tui/use`, not here —
which is exactly why `components` needs no broader name.

## Status

All three layers now exist. `use` remains a **replaceable higher layer** and uses only Runtime's supported public API, exactly like a third party. Its first behavior is the lifecycle composition recorded in [input-while-mounted](./input-while-mounted.md). Creating the layer does not by itself justify inventing hooks, renaming `components`, or repurposing it; each addition still needs a concrete reusable behavior.
