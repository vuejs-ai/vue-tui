# Terminal UI prior art

> **Status:** unstamped evidence ledger, last reverified 2026-07-11. This record compares how other terminal UI systems handle presentation, history ownership, input ownership, mouse tracking, targeted events, and public widget APIs. It supplies evidence and constraints; vue-tui product and API decisions remain in [goal.md](./goal.md), [product-scenarios.md](./product-scenarios.md), and [api-design.md](./api-design.md).

## Scope and evidence rules

This record exists so a future design does not rely on memory, on the word “inline” meaning the same thing everywhere, or on one familiar framework becoming the accidental default.

- Prefer official source, versioned documentation, or a maintainer-authored issue. The source snapshots below make mutable projects re-checkable.
- A framework implementation proves that a mechanism is possible in its own constraints. It does not prove that the same mechanism is portable, desirable for vue-tui, or compatible with Vue templates and TypeScript.
- A user issue proves that a real failure or tradeoff occurred. It does not define that project's supported contract.
- Self-reported benchmarks, compatibility, and production claims are hypotheses until vue-tui runs a relevant harness. This matters especially for young or rapidly changing projects.
- Before a material API or architecture decision, reverify the relevant rows if the source has changed or the conclusion depends on terminal-specific behavior.

Keep nearby topics in their canonical records:

- Exact Ink alignment and divergence belongs in [ink-divergences.md](./ink-divergences.md), using the repository's pinned Ink baseline.
- Renderer performance mechanisms and benchmark triggers belong in [performance.md](./performance.md).
- Application-scenario evidence and the Herdr responsibility boundary belong in [product-scenarios.md](./product-scenarios.md).
- Accessibility precedents belong in [accessibility-api.md](./accessibility-api.md).

## Comparison terms

### Terminal surface and history ownership

The projects below use several different models that are often all called “inline”:

- **Alternate-screen full-screen:** the application owns the visible alternate buffer until exit; normal shell contents are restored afterward.
- **Main-screen full-viewport repaint:** the application paints the normal buffer like a full-screen surface. Avoiding the alternate buffer does not by itself preserve native scrollback.
- **Bounded main-screen viewport:** the application owns a fixed-height or otherwise reserved region while ordinary output can exist above it.
- **Scrollback-native transcript:** completed output becomes terminal-owned history and is no longer an editable application surface.
- **Split footer or virtual inline:** the application coordinates an owned live region with captured, replayed, or application-managed history. This requires more bookkeeping than merely setting alternate screen off.

A comparison must state the actual ownership model instead of using only `inline` or `fullscreen`.

### Mouse and event delivery

Three layers must also stay distinct:

- **Terminal mouse capture:** enabling a terminal reporting protocol redirects click, drag, and wheel input from terminal-native behavior to the application. This is independent of alternate-screen selection.
- **Raw or application-routed event:** the application receives coordinates or a global message and decides what they mean.
- **Renderer-targeted event:** the renderer knows element geometry, hit-tests the coordinate, selects a target, and may bubble the event through a retained tree.

An API can support terminal mouse input without supporting component-level `@click`. Conversely, a component event API still depends on terminal capture and a reliable coordinate model.

## Source snapshots

| System         | Snapshot used here                                                                                                  | Why it is in this comparison                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Ink            | v7.0.4, [`40b3a757`](https://github.com/vadimdemedes/ink/tree/40b3a7578811fd616341ca4e31cc7748aeeff12f)             | vue-tui's direct lineage and current global-input/focus baseline; exact relationship stays in the dedicated record |
| Ratatui        | [`de5168de`](https://github.com/ratatui/ratatui/tree/de5168de6ba2f4b310565c287764f213f249a61f)                      | explicit full-screen, inline, and fixed viewports with rendering separated from input                              |
| Bubble Tea     | [`fc707bb7`](https://github.com/charmbracelet/bubbletea/tree/fc707bb7ea0161405bb6c653ec93f6a9c6a72fe1)              | global message routing with alternate-screen and mouse modes configured independently                              |
| Textual        | [`1d99508b`](https://github.com/Textualize/textual/tree/1d99508b928a771b51e1a527319c6b87dcff9e05)                   | mature application framework with widgets, focus, bindings, inline mode, and targeted events                       |
| OpenTUI        | [`a0b90640`](https://github.com/anomalyco/opentui/tree/a0b90640761aa89a303c6b5b0d74ef3e6b945652)                    | TypeScript/Zig retained renderer with multiple screen modes, targeted input, and split-footer history coordination |
| Silvery        | [`93f71404`](https://github.com/beorn/silvery/tree/93f7140400bc2187e529d224e3be8cced62eb234)                        | emerging React framework exploring explicit capability plugins and a three-zone inline history model               |
| prompt_toolkit | [`236bfb7c`](https://github.com/prompt-toolkit/python-prompt-toolkit/tree/236bfb7c15c62e921dc81bac5aefcabb16450f0c) | mature input, focus, layout, and key-binding system with separate full-screen and mouse settings                   |
| pi-tui         | [`4c186103`](https://github.com/badlogic/pi-mono/tree/4c1861033b63a04563547ccdb5ed2bf31d4fdcd3/packages/tui)        | coding-agent-driven main-screen component renderer with focused input and line-based differential output           |
| fzf            | [`24832e97`](https://github.com/junegunn/fzf/tree/24832e97ef9640e5f859ede8dc163cf3c27145cb)                         | specialized bounded main-screen application that implements pointer coordinates by tracking its physical origin    |
| OpenAI Codex   | issues linked below, observed 2025-2026                                                                             | coding-agent application evidence for native selection, app scrolling, main-screen repaint, and terminal variation |
| Herdr          | [`66be0b65`](https://github.com/ogulcancelik/herdr/tree/66be0b655fe922867f1eed100a41d67038b6ffd6)                   | terminal-workspace stress case; scenario evidence rather than a general renderer contract                          |

## Framework observations

### Ink

Observed: Ink v7.0.4 exposes global [`useInput`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-input.ts#L126-L174) subscriptions and a flat [`useFocus`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-focus.ts#L5-L82) registry. These APIs explain vue-tui's starting point.

Establishes: a small inline-oriented component framework can be useful without making every rendered node an event target.

Does not establish: that vue-tui should preserve Ink's flat focus model, public surface, writer, or lack of a richer interaction layer. Exact behavior claims must follow [ink-divergences.md](./ink-divergences.md), not this summary.

### Ratatui

Observed: Ratatui models [`Fullscreen`, `Inline`, and `Fixed`](https://github.com/ratatui/ratatui/blob/de5168de6ba2f4b310565c287764f213f249a61f/ratatui-core/src/terminal/viewport.rs#L5-L24) viewports. Inline has a current-row origin and reserved height; fixed accepts a caller-owned rectangle. Ratatui explicitly [does not include input handling](https://github.com/ratatui/ratatui/blob/de5168de6ba2f4b310565c287764f213f249a61f/ratatui/src/lib.rs#L268-L273). Its open [`insert_before` issue](https://github.com/ratatui/ratatui/issues/1426) records wrapping, resizing, flicker, and output-above-viewport difficulties.

Establishes: viewport ownership belongs above ordinary widgets, an inline region can have a non-zero origin, and keeping output plus a live region coherent is substantial renderer work.

Does not establish: a component-event API for vue-tui. Ratatui avoids that question by leaving input and event routing to applications and backend libraries.

### Bubble Tea

Observed: Bubble Tea v2 places [`AltScreen` and `MouseMode` in separate `View` fields](https://github.com/charmbracelet/bubbletea/blob/fc707bb7ea0161405bb6c653ec93f6a9c6a72fe1/UPGRADE_GUIDE_V2.md#L41-L53), and mouse input arrives as a global [`MouseMsg`](https://github.com/charmbracelet/bubbletea/blob/fc707bb7ea0161405bb6c653ec93f6a9c6a72fe1/mouse.go#L44-L63).

Establishes: presentation and terminal mouse capture are independent runtime choices; an application-routed event model avoids promising per-widget pointer behavior.

Does not establish: that Vue authors should manually hit-test coordinates or use a message-update architecture. Bubble Tea's Go and Elm-style authoring model has different API constraints.

### Textual

Observed: Textual's `run` API exposes [`inline` and `mouse` as separate parameters](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/src/textual/app.py#L2224-L2236). The default is a full-screen application, while inline normally reuses the application and widget system and can opt into [`:inline` styling](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/docs/how-to/style-inline-apps.md#L3-L42). Its focused-widget and binding route is documented in the [input guide](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/docs/guide/input.md#L118-L185). A maintainer also notes that many terminals reserve Shift-modified mouse gestures for native text selection in [discussion #3606](https://github.com/Textualize/textual/discussions/3606#discussioncomment-7468314).

Establishes: the same high-level widget system can span more than one presentation, while input ownership remains separately configurable. Textual integrates targeted events with focus and bindings in one application model.

Does not establish: that common vue-tui components should inspect presentation or restyle themselves. Textual explicitly permits mode-specific CSS; vue-tui's current common-component invariant is stricter.

### OpenTUI

Observed: OpenTUI defines independent [`screenMode` and `useMouse`](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/renderer.ts#L161-L179) options. Its screen modes are alternate screen, main screen, and split footer; the default is alternate screen and mouse defaults on. The current [renderer documentation](https://opentui.com/docs/core-concepts/renderer/) says `main-screen` still reserves a rendered region rather than providing scrollback-native inline output, while `split-footer` captures and replays output around an owned footer. Renderables expose [targeted mouse handlers](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/Renderable.ts#L105-L123).

Establishes: a full-screen-first framework can make element events the normal path, but main-screen history coordination remains a separate subsystem. It also independently supports treating presentation and mouse as different axes.

Does not establish: that vue-tui should migrate to OpenTUI, enable mouse by default, or copy its renderable API. Those choices follow its product defaults and native renderer, not a universal terminal rule.

### Silvery

Observed: Silvery's lower-level app builder makes focus and DOM-like mouse dispatch explicit providers through [`withFocus()` and `withDomEvents()`](https://github.com/beorn/silvery/blob/93f7140400bc2187e529d224e3be8cced62eb234/packages/create/README.md#L9-L45). Its convenience `run()` derives mouse separately from presentation: the option defaults to on in full-screen and off in inline ([option contract](https://github.com/beorn/silvery/blob/93f7140400bc2187e529d224e3be8cced62eb234/packages/ag-term/src/runtime/run.tsx#L111-L120), [runtime resolution](https://github.com/beorn/silvery/blob/93f7140400bc2187e529d224e3be8cced62eb234/packages/ag-term/src/runtime/run.tsx#L651-L682)). Its [`dynamic-scrollback` design](https://github.com/beorn/silvery/blob/93f7140400bc2187e529d224e3be8cced62eb234/docs/design/dynamic-scrollback.md#L1-L58) separates mounted live content, application-managed cached history, and terminal-owned history, and explicitly accepts ED3 clearing plus replay for structural redraws.

Establishes: capability composition can make targeted events an explicit application layer, and a richer inline coding-agent experience needs an explicit history lifecycle rather than a boolean screen switch.

Does not establish: Silvery's performance or compatibility claims, nor that its three-zone model is right for vue-tui. It is young, changes quickly, and its documentation is partly a design claim; re-run any mechanism that becomes load-bearing.

### prompt_toolkit

Observed: prompt_toolkit's `Application` stores [`full_screen` and `mouse_support` independently](https://github.com/prompt-toolkit/python-prompt-toolkit/blob/236bfb7c15c62e921dc81bac5aefcabb16450f0c/src/prompt_toolkit/application/application.py#L180-L242). Its [full-screen guide](https://github.com/prompt-toolkit/python-prompt-toolkit/blob/236bfb7c15c62e921dc81bac5aefcabb16450f0c/docs/pages/full_screen_apps.rst#L1-L54) describes one application layout and key-binding system that can also run without alternate screen, consuming only the layout's required space.

Establishes: independent presentation and mouse settings are a mature precedent, and focus/layout/key bindings can form one application model without making alternate screen the definition of interactivity.

Does not establish: the Vue component or package-export shape; prompt_toolkit's Python object model and input abstraction differ substantially.

### pi-tui

Observed: pi-tui's public component contract renders arrays of lines and gives input to the focused component through [`handleInput`](https://github.com/badlogic/pi-mono/blob/4c1861033b63a04563547ccdb5ed2bf31d4fdcd3/packages/tui/README.md#L149-L166). Its main-screen renderer documents three strategies: first output, full repaint when width or off-viewport content changes, and changed-line repaint for ordinary updates, all wrapped in synchronized output ([README](https://github.com/badlogic/pi-mono/blob/4c1861033b63a04563547ccdb5ed2bf31d4fdcd3/packages/tui/README.md#L591-L599)).

Establishes: a coding-agent-oriented framework can prioritize focused keyboard editing and main-screen transcript rendering without first offering a general DOM-like pointer system.

Does not establish: that line-array rendering scales to vue-tui's full application scenarios or that pointer input has low value. It reflects a narrower product and component model.

## Application observations

### fzf

Observed: in non-full-screen mode, fzf sends a cursor-position report to [discover its origin](https://github.com/junegunn/fzf/blob/24832e97ef9640e5f859ede8dc163cf3c27145cb/src/tui/light_unix.go#L96-L114), stores a vertical offset, and [subtracts it from SGR mouse coordinates](https://github.com/junegunn/fzf/blob/24832e97ef9640e5f859ede8dc163cf3c27145cb/src/tui/light.go#L879-L900). After `SIGCONT`, it disables inline mouse because the old offset is likely invalid ([source](https://github.com/junegunn/fzf/blob/24832e97ef9640e5f859ede8dc163cf3c27145cb/src/tui/light.go#L1011-L1016)).

Establishes: targeted pointer input in a bounded main-screen application is technically feasible; it requires physical-origin discovery, coordinate translation, invalidation rules, and fallback behavior.

Does not establish: that the mechanism is reliable across every vue-tui target or with arbitrary external output and multiple dynamic regions. fzf controls a specialized region and interaction model.

### OpenAI Codex

Observed: Codex issue [#1247](https://github.com/openai/codex/issues/1247) describes the direct tradeoff between terminal-native text selection and application-owned mouse scrolling: disabling TUI mouse restores ordinary selection but removes the scroll events the TUI needs. Issue [#14277](https://github.com/openai/codex/issues/14277) reports that `--no-alt-screen` still fails to provide usable native scrollback in several xterm.js-based terminals; the reporter offers main-buffer clearing as a conditional explanation, not a confirmed cause.

Establishes: these are current coding-agent product problems, not theoretical edge cases. Alternate-screen selection, scrollback preservation, mouse capture, and application scrolling must be specified separately.

Does not establish: Codex's formal contract or a portable solution. These are issue reports from particular versions and terminals.

### Herdr

Observed: Herdr combines tabs, split panes, focus, resizing, mouse interaction, PTYs, persistent sessions, and terminal emulation. The pinned source and vue-tui responsibility boundary are recorded in [product-scenarios.md](./product-scenarios.md#terminal-workspace-and-multiplexer).

Establishes: a multi-region terminal shell pressures layout, focus, input routing, overlays, resize, and cell-surface embedding at once.

Does not establish: that vue-tui should own PTY lifecycle, VT parsing, session persistence, detach, transport, or process detection.

## Cross-project constraints for vue-tui

These are evidence-backed constraints to carry into proposals, not accepted public API names:

1. Presentation and terminal mouse capture are independent axes. A full-screen application can leave mouse off; a main-screen application can deliberately capture it.
2. `inline` alone is not a sufficient contract. A proposal must identify the owned region, who owns completed history, whether the physical origin is known, what external output may do, and what resize or suspension invalidates.
3. Terminal-level mouse input and renderer-targeted pointer events are different capabilities. A low-level coordinate stream is not an inline replacement for component `@click` unless the application also owns hit testing.
4. Enabling mouse reporting changes terminal-native selection and wheel behavior even on the alternate screen. Automatic “when used” acquisition minimizes duration but does not remove the user-facing tradeoff.
5. Inline targeted pointer is possible, as fzf demonstrates, but it is not free. vue-tui cannot promise it until its own writer tracks an origin and validates invalidation across target terminals.
6. A bounded `ScrollBox` depends on an allocated rectangle and application-owned history, not intrinsically on alternate screen. Terminal-native transcript history is a different operation.
7. Reusing one widget tree across modes does not require hiding mode-dependent capabilities. Established systems either keep input global, configure capabilities independently, use explicit plugins, or make full-screen the dominant default.
8. Peer API names do not settle Vue API names. Vue listener fallthrough, SFC compilation, TypeScript subpaths, refs, composables, and package layering require vue-tui-specific type and authoring decisions.
9. A peer's component catalog is not a roadmap. New vue-tui components still need the evidence bar in [components-design-principles.md](./components-design-principles.md#inclusion-bar--product-driven-and-evidence-backed).

## Required peer check for future decisions

Before accepting a public presentation, input, pointer, focus, scrolling, renderer, or component architecture proposal:

1. Name the representative vue-tui journey and observable problem.
2. Describe the terminal surface and history ownership using the terms above.
3. Select the relevant peers from this record and state where their constraints match and differ.
4. Re-run or source-check any peer behavior that is load-bearing, terminal-dependent, self-reported, or newer than the pinned snapshot.
5. Explain why the proposed Vue API follows from vue-tui's authoring model rather than from another language's syntax.
6. Cover inline, full-screen, non-TTY/static, screen-reader, testing, teardown, and fallback behavior as applicable.
7. Link the final local decision back here and update a stale snapshot or conclusion in the same change.

## What this evidence does not decide

This comparison does not decide:

- whether inline or full-screen becomes vue-tui's primary presentation;
- whether vue-tui adds a separate app creator or any particular export path;
- whether pointer input is default, opt-in, or unavailable in a given release;
- whether a `PointerBox`, directive, composable, or semantic action component becomes public;
- which components belong in `@vue-tui/components`;
- whether the renderer should migrate to another project or adopt native code;
- whether another framework's benchmark or compatibility claim applies to vue-tui.

Those decisions require vue-tui scenario evidence, its current implementation, and the review template in [api-design.md](./api-design.md#review-template-for-each-proposed-api).
