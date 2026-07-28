# Component Authoring: SFC vs Render Function

> Active boundary note (2026-07-19): the Runtime-foundation re-audit leaves `Box`, `Text`, and `/inline`'s `Static` as the public Runtime components. `Newline` and `Spacer` are ordinary public composition and were removed; the private `Transform` mechanism and its `tui-transform` host were removed later with the redundancy cleanup. Static has one ordinary slot and an internal accepted flag.

vue-tui's public Runtime components (`Box`, `Text`, and `Static`) are all Vue `<script setup>`
template SFCs. No Runtime component currently needs a `defineComponent` render function.

Templates fought this custom renderer in three concrete places (Static, Text, Box). In each
case the friction turned out to be a **renderer/tooling bug or gap that was worth fixing** —
not a reason to abandon the template. Two of the fixes also corrected latent inconsistencies
(one an Ink-parity bug). See "Renderer work the templates required" below.

## The split

| Component | Form         | Reason                                           |
| --------- | ------------ | ------------------------------------------------ |
| `Static`  | template SFC | accepted flag + one ordinary slot                |
| `Box`     | template SFC | root `v-if` validation guard + `<slot/>`         |
| `Text`    | template SFC | `<slot/>` + `tui-virtual-text`/`tui-text` branch |

## Two questions, two idioms

The deciding distinction — get this right and the split falls out:

- **"What context am I in?"** (is this `<Text>` nested inside a text context?)
  → **provide/inject**, never parent-walking or `.name` matching. `Text` provides
  `TextContextKey` and injects it. This is template-friendly,
  matches vue-tui's `AppContextKey` and private focus-controller context style, and is the
  well-established Vue idiom (provide/inject outnumbers slot inspection 4–20× in the
  libraries surveyed). It replaced the old, duplicated `getCurrentInstance()` parent walk.
- **"What are my children's actual contents?"** (filter inert/`Comment` vnodes, detect
  emptiness) → **render function** + `slots.default()`. A `<template>` can't reach the vnode
  array; forcing it means calling the slot twice per render — an accepted-but-unsanctioned
  escape hatch the Vue core team itself calls "probably not a good idea." The removed private
  Transform mechanism was the one component that truly needed it; no current Runtime
  component does.

## Why Text validates `color`/`backgroundColor` eagerly

`Text` validates its public contract during render before the empty-content branch. Every current
host accepts only the public `Color` grammar, plus `revert` and `initial` for foreground; there is
no presentation-specific validation bypass. Removing content-dependent validation is what lets
`Text` remain a template without inspecting child vnodes.

## Renderer work the templates required (run-discovered, all fixed)

Authoring the templates and running the **existing** suites surfaced three custom-renderer
realities. None was reasoned out up front; each was caught green-to-red (run, don't reason)
and fixed at the root:

- **Static — only non-empty slot output settles.** A conditional or empty ordinary slot leaves inert Vue anchors. The static channel skips those anchors for paint and leaves that mounted host open until a later eligible render produces bytes or ordinary Vue unmount removes it. Only hosts represented by non-empty bytes in the current settlement transaction are accepted or abandoned; acceptance then releases the slot host and its Yoga subtree through ordinary Vue lifecycle while retaining the component's write-once identity.
- **Text — `<slot/>` fragment anchors are empty `text-leaf`s.** A `<slot/>` mounts as a
  Fragment whose boundary anchors are empty `text-leaf`s, byte-identical to a genuine `{''}`
  child. The renderer therefore exempts empty text-leaves as fragment anchors on insertion
  (`host/node-ops.ts`). The nested-`<Transform>` positional line-index this fix originally
  served left the codebase with the deleted private Transform host; the anchor exemption is
  what remains.
- **Box — a root `v-if` makes `$el` a Fragment anchor.** `Box` uses a conditional root so closed-prop validation can fail before creating a host node; that root `v-if` makes the component's `$el` a fragment boundary anchor (empty `text-leaf`, no renderer element). Public `useBoxMetrics()` resolves only a direct same-app Box to its own host and derives the result from accepted layout rather than reading Yoga through `$el`. `useFocus(target)` has a different contract: it follows the targeted stateful component's root boundary, unwraps stateful single-root chains and Vue's development-root single-root normalization, preserves a true Fragment as one boundary, and never selects the first rendered descendant.
- **A component ref is not a rendered-lifetime signal.** A public component instance may remain identical while a root `v-if`, keyed root, or HMR rerender replaces its root boundary. Internal behavior behind `useFocus(target)` must use the per-render-root contract in [rendered-target-lifetime.md](./rendered-target-lifetime.md), not add another watcher of the component proxy. The target changes only the opaque handle's validity: hidden or detached ancestry clears current ownership without restoration, while targetless `useFocus()` follows only its Vue scope. Focus ordering, disabled state, scopes, traversal, input routing, and string lookup remain outside Runtime.

## Pitfalls (for adding or editing component SFCs)

- **Bind host-element props in camelCase, or via `v-bind="object"`.** The renderer matches
  yoga/style props by exact camelCase key, and Vue passes a custom-element binding name
  verbatim — so `:flex-grow="1"` reaches the renderer as `flex-grow` and is rejected. Use
  `:flexGrow="1"`, or `v-bind="someObject"` (object keys are preserved). `Box` and `Text` bind
  their public props object with `v-bind`; Static binds only its private host configuration.
- **Host primitive tags are `tui-`-prefixed** (`tui-box`/`tui-text`/`tui-virtual-text`/
  `tui-static`), mirroring Ink's `ink-box`/`ink-text`. The prefix keeps the
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
- The host elements (`tui-box`, `tui-text`, `tui-virtual-text`, `tui-static`)
  compile to raw element vnodes via the build's `isCustomElement` option and are an **internal**
  detail. Consumers use `<Box>` / `<Text>`, never `<tui-box>`. SFC templates may reference the
  host tags directly; their loose typing under `vue-tsc` (no `strictTemplates`) is intentional.
- Runtime components publish stable author-facing constructors rather than the generated SFC `DefineComponent` type. Components with an ordinary default slot use the `PublicComponent` type shim because Vue's automatic JSX runtime routes children through a `children` prop that a declared slot alone does not provide. Prop-free `Static` uses `PublicComponent<Record<never, never>>`, which keeps that ordinary zero-payload slot while preventing the generated SFC type from admitting inherited HTML-like props.
- The separate `@vue-tui/components` package exports each SFC through a stable author-facing constructor rather than leaking the `DefineComponent` generic arity generated by the Vue patch used at build time. Components with a default slot use `PublicComponent<Props, Exposed>` so template and TSX refs preserve their public handle; leaf components use `PublicLeafComponent<Props>` so ignored `children` are rejected. Every exported imperative handle needs a declaration test and a component behavior test; the shared build-output suite verifies that its declaration ships.
- Build/tooling: the `pack` build carries `unplugin-vue/rolldown` (with `isCustomElement` for the host tags) and emits SFC declarations via `dts: { vue: true }`; package declarations must externalize `vue` and `@vue/*` so a consumer resolves one Vue instance and can use a different supported Vue patch release. The runtime **test** Vite config also carries `unplugin-vue/vite` because unit tests import the `.vue` components; `check:type` is `vue-tsc`.
