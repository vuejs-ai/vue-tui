# Accessibility (ARIA + screen-reader) API

How vue-tui exposes ARIA and renders screen-reader (SR) output, and why. Companion to the
aria-camelCase vouched entry in [ink-divergences](./ink-divergences.md); `renderToString` being layout-only and the
`useWindowSize` name are now Ink parity (not divergences), and the reactive-refs return shape is
covered by the shallowRef entry there. This file keeps the _why_ and the researched / run-verified
findings those entries deliberately omit, so they are not re-derived expensively. The exported aria
types are part of the public contract — see [api-contract](./api-contract.md).

## The constraint that shapes everything

vue-tui renders to a terminal — **no DOM, no browser accessibility tree.** To support screen
readers it must READ aria semantics off its own components and GENERATE the linearized SR text
itself (e.g. `<Box aria-role="checkbox" aria-state={{ checked: true }}>Accept</Box>` →
`"(checked) checkbox: Accept"`). So aria values must reach the framework as something it can read
at the component boundary — i.e. **component props** — exactly like Ink, which is also a no-DOM
renderer. The mainstream Vue a11y pattern (let `aria-*` fall through to the DOM as kebab
attributes and let the browser interpret them) is structurally unavailable here: there is no DOM
to receive them and no browser to read them.

## Naming: typed camelCase props (kebab works at runtime)

- Props are camelCase — `ariaLabel` / `ariaHidden` / `ariaRole` / `ariaState` — with exported
  `AriaRole` (union) and `AriaState` (object) types, field-for-field identical to Ink's.
- Ink uses kebab string-literal prop KEYS (`'aria-role'`). vue-tui does not, because Vue's prop
  convention is camelCase AND camelCase is the only spelling the type-checker validates (below).
- Ink's kebab spelling still works at runtime: Vue camelizes an incoming kebab attribute onto the
  declared prop, and `node-ops` accepts both `aria-role` and `ariaRole` keys on the host node. So
  `aria-role` ports from Ink/HTML unchanged — it is the runtime-compatible escape, not the
  type-safe path.
- This is a Vue-idiom + reasonableness choice, **not parity** (Ink is kebab). See the
  "The governing principle: correctness first, alignment is only a means" section in
  [ink-divergences](./ink-divergences.md).

## Type-safety boundary (run-verified: `tsc` + `vue-tsc`)

camelCase is the ONLY spelling that is compile-checked, and it is checked in both authoring
contexts:

- **TSX (`tsc`)** and **templates (`vue-tsc`)**: a bad value (`ariaRole="notarole"`), a typo
  (`ariaRol`), or an unknown / compound-misspelled name all produce a COMPILE ERROR.
- **kebab `aria-*` is NOT compile-checked** in either context: Vue/Volar treat `aria-*` (and
  `data-*`) as always-valid global attributes, so they bypass prop-matching. Control proving the
  hole is `aria-*`-specific (not general fallthrough): a non-aria kebab like `border-style` IS
  checked — Volar camelizes it to `borderStyle` and validates the value.

→ **The type-safe spelling is camelCase**; `aria-role` is the runtime-only porting escape the
compiler cannot guard. To reproduce: a scratch `.tsx` run through the package `tsc`, and a scratch
`.vue` run through `vue-tsc` (the repo has no vue-tsc — install it in an isolated dir), importing
`Box` from the built dist, asserting which mis-writes error.

## The compound-word pit (and the rule)

camelCase↔kebab is ambiguous for COMPOUND aria words: a human writes `ariaHasPopup`, but Vue's
`camelize` derives `ariaHaspopup` from the canonical `aria-haspopup` (the long-open vuejs/core
#5477). The current single-word vocabulary (role / label / hidden / state) camelizes losslessly,
so the pit is **latent, not live**.

**Rule:** any future compound aria word must be declared as the mechanical camelize of the kebab
name (`ariaHaspopup`, never the human-natural `ariaHasPopup`) or folded into the typed `ariaState`
object — never bridged by relying on auto-camelize. In TSX, and in templates via the camelCase
spelling, TS catches a wrong compound name; a kebab compound in a template is silent, so camelCase
is the guarded path. The cross-field consensus (see precedents) is the same: **never auto-camelize
an aria round-trip.**

## `aria-hidden` modeling

ARIA's `aria-hidden` is a tristate enumerated STRING (`true` / `false` / `undefined`, default
`undefined` = visible) — not a boolean; `aria-hidden="false"` explicitly means _visible_. Ink
models it as a plain `boolean` (bare → true) and vue-tui follows that for ergonomics. Known edge
(run-verified): the literal string `aria-hidden="false"` currently HIDES (Boolean-prop coercion
sees the non-empty string as truthy) where ARIA says visible; bare / `={true}` hide, and
`={false}` / omitted are correctly visible. Fixable with an explicit normalize if it ever matters.

## SR rendering architecture

- **Live path:** `app.mount({ isScreenReaderEnabled })` (or `INK_SCREEN_READER=true`) makes each
  commit emit the linearized SR text instead of the ANSI frame.
- **`renderToString`:** public, **layout-only** (matches Ink). Its SR-capable variant is `renderToStringWithScreenReader` in `@vue-tui/runtime/internal`, used by the accessibility test suite — the public string API does not surface SR (Ink also keeps its SR-string rendering test-internal). F1.5 fixes these as separate visual and screen-reader document hosts: the public function rejects recognizable hidden presentation passthrough, the internal helper name selects SR without another flag, both provide truthful string-session facts, and both use isolated inert streams rather than process terminal state.
- **`renderScreenReaderOutput(node)`:** the linearizer that walks the host tree's
  `internal_accessibility`. **`/internal`-only** [VOUCHED @hyf0]. Ink keeps its
  counterpart (`renderNodeToScreenReaderOutput`) module-internal and never exports it; we match
  that. It was never usefully public anyway — its only parameter type (`TuiNode`) and the
  node-construction primitives needed to build one are not in the public barrel, so a public
  consumer could not name or construct the argument. No example/README/user path used it; the live
  SR machinery (`render`, the internal `renderToStringWithScreenReader`, the `<Static>` channel)
  imports it from the source module, unaffected. Public SR output is reached via the `mount`
  `isScreenReaderEnabled` option, not by calling this directly.

## Precedents (condensed) — cross-field consensus

How other systems shape an aria API, surveyed when settling vue-tui's:

- **React / Ink:** kebab string-literal prop keys, typed union/object; JSX keys never camelize, so
  there is no round-trip to disagree. (vue-tui can copy the SHAPE, not the mechanism — Vue
  camelizes.)
- **AccessKit** (drives egui; the strongest other no-DOM precedent): abandons strings for a typed
  `Role` enum + typed state methods — no kebab to convert at all.
- **Vue a11y libraries** (Reka UI / Headless UI / Vuetify): kebab `aria-*` as fallthrough
  attributes onto the DOM, never declared props — relies on a DOM + browser, so unavailable here.
- **Web Components / HTML reflection / Lit:** dual surface bridged by an EXPLICIT curated map
  (`aria-haspopup` ↔ `ariaHasPopup`, `aria-posinset` ↔ `ariaPosInSet`), never auto-camelize — the
  platform's own answer to the compound problem, and proof that naive remove-dash-uppercase is
  wrong.
- **WAI-ARIA spec:** aria names are all-lowercase single tokens (`aria-haspopup`, not
  `aria-has-popup`); `aria-hidden` etc. are tristate strings, not booleans.

**Consensus across all of them: never auto-camelize an aria round-trip.** vue-tui satisfies it for
single-word props (lossless) and the compound-word rule above preserves it.
