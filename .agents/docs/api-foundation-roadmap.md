# API foundation roadmap

> **Status:** unstamped execution ledger. This record tracks API foundations that have been discussed or proposed but are not yet completely implemented and shipped, plus the completed direct prerequisite that anchors the sequence. [api-design.md](./api-design.md) owns the rationale and candidate shapes; this record owns execution order, current state, and the evidence required to call a foundation done.

## Why this exists

A durable design note is not a shipped capability. Without a separate ledger, a future contributor can mistake a candidate example for public API, start a dependent feature before its assumptions are true, or repeatedly reopen a question whose next step is implementation rather than more discussion.

Foundation work is ordered by dependency and reuse, not by which feature was discussed most recently. Only one foundation is active at a time. Later items may be researched when that directly unblocks the active item, but they do not become parallel implementation projects.

The [autonomous iteration plan](./autonomous-iteration.md#current-live-objective) must name the same Active item. If the two records disagree, stop planned API work and reconcile them before choosing a task.

An item belongs here when it changes a shared application contract, runtime ownership, interaction delivery, lifecycle, or testing foundation used by several scenarios. Component-catalog additions, application-specific behavior, and speculative renderer optimization do not belong here.

## Status rules

- **Active:** the only foundation currently being closed.
- **Queued:** ordered work whose dependencies or active predecessor are incomplete.
- **Parked:** a possible extension without evidence that it belongs on the current critical path.
- **Done:** the public contract, compatibility behavior, implementation, types, tests, records, and required real-terminal evidence all agree. A design decision or prototype alone is not done.

Moving an item to Done requires, as applicable:

1. an accepted public contract with requested, effective, unavailable, cleanup, and error behavior;
2. an explicit compatibility plan for every shipped API whose meaning, type, export path, or behavior changes;
3. implementation through public package exports without exposing host, Yoga, cell-buffer, or terminal-controller internals;
4. template and TSX type tests, API export guards, focused behavior tests, and lifecycle tests;
5. coverage across inline, full-screen, non-TTY/static, screen-reader, deterministic-test, HMR, and teardown environments where the API can be called;
6. real-PTY verification for terminal modes, screen ownership, coordinates, input fallthrough, restoration, or other terminal-visible claims;
7. updated canonical records and `vp run ready` passing.

## Current checkpoint

**Active foundation:** F1 — rendering-mode session contract.

**Active checkpoint:** F1.1 — produce and obtain maintainer acceptance of one finite rendering-mode and host behavior matrix. This is the only planned API task currently in progress.

The source audit and recommended target are now recorded in [rendering-mode-matrix.md](./rendering-mode-matrix.md). The inventory is complete; F1.1 is waiting on the six product choices in its [maintainer-decision section](./rendering-mode-matrix.md#maintainer-decisions). Do not begin F1.2 while those choices are open.

The matrix must cover every supported combination of requested mode, live/static/test host, stdout and stdin TTY state, interactivity, and screen-reader path. For each combination it records:

- effective rendering mode and fallback or failure;
- terminal surface and history ownership;
- whether the physical origin and element hit map are reliable;
- `Static`, coordinated external output, resize, suspension, final output, and restoration behavior;
- which finite session facts are observable without defining later operation-specific APIs.

F1.1 is complete when the matrix contains no implicit environment case, distinguishes current behavior from target behavior, links every implemented claim to a test or canonical record, and the maintainer accepts the remaining product choices. It does not choose the final public environment composable, compatibility window, or implementation patch.

The next checkpoint is not active yet. After F1.1 is accepted, update this section to F1.2 for the exact `mode` mount and compatibility contract; later F1 checkpoints cover the finite public session-fact API and implementation/testing matrix. Never infer checkpoint activation from this preview: only this section marks current work.

## Priority order

| Order | Foundation                      | Status     | Current design state                                                                                                                                                                                                                                                                                               | Current implementation state                                                                                                                                                    | Why this order                                                                                                                                                                                              |
| ----- | ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F0    | Fixed full-screen surface       | Done       | The terminal-sized viewport, origin, clipping, coordinated-output, Static, and direct-write contracts are recorded.                                                                                                                                                                                                | Merged in [#254](https://github.com/vuejs-ai/vue-tui/pull/254) as `f1ce02b`.                                                                                                    | A reliable full-screen surface is the prerequisite already completed for addressable geometry and hit testing.                                                                                              |
| F1    | Rendering-mode session contract | **Active** | One `createApp`, public target term `mode`, inline compatibility default, and both modes first-class are selected. The finite [current-versus-target matrix](./rendering-mode-matrix.md) is drafted and awaiting six maintainer choices; the exact public facts and migration remain open.                         | The shipped mount API still uses `fullscreen` and deprecated `alternateScreen`; testing and static-render APIs do not expose the complete mode matrix.                          | Every capability and mode-specific API needs one truthful answer for what surface is requested, what became effective, and which environment is running.                                                    |
| F2    | Rendered-target lifetime        | Queued     | A behavior bound to a rendered ref must register on non-null, unregister on removal, retarget on ref change, and clean up on scope disposal. The public target-ref type and any reusable abstraction remain open.                                                                                                  | `useDraggable` contains a local ref watcher; issue #250 demonstrates that setup-scope lifetime alone is insufficient elsewhere. There is no shared tested registration seam.    | Focus and pointer must not build separate, subtly different answers to `v-if`, retargeting, unmount, and HMR. This is an internal lifecycle foundation first, not a reason to publish a generic target API. |
| F3    | Normalized input and routing    | Queued     | Input must be parsed once, preserve the key/text/paste facts the parser already knows, and define handled/continue plus priority/fallthrough. Exact event and compatibility APIs remain open.                                                                                                                      | `useInput` broadcasts to every active listener and exposes a reduced `Key`; protocol replies, application handlers, and external PTY fallthrough do not share one public route. | Routing is required by every interactive scenario and should define delivery semantics before focus or pointer specializes them.                                                                            |
| F4    | Logical focus and focus scopes  | Queued     | The app runtime should own one effective logical-focus target, with rendered lifetime, traversal, traps, and restoration. Exact attachment, scope, and compatibility APIs remain open.                                                                                                                             | The current focus registry is flat, string-ID based, and separate from input delivery and rendered elements.                                                                    | Focus can then select one owner inside the already-defined input route instead of inventing its own event model; it immediately unlocks editors, finders, overlays, and keyboard-driven scrolling.          |
| F5    | Semantic geometry and caret     | Queued     | Focus, measurement, scrolling, cursor placement, and later pointer delivery need a coherent way to refer to element-relative geometry without making them the same state. Exact public shape remains open.                                                                                                         | `useCursor`, `useBoxMetrics`, `measureElement`, `useDraggable`, focus IDs, and mouse targets use disconnected coordinate and target types.                                      | Editors need a real caret after focus, and pointer needs the same rendered geometry later. Making this explicit avoids hiding coordinates inside the ref-lifetime seam or the pointer API.                  |
| F6    | Full-screen targeted pointer    | Queued     | Common visual components stay passive; targeted behavior composes onto a rendered ref from a proposed `@vue-tui/runtime/fullscreen` path; a live target acquires the minimum reporting level. Exact hook name, signature, event target, propagation, coordinates, unavailable behavior, and migration remain open. | Shipped v1 exposes listener props and root `useDraggable`; `/fullscreen` does not exist; the controller requests drag reporting for every targeted handler.                     | This depends on truthful mode facts, rendered-target lifetime, shared delivery semantics, focus, and geometry. Solving it afterward avoids second event, focus, or coordinate systems.                      |
| F7    | Scroll composition              | Queued     | `ScrollBox` remains common, bounded, input-free, and imperative. Returning whether a semantic scroll operation moved is only a proposal for nested routing.                                                                                                                                                        | The imperative handle is shipped; it returns `void` and has no built-in pointer or keyboard policy.                                                                             | Decide return values and nested propagation only after real focus and pointer delivery can demonstrate the need; otherwise a speculative return-type change becomes public debt.                            |
| F8    | Full-screen selection and copy  | Queued     | Mouse reporting's effect on terminal-native selection is acknowledged. Application-owned selection, copy semantics, and clipboard transport are not designed.                                                                                                                                                      | No application selection model or OSC 52 capability exists.                                                                                                                     | This compensates for a user-facing cost of targeted mouse capture and depends on focus, pointer, geometry, keyboard commands, and terminal capability reporting.                                            |

## Completion criteria by foundation

### F1 — Rendering-mode session contract

F1 is done when:

- the maintainer accepts the target mount type `mode: "inline" | "fullscreen"`, its omission/default behavior, and the current-vs-target update to the vouched rendering-mode record;
- the `fullscreen` and `alternateScreen` migration has an accepted compatibility window, warning behavior, and removal plan;
- application code can distinguish the finite session facts requested mode, effective mode, render host, interactivity, screen-reader path, dimensions, stable-origin availability, and hit-map availability without inspecting private state or `stdout.isTTY`;
- fallback or failure is explicit for live TTY, non-TTY, static render, deterministic testing, screen-reader mode, and unsupported stream combinations;
- inline live-region ownership says what remains addressable after `Static`, coordinated or direct external output, resize, suspension, and restoration; full-screen session behavior exposes the implemented fixed-surface, signal-restoration, and direct-write boundary without reopening #254;
- suspension and final-output semantics are explicit in both modes;
- `@vue-tui/testing` and `renderToString` expose only the mode controls and observations that are meaningful for their hosts;
- type, API, integration, lifecycle, and real-PTY tests prove the matrix without changing ordinary component behavior.

F1 does not design pointer events, focus delivery, or a component catalog. It supplies the facts those APIs will consume.

### F2 — Rendered-target lifetime

F2 is done when:

- one internal contract follows the current rendered ref through null, insertion, `v-if` removal, retargeting, component unmount, scope disposal, and HMR;
- registration cannot remain live after its rendered element disappears and cannot accidentally attach twice after retargeting;
- the contract works with Vue template refs and TSX refs without exposing `TuiNode` or another renderer-internal node as public authoring API;
- focused tests reproduce the lifetime class behind #250 and prove cleanup and retargeting;
- two internal registration adapters exercise the same seam without defining focus, geometry, caret, or pointer semantics; publication of a generic shared composable waits for evidence from more than one real behavior.

### F3 — Normalized input and routing

F3 is done when:

- stdin is parsed once into normalized key, text, paste, pointer, or explicitly uninterpreted input without discarding key identity, modifiers, press/repeat/release, or paste boundaries already known by the parser;
- framework-owned terminal protocol replies are removed before application delivery;
- application shortcuts, active regions, component handlers, and an optional external owner have an explicit priority and fallthrough route;
- handled, continue, component-default prevention, and PTY fallthrough are expressible without every component maintaining manual active booleans;
- current `useInput`, `usePaste`, and direct stdin access have an explicit compatibility or migration path;
- a global interrupt, local editor, paste, repeat/release keys, and unhandled-key PTY fallback pass semantic and real-PTY tests in both rendering modes.

F3 defines shared byte ownership and delivery semantics; it does not publish renderer-targeted pointer events. F6 owns that public contract.

### F4 — Logical focus and focus scopes

F4 is done when:

- one runtime owner maintains the effective logical focus target and restores or advances it predictably when targets become hidden, disabled, removed, or trapped inside a scope;
- focus registration follows F2's rendered lifetime and does not leave an active handler after `v-if` removal or retargeting;
- traversal order, disabled and hidden targets, nested scopes, modal traps, programmatic focus, and restoration after close or unmount are explicit;
- the focused owner receives F3's normalized key, text, and paste events without applications manually connecting `isFocused` to `useInput({ isActive })`;
- current `useFocus` and `useFocusManager` have an explicit compatibility or migration path;
- the coding-agent composer/approval flow, a finder, two independent regions, unmount restoration, and both rendering modes pass semantic and real-PTY tests.

### F5 — Semantic geometry and caret

F5 is done when:

- one semantic element reference can supply the parent-relative and screen-relative rectangles that supported consumers need without exposing `TuiNode`, Yoga, or paint-buffer internals;
- logical focus, collection active item, text insertion point, selection, terminal caret, and pointer target remain distinct states even when one component coordinates them;
- a focused editor can request a terminal caret relative to its rendered element in both modes without calculating physical cells itself;
- measurement and caret behavior is explicit when an element is clipped, hidden, removed, retargeted, or rendered under static, screen-reader, test, and non-interactive hosts;
- current `useCursor`, `useBoxMetrics`, and `measureElement` have an explicit compatibility or migration path;
- template/TSX types, resize, clipping, wide-glyph, ref-lifetime, both-mode, and real-PTY caret tests prove the contract.

### F6 — Full-screen targeted pointer

F6 is done when:

- the accepted entry point (current candidate: `@vue-tui/runtime/fullscreen`), hook name, signature, target-ref type, and supported event set are guarded as public API;
- common `Box`, `Text`, and `ScrollBox` types and runtime behavior reject targeted listener props, including Vue listener fallthrough and JavaScript/`any` cases;
- interactive inline use fails immediately and accurately, while non-TTY, static, screen-reader, test, HMR, and teardown behavior is specified and tested;
- target selection, propagation, `target`, `currentTarget`, coordinates, pointer capture, click synthesis, and default-handling semantics are explicit rather than inherited accidentally from shipped v1;
- live consumers acquire only button, drag, or future hover reporting actually required, downgrade when stronger consumers disappear, and disable all levels on every teardown path;
- shipped listener props and root `useDraggable` have an accepted migration; root `useMouseInput` remains the documented terminal-wide low-level stream;
- click-to-focus uses F4 instead of maintaining a second focus state;
- click, wheel, drag, nested targets, clipping, retargeting, removal, restoration, and selection-side-effect behavior pass type, integration, and real-PTY tests.

Bare hover does not block the first completion of F6 unless a representative journey proves it necessary; it remains an additive extension after the base event contract is stable.

### F7 — Scroll composition

F7 is done when real focus and pointer journeys decide whether each semantic `ScrollBox` operation must report movement, how nested owners continue or stop routing at their edges, and whether the same result is needed for keyboard and pointer input. Any return-type change needs type tests, nested scroll tests, and a compatibility decision; lack of evidence closes the proposal by keeping the current `void` API.

### F8 — Full-screen selection and copy

F8 is done when vue-tui has one application-owned selection model with explicit text/geometry ownership, keyboard and pointer extension rules, copy commands, clipboard capability and fallback behavior, screen-reader semantics, and restoration behavior. OSC 52 is a transport option, not the selection model itself. The contract must be validated through long transcript content and at least one non-coding-agent journey.

## Explicitly parked

- **Targeted pointer in inline mode:** fzf proves it is possible, but vue-tui has no reliable main-screen origin contract. Reopen only after F1 is done and a representative journey justifies origin discovery, invalidation, and terminal compatibility work.
- **Bare hover and all-motion reporting:** add after F6 only when a journey needs hover without a pressed button; do not enable terminal mode `1003` preemptively.
- **Renderer optimization and virtualization:** follow the measurement triggers in [performance.md](./performance.md), not this API roadmap.
- **Component catalog expansion:** component prototypes may validate foundations, but publication waits until the relevant foundation is Done and the inclusion bar in [components-design-principles.md](./components-design-principles.md) is met.

## Mapping from the current unresolved list

| Unresolved question                                                                | Tracked in                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `mode` migration from `fullscreen` / `alternateScreen`                             | F1                                                                   |
| Non-TTY, static-render, screen-reader, test-host, and unavailable behavior         | F1 for session facts; the owning later foundation for each operation |
| Target-ref type and rendered lifetime                                              | F2, then each owning public foundation                               |
| Normalized keyboard, text, paste, priority, and PTY fallthrough                    | F3                                                                   |
| Logical focus, focus scopes, traversal, traps, and restoration                     | F4                                                                   |
| Element-relative geometry, measurement, and terminal caret                         | F5                                                                   |
| Pointer hook name and signature; event target, propagation, coordinates, and hover | F6; hover may remain parked after base completion                    |
| Current `@click` listener props and `useDraggable` compatibility                   | F6                                                                   |
| `ScrollBox` movement-result return value                                           | F7                                                                   |
| Full-screen selection and copy                                                     | F8                                                                   |

When an item changes state, update this ledger, the corresponding canonical design record, and the [records map](./README.md) in the same change. Keep completed evidence here concise and move detailed behavior to its permanent record.
