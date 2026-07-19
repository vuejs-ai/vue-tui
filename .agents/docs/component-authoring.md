# Component Authoring: SFC vs Render Function

> Active boundary note (2026-07-19): the Runtime-foundation re-audit leaves `Box`, `Text`, and `/inline`'s `Static` as the public Runtime components. `Newline` and `Spacer` are ordinary public composition and were removed; `Transform` remains only private renderer implementation material. Static has one ordinary slot and an internal accepted flag.

vue-tui's public Runtime components (`Box`, `Text`, and `Static`) are Vue `<script setup>`
template SFCs. The private Transform mechanism still uses a `defineComponent` render function
because it must inspect its own materialized slot-child vnodes at render time.

Templates fought this custom renderer in three concrete places (Static, Text, Box). In each
case the friction turned out to be a **renderer/tooling bug or gap that was worth fixing** —
not a reason to abandon the template. Two of the fixes also corrected latent inconsistencies
(one an Ink-parity bug). See "Renderer work the templates required" below.

## The split

| Component                   | Form                        | Reason                                                 |
| --------------------------- | --------------------------- | ------------------------------------------------------ |
| `Static`                    | template SFC                | accepted flag + one ordinary slot                      |
| `Box`                       | template SFC                | root `v-if` validation guard + `<slot/>`               |
| `Text`                      | template SFC                | `<slot/>` + `tui-virtual-text`/`tui-text` branch       |
| private Transform mechanism | **render function (`.ts`)** | inspects children: all-inert children → render nothing |

## Two questions, two idioms

The deciding distinction — get this right and the split falls out:

- **"What context am I in?"** (is this `<Text>` nested inside a text context?)
  → **provide/inject**, never parent-walking or `.name` matching. `Text` and the private
  Transform mechanism provide `TextContextKey`; `Text` injects it. This is template-friendly,
  matches vue-tui's `AppContextKey` and private focus-controller context style, and is the
  well-established Vue idiom (provide/inject outnumbers slot inspection 4–20× in the
  libraries surveyed). It replaced the old, duplicated `getCurrentInstance()` parent walk.
- **"What are my children's actual contents?"** (filter inert/`Comment` vnodes, detect
  emptiness) → **render function** + `slots.default()`. A `<template>` can't reach the vnode
  array; forcing it means calling the slot twice per render — an accepted-but-unsanctioned
  escape hatch the Vue core team itself calls "probably not a good idea." Keep it to the one
  private mechanism that truly needs it (Transform).

## Why the private Transform mechanism is a render function

The private Transform wrapper returns nothing when every child is inert (a `v-if="false"` / `null` materialized
as a `Comment` vnode), mirroring Ink's `children == null` guard. This is a **rendering
decision with a real layout consequence**: a stray empty node would occupy a flex `gap` slot
(`G52` / P13). Rendering a node for `{null}` would be _less_ reasonable, so the child
inspection is doing genuine work. It stays `h()`. Performance is not a factor — a template
version would be marginally _slower_ here (double slot materialization, nothing for the
compiler to hoist), unmeasurable in a ~32ms-throttled TUI.

## Why Text validates `color`/`backgroundColor` eagerly

`Text` validates its public contract during render before the empty-content branch. Visual
documents accept only the public `Color` grammar, plus `revert` and `initial` for foreground;
screen-reader documents skip those paint-only checks. Structural values such as `wrap` still
validate in every presentation. Removing content-dependent validation is what lets `Text`
remain a template without inspecting child vnodes.

## Renderer work the templates required (run-discovered, all fixed)

Authoring the templates and running the **existing** suites surfaced three custom-renderer
realities. None was reasoned out up front; each was caught green-to-red (run, don't reason)
and fixed at the root:

- **Static — output-free slot trees must still settle.** A conditional or empty ordinary slot leaves inert Vue anchors. The static channel skips those anchors for paint but still accepts the whole mounted host after a successful output-free transaction. The component then releases that host and its Yoga subtree while retaining its own accepted state, so later slot content cannot replay the same history identity.
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
  `$el` a fragment boundary anchor (empty `text-leaf`, no renderer element). The shared
  rendered-target resolver drills the component `subTree` to the first real host node, skipping
  comment/empty-`text-leaf` anchors (verified to resolve each ref'd Box to its **own** node, never a sibling's). Public `useElementGeometry()` consumes that resolver and derives its result from paint rather than reading Yoga through `$el`.
- **A component ref is not a rendered-lifetime signal.** A public component instance may remain identical while a root `v-if`, keyed root, or HMR rerender replaces its `$el`. Internal behaviors bound to that ref must use the per-render-root contract in [rendered-target-lifetime.md](./rendered-target-lifetime.md), not add another watcher of the component proxy. Rendered lifetime and focus eligibility remain separate contracts: F2 owns attachment identity and cleanup, while completed F4 derives hidden, disabled, scope, and traversal eligibility from the current rendered tree.

## Pitfalls (for adding or editing component SFCs)

- **Bind host-element props in camelCase, or via `v-bind="object"`.** The renderer matches
  yoga/style props by exact camelCase key, and Vue passes a custom-element binding name
  verbatim — so `:flex-grow="1"` reaches the renderer as `flex-grow` and is rejected. Use
  `:flexGrow="1"`, or `v-bind="someObject"` (object keys are preserved). `Box` and `Text` bind
  their public props object with `v-bind`; Static binds only its private host configuration.
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
- Runtime components publish stable author-facing constructors rather than the generated SFC `DefineComponent` type. Components with an ordinary default slot use the `PublicComponent` type shim because Vue's automatic JSX runtime routes children through a `children` prop that a declared slot alone does not provide. Prop-free `Static` uses `PublicComponent<Record<never, never>>`, which keeps that ordinary zero-payload slot while preventing the generated SFC type from admitting inherited HTML-like props.
- The separate `@vue-tui/components` package exports each SFC through a stable author-facing constructor rather than leaking the `DefineComponent` generic arity generated by the Vue patch used at build time. Components with a default slot use `PublicComponent<Props, Exposed>` so template and TSX refs preserve their public handle; leaf components use `PublicLeafComponent<Props>` so ignored `children` are rejected. Every exported imperative handle needs a declaration test and a clean packed-consumer test.
- Build/tooling: the `pack` build carries `unplugin-vue/rolldown` (with `isCustomElement` for the host tags) and emits SFC declarations via `dts: { vue: true }`; package declarations must externalize `vue` and `@vue/*` so a consumer resolves one Vue instance and can use a different supported Vue patch release. The runtime **test** Vite config also carries `unplugin-vue/vite` because unit tests import the `.vue` components; `check:type` is `vue-tsc`.
