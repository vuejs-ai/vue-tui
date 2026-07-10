# Autonomous iteration

> **Status:** unstamped proposed operating contract and live plan. This file does not itself authorize a run, merge, release, or publication. Once a run begins, overwrite the live sections as truth changes; do not turn this into an append-only worklog.

## Objective

Autonomous work should advance the [product goal](./goal.md) through observable user behavior, not maximize commits or internal changes. The loop is successful when it exposes and closes a framework-owned gap in an [active application scenario](./product-scenarios.md#active-application-scenarios) while keeping the terminal, Vue contract, public API, records, and verification gates trustworthy.

Coding agent is the current pilot journey, not the definition of all future work. Inline and full-screen semantics are settled in the product goal, but their product hierarchy is not; an unattended run may collect comparative evidence and may not choose a primary or degraded mode.

## Current live objective

Complete one bounded coding-agent pilot using the repository's existing visual terminal feedback loop:

1. make the first-party coding-agent UI deterministic without a live model key;
2. drive the same input → streaming → approval → tool result → resize → exit journey in inline and full-screen modes;
3. observe and operate both through the repository-private real-PTY and emulated-active-screen controller;
4. prove that a fresh agent can discover a hidden interaction or layout defect from the visible screen, add a failing test, fix it, and pass the full repository gate without receiving the seed patch or location;
5. return a distillation of mode evidence, missing framework capabilities, discarded ideas, affected product scenarios, and the next three candidates.

The repository controller is development infrastructure. The public product currently ships the version-matched [visual development guide](../../packages/runtime/docs/visual-development-feedback-loops.md), not a promised controller API. A future public tool requires repeated consumer evidence and an independently reviewed API decision.

## Baseline before the pilot

- Reconcile records, README claims, package descriptions, and open trackers with the latest default branch; an agent cannot choose sound work from stale inputs.
- Draft PR [#252](https://github.com/vuejs-ai/vue-tui/pull/252) is closed. Its local `feat/internal-virtual-clock` branch and `vue-tui-virtual-clock` worktree still need cleanup before the pilot; no present product failure justifies reviving the virtual-clock project.
- Account for existing work before starting: [#249](https://github.com/vuejs-ai/vue-tui/issues/249) has external PR [#251](https://github.com/vuejs-ai/vue-tui/pull/251), Table issue [#224](https://github.com/vuejs-ai/vue-tui/issues/224) has draft PR [#244](https://github.com/vuejs-ai/vue-tui/pull/244), and older issues may be partly or wholly superseded by merged changes.
- Keep the pilot free of new public APIs unless the shape is already accepted in an issue or vouched record. A useful internal prototype may supply evidence for a later API decision.

## Where work comes from

Choose one independently shippable unit, in this order:

1. a user-visible failure in a deterministic journey from an active product scenario;
2. a reproducible user bug or external contribution that affects framework correctness or an active scenario;
3. repeated difficult behavior in representative applications or real consumers that can become a generic framework capability;
4. a failure in a clean tarball consumer using published APIs and shipped documentation;
5. a regression in an existing objective gate;
6. a bounded comparison with prior art prompted by one of the failures above.

Searching for TODOs, mining another framework for differences, speculative performance work without a benchmark, and building a component only because another project has it are not work sources. The historical open-ended Ink parity sweep found many bugs and then reached diminishing returns; do not restart it.

When several units qualify, prefer the one with clearer user harm, stronger evidence, broader reuse across the active scenarios, and a smaller verifiable change. Coding-agent work has no automatic priority merely because it is the current pilot.

The live record should contain at most three next candidates. GitHub issues and PRs remain the public tracker; do not duplicate their full backlog here.

## Operating loop

1. Fetch the latest remote default branch and create a clean task-specific worktree.
2. Read the records map, [goal.md](./goal.md), [product-scenarios.md](./product-scenarios.md), this live plan, and the exact records for the affected area.
3. Recheck open issues and PRs so the unit is not stale, already assigned, or overlapping an external contributor.
4. State the affected application scenario, the user-visible failure, and the objective before/after criterion: a failing test, type error, active-screen predicate, process result, or packaging failure.
5. For a bug, demonstrate the red state before implementing when practical. Use the strongest fitting layer: unit logic, component rendering, real PTY screen, or clean packaged consumer.
6. Implement the smallest coherent change. Update affected examples, public documentation, and unstamped records in the same change.
7. Run the focused test, then `vp run ready`. For changes sensitive to CI environment or task ordering, also run `CI=true vp run ci` from a fresh build.
8. Follow the shipped visual development guide for terminal-visible changes and use the repository controller for this repository. If both modes are affected, inspect both; if one mode is affected, inspect it plus a no-regression journey for the other when practical.
9. Commit one independently reviewable unit and publish it only as a draft PR under the run's granted authority. Do not merge, release, publish packages, close external work, or send issue or PR comments without the applicable human gate.
10. Overwrite the live objective, candidates, evidence, and blockers. After at most three small units or one public-API proposal, stop and draft the distillation for the maintainer.

## Verification rules

- Behavior claims are demonstrated, not inferred from source.
- Public API additions include SFC/template and TSX type checks, public-surface guards, user documentation, and a clean tarball consumer.
- Input, paste, focus, layout, paint, streaming, scroll, cursor, resize, external output, and teardown changes include real-PTY evidence. Raw output bytes alone are insufficient when the claim concerns what is visible on screen.
- The PTY path declares one terminal profile. Start with `xterm-256color`; do not generalize one Unicode-width, keyboard, or color result to every terminal.
- The visual loop feeds terminal query replies back to the PTY and exposes the active viewport, style runs, cursor, named key/text/resize actions, an explicit wait condition, raw transcript, and exit status.
- Silence is not a settled state. Success is an expected screen predicate, a process exit, or another explicit event before a deadline.
- Preserve durable evidence as tests, fixtures, commands, committed artifacts, stable URLs, or commit hashes. Do not cite a temporary screenshot or `/tmp` result as final evidence.
- A gate may be strengthened autonomously. Weakening or deleting a check, lowering a compatibility promise, or changing a test merely to accept new output requires explicit review.

## Authority after this contract is approved

Autonomous work may:

- fix reproducible renderer, Vue-contract, and terminal-lifecycle bugs without changing intended public behavior;
- address input, paste, focus, streaming, scrolling, cursor, mouse, resize, error, and cleanup gaps exposed by an active scenario journey or real consumer;
- improve `@vue-tui/testing`, examples, starter material, and shipped documentation when the gap is objectively verifiable;
- implement a component or composable whose public shape is already accepted and whose need passes the vouched [inclusion bar](./components-design-principles.md#inclusion-bar--product-driven-and-evidence-backed);
- correct unstamped records and keep them current with the code;
- create local commits and draft PRs for review.

## Stop and return to the maintainer

Stop before:

- deciding whether inline or full-screen is primary, or making a change that intentionally reduces one mode to a fallback;
- choosing a new public API when multiple honest shapes remain, including input ownership, focus routing, mode-capability APIs, or a generic styled-cell-grid view;
- making a breaking change, moving a package boundary, changing the supported Node or terminal range, adding a native runtime requirement, or choosing release or version policy;
- conflicting with a vouched record;
- duplicating or superseding an active external contribution without coordination;
- weakening an objective gate or accepting a result that cannot be reproduced on the untouched base;
- making a broad visual-language decision that active-screen evidence cannot settle;
- continuing after the same underlying approach has failed three times;
- merging, releasing, publishing, or performing another irreversible external action not explicitly granted for the run.

Ordinary implementation choices inside an accepted API and objective do not require a stop. Choose the smallest reversible option, record durable rationale where it will matter again, and keep moving.

## Pilot implementation shape

Use a scripted model adapter that emits deterministic events rather than calling a live provider. The reference journey should cover at least:

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

- **Inline:** completed transcript through `Static`, current streaming output and composer in the managed region, native scrollback retained.
- **Full-screen:** persistent layout in the alternate screen, transcript through `ScrollBox` or its successor, explicit internal navigation, and restoration on exit.

The comparison should record where behavior can share one public abstraction and where the terminal model forces a mode-specific capability. It should not hide differences behind a lowest-common-denominator API or choose a product hierarchy.

## Candidates after the pilot

These are evidence-backed candidates, not an authorized backlog:

1. Fix [`v-show` #246](https://github.com/vuejs-ai/vue-tui/issues/246). The failure is a reproducible Vue-contract gap. Stop if the minimal bridge would imply general DOM-style support or alter the public host shape.
2. Test tarballs of `runtime`, `testing`, and `components` in a clean consumer using only the shipped visual guide and a controller supplied by the project or evaluation environment. Record which missing capabilities belong in documentation, repository tooling, or a later public API proposal; do not publish the repository controller by convenience.
3. Produce an input-editor, input-ownership, and focus-routing API proposal from the hand-written coding-agent code, [`useInput` ownership #250](https://github.com/vuejs-ai/vue-tui/issues/250), and finder or workflow consumers. Do not publish the component or semantics until the maintainer reviews the competing shapes.

Review [Table PR #244](https://github.com/vuejs-ai/vue-tui/pull/244) and [color reset PR #251](https://github.com/vuejs-ai/vue-tui/pull/251) against the general inclusion and correctness bars. Neither an external contribution nor the coding-agent pilot replaces evidence-based product prioritization.

## Distillation returned after each run

Return a concise review that contains:

- the affected application scenario and user capability;
- the tests, screen predicates, package trial, or other durable evidence;
- what was attempted and discarded;
- any record or vouch whose scope may be affected;
- inline and full-screen findings without choosing the hierarchy;
- the remaining blocker or next three candidates;
- the exact commits and draft PRs produced.

No amount of passing autonomous work vouches this plan, the product goal, or any new direction. The maintainer reviews the distillation, decides what to keep, and explicitly vouches only the direction that should continue to hold.
