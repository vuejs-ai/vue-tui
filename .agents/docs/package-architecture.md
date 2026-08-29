# Package architecture

> Records how vue-tui's packages are layered by responsibility, the strict one-way
> dependency direction between them, and where a new piece of code (a component vs a hook)
> belongs. The three-layer set, the one-way dependency direction, and the split between
> component-tied hooks (`components`) and independent hooks (`use`) are **[VOUCHED @hyfdev]**.
> Product direction for vue-tui as a whole lives in [intent.md](./intent.md). Within that
> direction, [reusable Runtime behavior](./intent.md#reusable-runtime-behavior) sets the
> product bar for generic behavior that requires Runtime ownership. Higher-level component
> catalog admission follows the package-specific rule in
> [components-api-design.md](./components-api-design.md). Neither rule is duplicated here.

## The layers

Each vue-tui layer may depend only downward:

- **`@vue-tui/runtime`** owns primitives whose correct behavior requires the renderer tree, accepted layout or paint, terminal I/O or protocols, output coordination, or terminal lifecycle. It exposes the smallest generic public fact or operation that higher layers need.
- **`@vue-tui/use`** owns independent reusable headless behavior that is not tied to one rendered component. It may depend on Runtime and must not depend on `@vue-tui/components`.
- **`@vue-tui/components`** owns higher-level rendered components and behavior inseparable from one such component. It may depend on both lower layers and composes only supported public Runtime APIs.

```text
runtime  ←  use  ←  components
```

Official `@vue-tui/vite` and `@vue-tui/testing` may use narrow, version-coupled Runtime internal entries. Those bridges are not precedent for applications, `@vue-tui/use`, `@vue-tui/components`, or third-party packages.

## Renderless companions of independent hooks

[VOUCHED @hyfdev 2026-07-26]

Export an independent composable from the `@vue-tui/use` root and its paired renderless `UseXxx` component from `@vue-tui/use/components`. Do not mix the renderless component into the `use` root, and do not put it in the existing `@vue-tui/components` rendered-UI catalog. Future composable/component pairs should follow this split by default. This adapts VueUse's separation between core composables and renderless components without changing vue-tui's existing visual component package.

## Placement test

Apply these questions in order:

1. Does correctness require Runtime-private terminal, renderer, layout, paint, protocol, or lifecycle ownership? If so, identify the smallest stable Runtime operation. A broader policy remains above Runtime when it can be built from supported primitives.
2. Is the behavior the internal state or required companion of one first-party rendered component? If so, colocate it in `@vue-tui/components` and export it with that component when public.
3. Otherwise, is it reusable headless behavior independent of one component? Put the composable in `@vue-tui/use`, with an optional renderless companion in `@vue-tui/use/components`.
4. Application-domain behavior stays in the application or a specialized library.

Being implemented as a composable does not make something Runtime work. Being implemented as a Vue component does not make a renderless companion part of the visual component catalog. Package placement follows ownership, not syntax.

## Enforcement

`@vue-tui/use` and `@vue-tui/components` are replaceable higher layers and use Runtime exactly like third parties. Public-layer import tests enforce that they do not reach Runtime source or internal entries. Adding a layer does not itself justify adding behavior; every candidate must remain consistent with the product intent and satisfy the evidence requirements, placement test, and any package-specific inclusion rule.
