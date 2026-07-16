# Component Authoring: SFC vs Render Function

vue-tui's public components (`Box`, `Text`, `Spacer`, `Static`, `Newline`, `Transform`) are
authored as **Vue `<script setup>` template SFCs by default**. Exactly one — `Transform` —
is a `defineComponent` render function (`.ts`), because it must **inspect its own materialized
slot-child vnodes at render time** (the line every major Vue library draws: naive-ui,
element-plus, ant-design-vue, reka-ui). Every other component is a real `<template>` SFC.

Templates fought this custom renderer in three concrete places (Static, Text, Box). In each
case the friction turned out to be a **renderer/tooling bug or gap that was worth fixing** —
not a reason to abandon the template. Two of the fixes also corrected latent inconsistencies
(one an Ink-parity bug). See "Renderer work the templates required" below.

## The split

| Component   | Form                        | Reason                                                 |
| ----------- | --------------------------- | ------------------------------------------------------ |
| `Spacer`    | template SFC                | one host node                                          |
| `Newline`   | template SFC                | `"\n".repeat(count)` interpolation + a context branch  |
| `Static`    | template SFC                | reactive cursor + `v-for` scoped slot                  |
| `Box`       | template SFC                | root `v-if` validation guard + `<slot/>`               |
| `Text`      | template SFC                | `<slot/>` + `tui-virtual-text`/`tui-text` branch       |
| `Transform` | **render function (`.ts`)** | inspects children: all-inert children → render nothing |

## Two questions, two idioms

The deciding distinction — get this right and the split falls out:

- **"What context am I in?"** (is this `<Text>` / `<Newline>` nested inside a text context?)
  → **provide/inject**, never parent-walking or `.name` matching. `Text` and `Transform`
  `provide(TextContextKey, true)`; `Text` and `Newline` `inject` it. Template-friendly,
  matches vue-tui's existing `AppContextKey` / `FocusContext` style, and is the
  well-established Vue idiom (provide/inject outnumbers slot inspection 4–20× in the
  libraries surveyed). It replaced the old, duplicated `getCurrentInstance()` parent walk. [VOUCHED @hyf0]
- **"What are my children's actual contents?"** (filter inert/`Comment` vnodes, detect
  emptiness) → **render function** + `slots.default()`. A `<template>` can't reach the vnode
  array; forcing it means calling the slot twice per render — an accepted-but-unsanctioned
  escape hatch the Vue core team itself calls "probably not a good idea." Keep it to the one
  component that truly needs it (`Transform`).

## Why Transform is the lone render function

`Transform` returns nothing when every child is inert (a `v-if="false"` / `null` materialized
as a `Comment` vnode), mirroring Ink's `children == null` guard. This is a **rendering
decision with a real layout consequence**: a stray empty node would occupy a flex `gap` slot
(`G52` / P13). Rendering a node for `{null}` would be _less_ reasonable, so the child
inspection is doing genuine work. It stays `h()`. Performance is not a factor — a template
version would be marginally _slower_ here (double slot materialization, nothing for the
compiler to hoist), unmeasurable in a ~32ms-throttled TUI.

## Why Text validates `color`/`backgroundColor` eagerly

`Text`'s only render-time child inspection was `wouldRenderNonEmptyText`, which gated **both**
foreground `color` and `backgroundColor` validation so empty text wouldn't throw (mirroring
Ink, which colorizes lazily). That gate is **dissolved**: `Text` now validates `color` and
`backgroundColor` eagerly every render, exactly as `Box` already does for its own colors. An
invalid value (`backgroundColor="bold"` — a chalk _modifier_, not a color; or `color="level"`
— a chalk key that exists but is not a callable color method) is invalid regardless of
content; content-dependent validation is a latent footgun (it throws only once content
appears). This completes the [ink-divergences](./ink-divergences.md) "Invalid input is validated at the component
layer" principle — `Text` was the inconsistent holdout. Removing the gate is also what let
`Text` stop inspecting children and become a template.

## Renderer work the templates required (run-discovered, all fixed)

Authoring the templates and running the **existing** suites surfaced three custom-renderer
realities. None was reasoned out up front; each was caught green-to-red (run, don't reason)
and fixed at the root:

- **Static — the static paint channel didn't skip inert anchors.** An empty `v-for` leaves a
  Vue Fragment placeholder (an empty `text-leaf` anchor), so `stat.children` is `[anchor]`,
  not `[]`. `paintStaticNode` filtered only already-written nodes, so the anchor passed the
  `fresh.length > 0` gate and `paintIsolated` painted the container's **padding** as stray
  blank lines — while `findStatics` in the same file already skipped `text-leaf`/`comment`.
  Fix: `paintStaticNode` skips inert anchors too (safe: `node-ops.ts` forbids non-empty bare
  text under `<tui-static>`, so the only `text-leaf` there is an empty anchor).
- **Text — `<slot/>` fragment anchors shifted the transform line-index, exposing an Ink-parity
  bug.** A `<slot/>` mounts as a Fragment whose boundary anchors are empty `text-leaf`s; the
  squash loops that give a nested `<Transform>` its positional line index counted every
  non-`comment` child, so the anchors shifted the index (`a<Transform>b` → index 2, not 1).
  The anchors are byte-identical to a genuine `{''}` child — and **real Ink v7.0.4 doesn't
  count `''`/`null` children in that index either** (`a{''}<Transform>b` → `ab[1]`; the old
  render-fn `Text` already diverged to `ab[2]`). Fix: `advancesLineIndex(child)` (in
  `host/nodes.ts`) skips `comment` AND empty `text-leaf`, applied to all 8 index-advance loops
  across `paint.ts` / `host/text-measure.ts` / `paint/screen-reader.ts` — a parity improvement,
  not a divergence.
- **Box — a root `v-if` makes `$el` a Fragment anchor.** `Box` must render **nothing** when
  screen-reader-hidden, which needs a conditional root; a root `v-if` makes the component's
  `$el` a fragment boundary anchor (empty `text-leaf`, no `.yoga`), so `measureElement` /
  `useBoxMetrics` (which read `ref.$el.yoga`) collapsed to 0. Fix: those resolvers drill the
  component `subTree` to the first real host node, skipping comment/empty-`text-leaf` anchors
  (verified to resolve each ref'd Box to its **own** node, never a sibling's).
- **A component ref is not a rendered-lifetime signal.** A public component instance may remain identical while a root `v-if`, keyed root, or HMR rerender replaces its `$el`. Internal behaviors bound to that ref must use the per-render-root contract in [rendered-target-lifetime.md](./rendered-target-lifetime.md), not add another watcher of the component proxy. Visibility and focus eligibility remain separate later contracts.

## Pitfalls (for adding or editing component SFCs)

- **Bind host-element props in camelCase, or via `v-bind="object"`.** The renderer matches
  yoga/style props by exact camelCase key, and Vue passes a custom-element binding name
  verbatim — so `:flex-grow="1"` reaches the renderer as `flex-grow` and is rejected. Use
  `:flexGrow="1"`, or `v-bind="someObject"` (object keys are preserved). `Box`/`Text`/`Static`
  bind a whole props/style object with `v-bind`; `Spacer` uses explicit camelCase.
- **Host primitive tags are `tui-`-prefixed** (`tui-box`/`tui-text`/`tui-virtual-text`/
  `tui-static`/`tui-transform`), mirroring Ink's `ink-box`/`ink-text`. The prefix keeps the
  renderer's intrinsic elements in their own namespace, so a template `<tui-box>` never
  resolves to the public `<Box>` component — the components keep their real `name`
  (`Box`/`Text`/`Static`) with no vue-tsc self-recursion. (Earlier the tags were bare
  `box`/`text`/…, which collided with the same-named components and forced an `*Impl` internal
  rename to dodge it; the prefix removed that workaround. vue-tsc has no `isCustomElement` at
  the type layer, so a bare lowercase tag would PascalCase-resolve to the component — the
  hyphenated `tui-` name sidesteps that entirely.)
- **Don't reintroduce parent-walking or `parent.type.name` matching for context** — use
  provide/inject (`.name` is also fragile under minification).
- **Don't force child-vnode inspection into a template** (the double-materialization wart). If
  a new component needs it, make it a render function — where the whole ecosystem draws the line.
- The host elements (`tui-box`, `tui-text`, `tui-virtual-text`, `tui-static`, `tui-transform`)
  compile to raw element vnodes via the build's `isCustomElement` option and are an **internal**
  detail. Consumers use `<Box>` / `<Text>`, never `<tui-box>`. SFC templates may reference the
  host tags directly; their loose typing under `vue-tsc` (no `strictTemplates`) is intentional.
- Components export typed props (`ExtractPublicPropTypes` over the runtime props object) and
  keep the `WithChildren` shim (`with-children.ts`): Vue's automatic JSX runtime routes
  children to a `children` prop that declared slots do NOT provide, so the shim is required for
  JSX consumers. It is harmless for templates — a `WithChildren`-wrapped component still
  type-checks correctly in consumer `<template>`s under vue-tsc (verified), and no
  `GlobalComponents` augmentation is needed because consumers import the components.
- Build/tooling: the `pack` build carries `unplugin-vue/rolldown` (with `isCustomElement` for
  the host tags) and emits SFC declarations via `dts: { vue: true }`; the runtime **test** Vite
  config also carries `unplugin-vue/vite` because unit tests import the `.vue` components;
  `check:type` is `vue-tsc`.
