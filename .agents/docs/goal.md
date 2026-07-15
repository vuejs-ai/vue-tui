# Product goal

> **Status:** maintainer-reviewed product direction. Vouched sections are the durable reference; implementation details and evidence remain challengeable where they are not stamped.

## Positioning

[VOUCHED @hyf0 2026-07-10]

vue-tui is a Vue-native application framework for interactive terminal UIs.

It is for stateful applications that stay alive, react to user input and asynchronous events, and repeatedly update what the user sees. It is not trying to replace ordinary command-line tools for one-shot commands, pipelines, or simple prompts that do not need an application UI.

Coding agents are a major application scenario, not the definition of the whole product. The framework must also serve real-time task and monitoring applications and multi-region data workbenches. The active scenario model is recorded in [product-scenarios.md](./product-scenarios.md).

## What makes it an application framework

[VOUCHED @hyf0 2026-07-10]

vue-tui combines:

- a mature renderer that the project owns and evolves;
- Vue-native authoring through components, SFCs or JSX, reactivity, lifecycle, props, slots, events, `v-model`, and composables;
- terminal foundations for layout, paint, input, focus, cursor, mouse, resize, streaming updates, scrolling, process lifecycle, and terminal restoration;
- useful first-party APIs, components, and composables for interaction patterns that recur across supported applications;
- a complete authoring and verification loop: HMR, component tests, interaction tests, real-PTY visual verification, examples, starter material, and a documented production build path.

Owning a renderer is an implementation responsibility, not the product value on its own. The product value is that a Vue developer can build and ship a reliable interactive terminal application without assembling those layers by hand.

## Product promises

- **Vue-native authoring.** Public APIs should feel like Vue rather than a translation of a React or imperative API.
- **Mature terminal behavior.** Visible output, input, focus, cursor, mouse, resize, asynchronous updates, errors, interruption, non-TTY behavior, and cleanup should be predictable under real terminal conditions.
- **Useful building blocks.** Repeated interaction behavior should become a generic first-party API, component, or composable when supported by a representative journey or a real consumer.
- **A complete feedback loop.** Authors should be able to develop quickly, test behavior deterministically, inspect the final emulated terminal screen, and verify a clean packaged consumer.
- **Stable generic contracts.** Public APIs and user-consumable types should mature toward a dependable 1.0 surface without freezing weak early designs.
- **Clear package boundaries.** Terminal rendering and I/O, reusable interaction logic, and composed UI pieces stay in their recorded layers; application-specific data and business behavior stay in the application.

## API stability during experimentation

[VOUCHED @hyf0 2026-07-11]

vue-tui is currently experimental. Until a future stability milestone is explicitly accepted, existing public APIs are not backward-compatibility constraints. Treat each shipped API as evidence about the current implementation, then decide from the target product and terminal model whether to retain it, redesign it, or delete it. Design work should prefer one coherent target contract over aliases, deprecation windows, precedence rules, or compatibility shims whose only purpose is to preserve current releases.

## Rendering modes

[VOUCHED @hyf0 2026-07-11]

Rendering mode selects one of two terminal screen models:

- **Inline mode.** The application renders in the terminal's main screen buffer, so completed output can remain in native terminal scrollback.
- **Full-screen mode.** The application uses the alternate screen and owns a persistent viewport until it exits and restores the prior screen.

The product supports both modes. No decision currently makes either one the primary product mode or treats the other as a degraded fallback. Work that affects only one mode must say so; shared APIs should support both when their terminal models honestly allow it, without hiding real differences behind a misleading common abstraction.

A future hierarchy decision requires evidence from representative journeys in both modes and explicit maintainer review. No current or future mount default settles that product decision by itself; the exact clean-slate mount API is a separate design choice.

## Inline scrollback ownership

[VOUCHED @hyf0 2026-07-11]

The coordinated inline renderer must never erase terminal history or shell output that existed before the application started. Applications that need behavior outside that guarantee must retain an explicit application-side escape hatch. This vouch does not choose the exact overflow presentation, implementation mechanism, or escape-hatch API. Those details may be derived or proposed through real-terminal evidence, but they cannot weaken the scrollback invariant implicitly.

## Application scenarios and shared interaction flows

[VOUCHED @hyf0 2026-07-10]

The active application scenarios are:

1. **Conversational applications:** coding agents, chat interfaces, REPLs, and interactive debuggers.
2. **Real-time tasks and monitoring:** build, test, and deployment runners; process, service, job, queue, and cluster monitors and control surfaces.
3. **Multi-region data workbenches:** Git, database, API, file, project, cloud, Kubernetes, and dependency tools that combine navigation, details, actions, and live state.

A terminal workspace or multiplexer such as Herdr is a demanding subscenario of the multi-region workbench. vue-tui can own its visible application shell, but specialized terminal-session infrastructure remains outside the framework core. The exact boundary and the reusable interaction flows are recorded in [product-scenarios.md](./product-scenarios.md).

## How product work is chosen

[VOUCHED @hyf0 2026-07-10]

Product work starts from concrete evidence, in this order of strength:

1. a user-visible failure in a representative journey from an active application scenario;
2. a reproducible problem from a real vue-tui consumer;
3. behavior that several applications repeatedly have to implement and get right themselves;
4. a reproducible failure in renderer correctness, the Vue contract, terminal lifecycle, development workflow, packaging, or an objective test gate.

Coding-agent work is valuable because it stresses streaming, editable input, approval, tools, long output, and interruption together. It does not automatically outrank a clearer or more broadly reusable framework problem from another active scenario.

Public framework APIs stay generic. Provider protocols, Git models, database schemas, monitor collectors, agent state machines, and purely application-specific presentation remain in applications or specialized libraries. A competitor's widget catalog or internal architecture is prior art, not a roadmap by itself.

## Product boundaries

[VOUCHED @hyf0 2026-07-10]

- vue-tui owns terminal UI rendering, Vue integration, reusable interaction behavior, development tooling, and verification support.
- It does not provide model SDKs, agent loops, tool-execution policy, Git or database clients, monitoring collectors, or other application business layers.
- A terminal-workspace application may use vue-tui for layout, tabs, panes, focus, mouse, status, and high-frequency rendering. PTY process ownership, ANSI/VT emulation, detach servers, sockets, SSH, session persistence, and coding-agent process detection belong to the application or specialized libraries.
- A generic view over an externally supplied styled terminal-cell grid may become framework work only after repeated consumer evidence establishes a stable UI abstraction. vue-tui does not need to become a terminal emulator to render such a view.
- A complete text editor, terminal emulator, multiplexer backend, or game engine is not a core product goal, even though those workloads can expose useful renderer limits.
- `@vue-tui/components` currently has no blanket accessibility requirement. A component may opt in where appropriate; this does not remove or redefine the runtime's existing accessibility APIs. See [components-design-principles.md](./components-design-principles.md#deliberately-omitted).
- The project does not add a component merely to match another framework or claim that arbitrary browser UI can run unchanged in a terminal.

## Success looks like

- A Vue developer can build a reliable application in each active scenario without implementing terminal escape handling, layout, repaint coordination, focus, input decoding, resize, and restoration from scratch.
- Repeated workflow, finder, and viewer behavior is available through coherent generic APIs, components, and composables instead of being copied between applications.
- Inline and full-screen behavior is explicit, tested under a real PTY, and faithful to each screen model.
- Representative journeys are deterministic enough for CI and also support agent-driven visual inspection of the final emulated screen. Several journeys may share an example application; the product does not require one showcase per scenario.
- Published examples and a clean tarball consumer exercise the documented development and production paths without importing private runtime internals.
- Common author mistakes are rejected by template and TSX types when possible and otherwise fail with a clear, recoverable runtime error.

## Durable evidence

- The first-party [coding-agent example](https://github.com/vuejs-ai/vue-tui/tree/3e44c9a266e52ebeba2db669b4bb96521b9e2f3a/examples/coding-agent) exercises streaming, tool execution, approval, and `@vue-tui/runtime/inline` `Static` output, although much of its higher-level interaction behavior is still application code.
- [mo](https://github.com/liangmiQwQ/mo/tree/6bea467a6995f4912e809b417b5c56a3964cc556) is a real inline vue-tui consumer whose project selector exercises search, filtering, preview, selection, and shell handoff.
- [machud](https://github.com/hyf0/machud/tree/a51a6853686eb818471d0027d2549e6e664c9b36) is a real full-screen vue-tui consumer that exercises layout, resize, input, HMR, and self-contained distribution.
- [Herdr](https://github.com/ogulcancelik/herdr/tree/66be0b655fe922867f1eed100a41d67038b6ffd6) demonstrates the terminal-workspace subscenario with tabs, panes, real PTYs, persistent sessions, and agent state. Its Ratatui UI, `portable-pty` dependency, and vendored `libghostty-vt` keep the visible application framework and terminal-session engine as distinct responsibilities.
- Reproducible issues such as [`v-show` #246](https://github.com/vuejs-ai/vue-tui/issues/246) and [`useInput` ownership #250](https://github.com/vuejs-ai/vue-tui/issues/250) are evidence for Vue-contract and interaction gaps; they do not define the product alone.

Reconsider the vouched direction only when representative journeys or real consumers contradict it, or when measured limitations make the current product or package boundaries untenable. New API names, component shapes, scenario ordering, and release plans remain separate decisions until reviewed and vouched.
