# Ink-Parity Verification Loop

> Design spec + the reusable `/loop` prompt for continuously verifying that vue-tui
> stays aligned with Ink: audit → confirm gaps → test-first fix → codex review → PR →
> CI → auto-merge, repeating until a clean sweep finds nothing.
>
> Related: [[ink-parity]] (allowlist + pinned Ink version), [[parity-ledger]] (working gap ledger).

## Goal

Catch places where vue-tui has drifted from Ink's behavior — missing features, wrong
output, mishandled input/escape sequences, divergent lifecycle — without "fixing"
the differences that are **deliberate** design choices. Ship each confirmed gap as its
own reviewable PR and merge it autonomously once it is provably correct.

## Non-goals

- Chasing API-shape / naming / export-surface differences. Those are catalogued as
  intentional in `ink-parity.md` and skipped. (See the allowlist.)
- React-concurrent-mode features (Suspense/useTransition) — no Vue equivalent, N/A.
- Editing the `ink-parity.md` allowlist. The loop's **only** permitted write to that file
  is appending an item under "Candidate intentional divergences (needs human review)". It
  never edits existing allowlist entries and never promotes a candidate into the allowlist
  — a human does that.

## Context-engineering convention

This loop relies on two committed docs under `.agents/docs/` (the project's
context-engineering home, distinct from the uncommitted `docs/` working-notes folder).
Philosophy borrowed from rolldown: one concept per file, files cross-link, you read the
relevant doc before working in an area, and **you update the doc in the same change**
that affects it.

A short "Context Engineering" section in `AGENTS.md` documents this convention so the
rule is discoverable from the source of truth.

## Artifacts

### `.agents/docs/ink-parity.md` (committed) — pinned reference + allowlist

- **Target Ink**: version + git tag + pinned commit SHA the audit diffs against.
- **Intentional divergences** (the allowlist): each entry is `area — what Ink does —
what vue-tui does instead — why it's deliberate`. The audit drops any candidate gap
  that matches an entry here. Curated by a human; the loop only appends a
  "Candidate intentional divergences (needs human review)" section, never promotes
  entries itself.

Seed entries (from prior parity work, Ink v7.0.4):
`render() → createApp()` rename · exports `measureText`/`measureTextNatural` (Ink does
not) · `useExit()` instead of `useApp()` full AppContext · `AriaRole`/`AriaState` props ·
named type re-exports (BoxProps/TextProps/…) intentionally absent.

### `.agents/docs/parity-ledger.md` (committed) — the working ledger

Records audit sweeps and confirmed gaps so the loop survives restarts and never
re-does merged work.

```
## Sweep history
| sweep | Ink SHA | candidates → confirmed | status |
|-------|---------|------------------------|--------|

## Confirmed gaps
| id | area | summary | priority | status | branch | PR |
|----|------|---------|----------|--------|--------|----|
```

`status` ∈ `todo · in-progress · pr-open · merged · blocked`.

**Recording `merged` (a merged PR can't update itself).** A fix PR commits its own row as
`pr-open`. The flip to `merged` happens at the **next wake's reconciliation step**: any
`pr-open` row whose PR is now merged is set to `merged`, and that edit rides along in the
next fix PR (bundled at its top). The loop therefore trails reality by one PR; the
stop-condition's final reconciliation lands the last `merged` flip as its own tiny
`chore(parity): reconcile ledger` PR. This keeps every ledger write inside a reviewed PR.

## Phase A — Audit sweep

Runs only when there is no work in flight — i.e. the ledger has no `todo`,
`in-progress`, or `pr-open` rows (or on first run). A `blocked` row is **not** a reason to
audit: it pauses for the user (see stop condition).

1. **Pin & clone** Ink at the tag recorded in `ink-parity.md` → `/tmp/ink-<sha>` (a local
   throwaway clone, re-pulled each sweep — agents and codex read it from disk so no network
   is needed mid-review). Record the SHA in a new ledger sweep row.
2. **Fan-out diff (Workflow)** — parallel agents, one per Ink area, comparing real Ink
   source to vue-tui source: components (Box/Text/Static/Transform/Newline), hooks
   (input/focus/app/stdout/stderr), render lifecycle, `io/` escape sequences + writes,
   text wrapping, exit semantics. Each returns candidate differences with file refs.
3. **Allowlist filter** — drop every candidate matching `ink-parity.md`.
4. **Adversarial verify** — a second, independent agent tries to _refute_ each survivor:
   is it actually intentional? already covered by an existing test? not really present
   in Ink at this SHA? Default to "not a gap" when uncertain. Only survivors are
   confirmed.
5. **Rank & record** — write confirmed gaps to the ledger, priority-ordered
   (correctness/behavior bugs first, omissions second).

## Phase B — Fix loop (one cohesive gap per PR, priority order)

First, **reconcile**: for every `pr-open` row whose PR has merged, set its row to
`merged`; carry those edits into this iteration's PR (bundled at the top). Then take the
highest-priority `todo` gap:

1. Branch from `main` → `fix/parity-<slug>`; mark ledger row `in-progress` (working state).
2. **Test-first** — write a failing test reproducing the gap. Honor the project's test
   discipline: `FORCE_COLOR` for ANSI, `CI: "false"` injected, process-global tests in
   `*.sequential.test.*`. **Confirm the test fails for the right reason.**
3. **Fix** the code; confirm the test passes.
4. `vp run ready` (fmt → build → lint → type → test) must be fully green.
5. **Codex review** — run a codex review of the diff; address every finding.
6. Push; open PR (squash; co-author line included — this is the user's own repo). The PR's
   commits set this gap's ledger row to `pr-open` with branch + PR link (its flip to
   `merged` comes from the next wake's reconciliation above).
7. **Wait for CI** (dynamic wake on completion).
8. **Merge gate (hard)** — merge only when **both**:
   - CI is fully green, **and**
   - a codex pass reports **zero unaddressed findings**.
     Green CI alone is _not_ sufficient. If codex still has findings, address and re-push;
     do not merge.
9. On gate pass → **auto-merge** (squash). The row stays `pr-open` until reconciled next
   wake.
10. On CI red → systematic-debugging, push fix, re-wait. After **3** failed attempts on
    the same gap → mark `blocked` and **pause + ping the user**.

## Stop condition

Only consider stopping once **no `todo`, `in-progress`, or `pr-open` rows remain** (all
known work merged and reconciled). If any `blocked` row exists, do **not** declare
victory — pause and ping the user to resolve it. Otherwise land a final
`chore(parity): reconcile ledger` PR to flip the last `pr-open`→`merged`, then run **one
fresh audit sweep**. If that sweep yields zero new confirmed gaps, report
`parity verified against Ink <sha>, no actionable gaps` and end the loop. Otherwise
continue with the new gaps.

## Pacing & rails

- **Dynamic `/loop`** (self-paced): wake when CI / background work completes; set a long
  fallback wake (~1200s) so a hung CI never freezes the loop.
- Never touch allowlisted divergences. The loop's only permitted write to `ink-parity.md`
  is appending under "Candidate intentional divergences (needs human review)" — never edit
  or promote allowlist entries. Never commit anything under `docs/` (the `.agents/docs/`
  artifacts here are the committed exception).
- One gap per PR keeps every merge reviewable.
- Codex findings are a hard merge block (above).

## The reusable `/loop` prompt

Paste this whole block after `/loop` (no interval → self-paced):

```
Verify vue-tui's alignment with Ink and close real gaps, one PR at a time, until a clean sweep finds nothing.

State lives in two committed docs — read both before doing anything:
- .agents/docs/ink-parity.md  → target Ink version+SHA and the intentional-divergence ALLOWLIST. Your ONLY allowed write here is appending under "Candidate intentional divergences (needs human review)"; never edit or promote existing allowlist entries.
- .agents/docs/parity-ledger.md → sweep history + confirmed-gap table (id/area/summary/priority/status/branch/PR). status ∈ todo·in-progress·pr-open·merged·blocked.

Every wake, FIRST reconcile: for each `pr-open` row whose PR has merged, set it to `merged` (carry these edits into this iteration's PR, bundled at the top). Then do the next actionable thing:

A) If, after reconciliation, the ledger has no `todo`/`in-progress`/`pr-open` rows → run an AUDIT SWEEP (a `blocked` row is NOT a reason to audit — see STOP):
   1. Clone Ink at the pinned SHA from ink-parity.md into /tmp/ink-<sha> (local throwaway clone; agents read it from disk, no network needed mid-review). Add a sweep row to the ledger.
   2. Run a Workflow that fans out parallel agents to diff Ink source vs vue-tui source, one agent per area (components, hooks, render lifecycle, io/ escape sequences, text wrapping, exit semantics). Collect candidate differences with file refs.
   3. Drop every candidate that matches the ink-parity.md allowlist.
   4. Adversarially verify each survivor with a second agent that tries to REFUTE it (intentional? already tested? not actually in Ink at this SHA?). Default to "not a gap" when unsure.
   5. Write confirmed gaps to the ledger, priority-ordered (correctness/behavior first, omissions next).
   STOP only when no todo/in-progress/pr-open rows remain. If any `blocked` row exists, pause and ping me instead of declaring victory. Otherwise land a final `chore(parity): reconcile ledger` PR, then run one fresh sweep; if it finds zero new confirmed gaps → report "parity verified against Ink <sha>, no actionable gaps" and STOP the loop.

B) Otherwise take the highest-priority `todo` gap and ship it:
   1. Branch from main → fix/parity-<slug>; set ledger row in-progress (working state).
   2. TEST-FIRST: write a failing test reproducing the gap (FORCE_COLOR for ANSI, inject CI:"false", process-global tests in *.sequential.test.*). Confirm it fails for the right reason.
   3. Fix the code; confirm the test passes.
   4. Run `vp run ready` — fmt/build/lint/type/test must all be green.
   5. Run a codex review of the diff; address every finding.
   6. Push; open a squash PR (co-author line included). The PR's commits set this gap's row to pr-open with branch+PR link (its flip to `merged` comes from next wake's reconciliation).
   7. Wait for CI (schedule a dynamic wake on completion; long fallback ~1200s).
   8. HARD MERGE GATE — merge ONLY when CI is fully green AND a codex pass reports zero unaddressed findings. Green CI alone is not enough; if codex still has findings, fix, re-push, re-wait.
   9. On gate pass → squash-merge. Row stays pr-open until reconciled next wake.
   10. On CI red → debug systematically, push a fix, re-wait. After 3 failed attempts on the same gap, mark it `blocked` and STOP to ping me.

Rails: never touch allowlisted divergences; the only write to ink-parity.md is appending the candidate section; never commit under docs/; one gap per PR; update the ledger in the same PR as the change.
```
