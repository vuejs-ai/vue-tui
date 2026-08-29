# Product intent

This record covers vue-tui as one product. Runtime occupies much of it because Runtime is the core product layer and carries the framework's foundational responsibilities; the direction also applies to the higher-level packages and official tooling that complete the product.

## Positioning

[VOUCHED @hyfdev 2026-08-29]

vue-tui is a Vue-native application framework for interactive terminal applications.

Complex, long-lived applications that continuously update and respond to input are the primary product workload. Their rendering, input, layout, asynchronous-update, and terminal-lifecycle requirements set the architectural bar and product priority.

One-shot commands, pipelines, simple prompts, and non-interactive document output remain supported secondary workloads. The same foundation should serve them coherently, but their simpler requirements do not take priority over needs that block complex interactive terminal applications.

"Complex" refers to a UI that must coordinate layout, input, continuous updates, and terminal lifecycle; it does not refer to the size of the codebase or the complexity of the application domain.

The product value is that a Vue developer can build and ship a reliable interactive terminal application without assembling the renderer, terminal lifecycle, development, and verification foundations by hand.

## Product promises

- **Vue-native authoring.** Public APIs should follow Vue's design philosophy and established conventions, so Vue developers can use familiar component composition, reactivity, lifecycle, props, events, slots, and composables. [VOUCHED @hyfdev 2026-08-29]
- **Reliable terminal behavior.** Complex interactive applications set the quality bar: output, input, layout, continuous updates, responsiveness, interruption, errors, and cleanup must be reliable and predictable under real terminal conditions. [VOUCHED @hyfdev 2026-08-29]
- **Complete development and verification.** First-party HMR and build tooling, component and interaction testing, real-terminal verification, starter material, and documented production build paths are product responsibilities for building, testing, and shipping complex interactive terminal applications. Problems in `@vue-tui/vite` and `@vue-tui/testing` are product work when they affect this path, not merely auxiliary repository maintenance. [VOUCHED @hyfdev 2026-08-29]
- **Stable generic contracts.** Public APIs and user-consumable types should converge on a coherent and dependable 1.0 contract. [VOUCHED @hyfdev 2026-08-29]

## Product work

A proposed change qualifies as product work when it addresses a reproducible problem inside the [product boundaries](#product-boundaries), can keep any public contract generic, and can be verified at the appropriate layer.

### Priority

[VOUCHED @hyfdev 2026-08-29]

Product work must address a reproducible problem that belongs to the framework. Among such problems, prioritize work that severely blocks complex interactive terminal applications or benefits multiple applications. Real consumers, representative workloads, repeated implementations, and test failures are all valid evidence; evidence sources have no fixed ranking. Work that affects only simple workloads has lower priority unless it exposes a correctness failure in shared foundations.

## Reusable Runtime behavior

When a low-level interaction behavior recurs across multiple complex terminal applications, is generic rather than application-specific, and requires renderer or terminal ownership, it may become a first-party `@vue-tui/runtime` API or composable. The concrete Runtime shape follows the demonstrated problem rather than a predefined catalog. Higher-level component admission is governed separately by the [`@vue-tui/components` design principles](./components-api-design.md#inclusion-bar--product-driven-and-evidence-backed).

## Rendering modes

[VOUCHED @hyfdev 2026-08-29]

Inline and Fullscreen are both first-class rendering modes. Every feature must consider both. Shared APIs should support both where their screen models honestly allow it; any mode-specific behavior or limitation must be explicit.

Inline uses the main screen, delegates completed output to terminal-owned scrollback, and must never erase terminal history or shell output that existed before the application started. Fullscreen uses the alternate screen, and the application owns and redraws the entire viewport.

## Product boundaries

[VOUCHED @hyfdev 2026-08-29]

vue-tui owns reusable UI-framework capabilities, including Vue integration, rendering and layout, terminal interaction and lifecycle, generic interaction behavior, and development and testing support. Application-domain logic and specialized infrastructure remain in applications or dedicated libraries. vue-tui may provide generic integration points, but it does not take ownership of the external system itself.

## Success looks like

[VOUCHED @hyfdev 2026-08-29]

A Vue developer can build, test, and ship a complex interactive terminal application without reimplementing shared rendering, layout, input, live-update coordination, and terminal-lifecycle foundations. Simpler, short-lived, or non-interactive uses are supported coherently by the same architecture.
