# Package Layers & Dependency Direction

> Records how vue-tui's packages are layered by responsibility, the strict one-way
> dependency direction between them, and where a new piece of code (a component vs a hook)
> belongs. The three-layer set, the one-way dependency direction, and the split between
> component-tied hooks (`components`) and independent hooks (`use`) are **[VOUCHED @hyf0]**.
> Runtime's own terminal-I/O boundary is governed by
> [components-design-principles.md](./components-design-principles.md) — deferred to there,
> not restated or changed here.

## The layers (bottom → top)

vue-tui is layered by responsibility; each layer may depend **only downward**.

- **`@vue-tui/runtime`** — the engine: the Yoga-flexbox renderer, the primitive components
  (e.g. `Box`/`Text`/`Spacer`/`Static`), and the terminal-I/O composables (e.g. `useInput`,
  `useFocus`, `useMouseInput`, `useStdout`, `useCursor`, `useRenderSession`, `useLayoutSize`). The lean core
  every app depends on; depends on nothing else in the family. What counts as runtime work
  is the [runtime ↔ component boundary](./components-design-principles.md).
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

1. **Runtime work** — renderer or terminal I/O? → `@vue-tui/runtime`. The exact test lives
   in the [runtime ↔ component boundary](./components-design-principles.md), not here. This
   wins first: an I/O hook stays in `runtime` even though it is _also_ independent and
   reusable (`useInput` / `useFocus` are exactly that).
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

`runtime` and `components` exist today. `use` is a **reserved layer**: its dependency contract is fixed now, but the package is created only when its first real member—an independent, reusable hook—actually ships. Creating that layer does not by itself justify renaming or repurposing `components`; any package-boundary change requires its own accepted architectural reason.
