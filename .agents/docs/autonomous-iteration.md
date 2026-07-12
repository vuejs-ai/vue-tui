# Autonomous iteration

> **Status:** unstamped proposed operating contract and live plan. This file does not itself authorize a run, merge, release, or publication. Once a run begins, overwrite the live sections as truth changes; do not turn this into an append-only worklog.

## Objective

Autonomous work should advance the [product goal](./goal.md) through observable user behavior, not maximize commits or internal changes. The loop is successful when it exposes and closes a framework-owned gap in an [active application scenario](./product-scenarios.md#active-application-scenarios) while keeping the terminal, Vue contract, public API, records, and verification gates trustworthy.

Coding agent is the current pilot journey, not the definition of all future work. Inline and full-screen semantics are settled in the product goal, but their product hierarchy is not; an unattended run may collect comparative evidence and may not choose a primary or degraded mode.

## Current live objective

Advance F3, normalized input and routing, the sole [current checkpoint](./api-foundation-roadmap.md#current-checkpoint). F3.1 has one serialized structural ingress per physical stdin, F3.2 has one shared immutable semantic fact per structural event, and F3.3 has non-reusable app-route leases captured per framed fact with parser-distinct route selection independent of Node chunk grouping. The private F3.4 pure model makes the candidate route policy executable through coding-agent and workbench journeys. Inside each already-captured application snapshot, the current unit must add fact-start activation leases for its selected boundary, supplied focus path, delayed defaults and optional external owner, connect the private policy behind compatibility adapters, and prove actual route order, removal, replacement, re-entry, modal isolation and delayed Ctrl+C, Escape and Tab behavior without publishing a new event API.

Operational checkpoint: PR [#265](https://github.com/vuejs-ai/vue-tui/pull/265) is the single open foundation PR at `70784e2`, based directly on merged `main` `25df36d`. Its remote gate is green and its current three commits contain only the one-PR policy plus two test-race corrections; no F3 live-routing implementation has started on this branch yet. Reverify these facts before implementation rather than treating the hashes as permanent.

1. **Completed in the private model:** script a coding-agent composer/approval journey and a terminal-workbench journey that require global interrupt, local editing, paste boundaries, modal ownership, unhandled-key continuation, and external fallthrough without manual `isActive` booleans;
2. **Completed for the concrete questions:** compare pinned Ink and the recorded peers, then keep semantic action, semantic continuation, delayed-default permission, and external permission independent while requiring semantic completion for external fallthrough;
3. **Completed in the private model:** capture explicit application-global, selected active-boundary, supplied focus-path, delayed-default, and optional-external layers; prove modal isolation, FIFO re-entry snapshots, delayed defaults after semantic stop, and normalized text, control-key, paste and uninterpreted fallthrough under both mode labels;
4. extend F3.3 leases to boundary, focus, default, and external activation, then connect the private planner to the actual controller without letting registration time become priority or pulling F4 focus selection forward;
5. preserve exact post-protocol source spans or explicitly retain the narrower normalized UTF-8 external contract; prove direct stdin cannot duplicate routed delivery, protocol replies cannot escape, and key, text, paste and uninterpreted facts retain order in a real PTY;
6. give current `useInput`, `usePaste`, and direct stdin access an explicit retain, replace, or remove disposition only after live integration shows one coherent model; then cover template/TSX types, both modes, non-TTY and string hosts where callable, teardown, HMR, and real PTY input/fallthrough;
7. run focused gates, full `vp run ready`, fresh `CI=true vp run ci`, clean package consumers, and independent review; update the F3 contract, commit coherent review boundaries, and push them to the single active foundation PR without adding a VOUCHED stamp.

F1 and F2 are Done. The public readonly render session supplies truthful host facts, and the private rendered-target controller supplies one proven attachment lifetime without exposing renderer nodes. F3 may consume both but must not reopen the two screen models, treat the Inline default as product hierarchy, or publish focus, geometry, pointer, scroll-composition, or selection contracts early.

## Baseline for the current foundation

- PR [#264](https://github.com/vuejs-ai/vue-tui/pull/264) consolidated the former #255–#264 stack and merged as `25df36d`; normal visual full-screen, F1's public session facts, F2's [rendered-target lifetime](./rendered-target-lifetime.md), F3.1's serialized ingress, F3.2's semantic fact boundary, F3.3's route-lifetime control, and F3.4's private executable policy evidence are now established inputs on `main`.
- Reconcile records, README claims, package descriptions, and open trackers with the latest default branch before implementation; an agent cannot choose a sound target API from stale inputs.
- Keep later foundations free of new public APIs while F3 is active. A useful internal prototype may supply evidence, but it does not authorize publishing F4–F8 early or turning F2's private controller into a generic public target API.

## Pull-request policy

The remaining F3–F8 program uses one active PR rather than a stack. Each coherent unit remains a small Conventional Commit with its own focused evidence, but it is pushed to the same branch and PR. Do not create a new PR for a checkpoint, review batch, corrective follow-up, or public-API proposal while that PR remains active. The PR's current draft or ready-for-review state does not change the work-selection order; do not toggle that state unless the maintainer asks. After the maintainer merges or closes it, fetch the new `main` before creating the next single active PR.

## Where work comes from

For planned API work, the one **Active** item in [api-foundation-roadmap.md](./api-foundation-roadmap.md) is the only selectable foundation. The general evidence order below still governs bugs, external contributions, packaging failures, and work inside that active foundation; it does not promote a queued foundation merely because it looks smaller.

Choose one independently shippable unit, in this order:

1. a user-visible failure in a deterministic journey from an active product scenario;
2. a reproducible user bug or external contribution that affects framework correctness or an active scenario;
3. repeated difficult behavior in representative applications or real consumers that can become a generic framework capability;
4. a failure in a clean tarball consumer using published APIs and shipped documentation;
5. a regression in an existing objective gate;
6. a bounded comparison with prior art prompted by one of the failures above.

Searching for TODOs, mining another framework for differences, speculative performance work without a benchmark, and building a component only because another project has it are not work sources. The historical open-ended Ink parity sweep found many bugs and then reached diminishing returns; do not restart it.

When several units qualify, prefer the one with clearer user harm, stronger evidence, broader reuse across the active scenarios, and a smaller verifiable change. Coding-agent work has no automatic priority merely because it is the current pilot.

The foundation roadmap is the single ordered backlog for this program. This live plan names only its current Active item; GitHub issues and PRs remain the public tracker and should not be duplicated here.

## Operating loop

1. Fetch the latest remote default branch and create a clean task-specific worktree.
2. Read the records map, [goal.md](./goal.md), [product-scenarios.md](./product-scenarios.md), this live plan, and the exact records for the affected area.
3. Recheck open issues and PRs so the unit is not stale, already assigned, or overlapping an external contributor.
4. State the affected application scenario, the user-visible failure, and the objective before/after criterion: a failing test, type error, active-screen predicate, process result, or packaging failure.
5. For a bug, demonstrate the red state before implementing when practical. Use the strongest fitting layer: unit logic, component rendering, real PTY screen, or clean packaged consumer.
6. Implement the smallest coherent change. Update affected examples, public documentation, and unstamped records in the same change.
7. Run the focused test, then `vp run ready`. For changes sensitive to CI environment or task ordering, also run `CI=true vp run ci` from a fresh build.
8. Follow the shipped visual development guide for terminal-visible changes and use the repository controller for this repository. If both modes are affected, inspect both; if one mode is affected, inspect it plus a no-regression journey for the other when practical.
9. Commit one independently reviewable unit and push it to the program's single active PR under the run's granted authority; create that PR only when none exists, and never use another foundation branch as its base. Do not merge, release, publish packages, close external work, or send issue or PR comments without the applicable human gate.
10. Overwrite the live objective, candidates, evidence, and blockers. After at most three small units or one public-API proposal, stop and draft the distillation for the maintainer.

## Verification rules

- Behavior claims are demonstrated, not inferred from source.
- Public API additions, replacements, moves, and removals include the applicable SFC/template and TSX type checks, public-surface guards, user documentation, repository consumers, and a clean tarball consumer.
- Input, paste, focus, layout, paint, streaming, scroll, cursor, resize, external output, and teardown changes include real-PTY evidence. Raw output bytes alone are insufficient when the claim concerns what is visible on screen.
- The PTY path declares one terminal profile. Start with `xterm-256color`; do not generalize one Unicode-width, keyboard, or color result to every terminal.
- The visual loop feeds terminal query replies back to the PTY and exposes the active viewport, style runs, cursor, named key/text/resize actions, an explicit wait condition, raw transcript, and exit status.
- Silence is not a settled state. Success is an expected screen predicate, a process exit, or another explicit event before a deadline.
- Preserve durable evidence as tests, fixtures, commands, committed artifacts, stable URLs, or commit hashes. Do not cite a temporary screenshot or `/tmp` result as final evidence.
- A gate may be strengthened autonomously. Weakening or deleting a correctness, lifecycle, type-safety, or terminal-restoration check, or changing a test merely to accept new output, requires explicit review.

## Authority after this contract is approved

Autonomous work may:

- fix reproducible renderer, Vue-contract, and terminal-lifecycle bugs without changing intended public behavior;
- address input, paste, focus, streaming, scrolling, cursor, mouse, resize, error, and cleanup gaps exposed by an active scenario journey or real consumer;
- improve `@vue-tui/testing`, examples, starter material, and shipped documentation when the gap is objectively verifiable;
- implement a component or composable whose public shape is already accepted and whose need passes the vouched [inclusion bar](./components-design-principles.md#inclusion-bar--product-driven-and-evidence-backed);
- correct unstamped records and keep them current with the code;
- create local commits and update the single active PR for review.

## Stop and return to the maintainer

Stop before:

- deciding whether inline or full-screen is primary, or making a change that intentionally reduces one mode to a fallback;
- choosing a new public API when multiple honest shapes remain, including input ownership, focus routing, mode-capability APIs, or a generic styled-cell-grid view;
- moving a package boundary, changing the supported Node or terminal range, adding a native runtime requirement, or choosing release or version policy;
- conflicting with a vouched record;
- duplicating or superseding an active external contribution without coordination;
- weakening an objective gate or accepting a result that cannot be reproduced on the untouched base;
- making a broad visual-language decision that active-screen evidence cannot settle;
- continuing after the same underlying approach has failed three times;
- merging, releasing, publishing, or performing another irreversible external action not explicitly granted for the run.

Ordinary implementation choices inside an accepted API and objective do not require a stop. Choose the smallest reversible option, record durable rationale where it will matter again, and keep moving.

## Representative journey for later interaction foundations

When F3–F8 need an end-to-end interaction journey, use a scripted model adapter that emits deterministic events rather than calling a live provider. The reference journey should cover at least:

- entering and editing a prompt;
- bracketed paste or an explicit current limitation;
- token-by-token assistant output;
- a tool call that requires approval;
- an accepted tool result and a rejected tool request;
- long output that exercises native scrollback inline and a bounded viewport full-screen;
- resize from a small declared viewport to a larger one;
- Ctrl+C or normal exit with cursor, raw mode, mouse, and alternate-screen restoration;
- an error state visible to the user.

Run the same state machine with two view adapters:

- **Inline:** completed transcript through the current `Static` mechanism or its accepted replacement, current streaming output and composer in the managed region, native scrollback retained.
- **Full-screen:** persistent layout in the alternate screen, transcript through `ScrollBox` or its successor, explicit internal navigation, and restoration on exit.

The comparison should record where behavior can share one public abstraction and where the terminal model forces a mode-specific capability. It should not hide differences behind a lowest-common-denominator API or choose a product hierarchy.

## Work after the current foundation

The [API foundation roadmap](./api-foundation-roadmap.md#priority-order) is the only ordered continuation. When F3 satisfies its definition of done, mark it Done and F4 Active in the same change; do not copy the remaining queue into this file. Independent bugs and external contributions continue to use the evidence rules above without changing foundation order.

## Distillation returned after each run

Return a concise review that contains:

- the affected application scenario and user capability;
- the tests, screen predicates, package trial, or other durable evidence;
- what was attempted and discarded;
- any record or vouch whose scope may be affected;
- inline and full-screen findings without choosing the hierarchy;
- the remaining blocker, current foundation state, and next queued foundation;
- the exact commits and single active PR updated.

No amount of passing autonomous work vouches this plan, the product goal, or any new direction. The maintainer reviews the distillation, decides what to keep, and explicitly vouches only the direction that should continue to hold.
