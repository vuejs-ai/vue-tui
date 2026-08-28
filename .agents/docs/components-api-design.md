# @vue-tui/components API design

This record applies only to the higher-level `@vue-tui/components` package. It does not decide admission into `@vue-tui/runtime`; Runtime follows the separate [reusable Runtime rule](./intent.md#reusable-runtime-behavior).

`@vue-tui/components` currently exports `Newline`, `ScrollBox`, `Spacer`, `Spinner`, and `Table`. Component-specific contracts live in [ScrollBox](./components/scroll-box.md), [Spinner](./components/spinner.md), and [Table](./components/table.md).

## Package boundary

Components are Vue-native compositions of supported public Runtime primitives and composables. Runtime owns terminal I/O, terminal lifecycle, rendering, layout, and accepted paint facts. This package owns reusable presentation and interaction policy that can be built above that boundary.

Never import Runtime source paths, raw `tui-*` hosts, Yoga nodes, or `@vue-tui/runtime/internal/*`. If a component cannot be implemented correctly from supported public capabilities, first establish the smallest generic missing Runtime operation rather than bypassing the boundary.

## Inclusion bar — product-driven and evidence-backed

[VOUCHED @hyfdev 2026-07-10]

A component earns its place by closing a recurring need in an [active product scenario](./product-scenarios.md#active-application-scenarios) or a real consumer. A representative journey is product evidence: when it repeatedly hand-rolls the same difficult interaction, the project may add a first-party component proactively instead of waiting for a separate community request. Demonstrated broader community demand remains equally valid.

"Ink (or Textual, OpenTUI, or any framework) has it" is not a reason on its own. Another project can show that a problem exists, but vue-tui still needs evidence that the problem belongs in its own scenario journeys or consumer workflows.

The public piece must remain generic. Provider protocols, agent or tool-call models, Git and database schemas, monitor collectors, and purely application-specific visual treatment stay in applications or specialized libraries. Repeated behavior may become a component, an independent composable, or a missing runtime capability; the scenario does not predetermine the layer.

This **extends** the [alignment-is-a-means principle](./ink-divergences.md) to a different axis.
That principle governs _behavior_ (match Ink only where Ink is already correct); this one governs
_set-membership_ (which components exist at all). "Ink has it" justifies neither — but for a
component we _do_ ship, we still borrow proven behavior where it fits (see _Vue-idiomatic,
Ink-inspired_).

## Vue-idiomatic, Ink-inspired

A component should feel like Vue through props, models, events, slots, refs, lifecycle, and composables. Peer frameworks are bounded behavioral evidence, not API or catalog templates. Correctness and Vue philosophy outrank parity; exact Ink relationships belong in [ink-divergences.md](./ink-divergences.md).

Prefer declarative state. Use an exposed imperative handle only for an action such as scrolling that cannot be represented honestly as a prop, model, event, or slot. Component-owned timers are ordinary higher-layer behavior; only direct terminal or commit-scheduler ownership requires Runtime.

## Convenience components

`Newline` and `Spacer` are intentionally small authoring conveniences rather than new capabilities. `Newline` emits newline characters inside `Text`; `Spacer` is a growing `Box`. Runtime does not own either because both are complete public compositions.

These two do not establish a blanket convenience catalog. Another convenience component still needs its own case and must remain incapable of drifting from the Runtime behavior it names.

## Public type contract

- Templates and TSX must both reject wrong props, models, event payloads, slot payloads, and imperative handles.
- Collection components infer their item type without leaking `any`; extracted definitions use ordinary TypeScript mechanisms such as `satisfies` rather than package-specific identity helpers unless evidence requires one.
- Stable public constructor types hide generated SFC generic details across supported Vue patch releases. Default-slot components preserve typed children and exposed handles; leaf components reject ignored children.
- Verify every public type shape through real template and TSX fixtures rather than inferring it from the source declaration alone.

## Boolean prop naming & defaults

[VOUCHED @hyfdev]

Component boolean props follow Vue-ecosystem and terminal-UI convention — not verb-prefixed toggles.

- **A boolean prop is a noun or an adjective, never a verb.** `bordered`, `clearable`, `mouse`, `keys` — not `enableBorder` / `enableMouse`. None of the major Vue libraries (Element Plus, Naive UI, Vuetify, Ant Design Vue, PrimeVue) use an `enable*` boolean prop; the terminal-UI precedent (blessed) is bare `mouse` / `keys`. (`enable*` is a React-library pattern, e.g. TanStack Table — not idiomatic in Vue or in TUIs.)
- **Booleans default to `false`.** `<Comp foo>` then reads as "turn foo on." A feature that must be on by default is named as its negative (`disabled`) so the prop still defaults `false`; avoid a verb-boolean that defaults `true`, which forces the backwards `:enable-foo="false"`. (Matches MUI's published API-design guidance.)
- **Name for precision — what is toggled, not the device.** A bare device noun reads ambiguously; prefer the specific behavior it controls (e.g. `wheel` for mouse-wheel scrolling rather than `mouse`, which would also imply clicks).
- **A prop with a global / terminal-wide side effect is opt-in (`false` by default), and the side effect is documented.** Example: enabling terminal mouse tracking suppresses the terminal's native text selection window-wide (users bypass with Shift) — so such a prop must be opt-in, not on by default.

## Accessibility is not a current component contract

Runtime exposes no screen-reader presentation or semantic accessibility primitive, so components cannot claim built-in terminal accessibility through inert ARIA-shaped props. Any component accessibility convention requires a complete Runtime contract covering semantics, host behavior, lifecycle, and real assistive-technology evidence.
