# TODOs — architecture

The work that moves `@vue-tui/runtime` from its current internal structure to the one in [Runtime architecture](./architecture.md). Each task states where the code stands today, the steps that get it there, what "done" means, how to check it, and what to watch for.

**This file deletes itself.** It exists only to hold the gap between the record and the code. When every task below has landed, delete this file and remove its route from [the records map](./README.md); nothing here needs to be preserved, because the architecture record already states the target and git keeps the history. Do not add ordinary follow-up work here — that belongs in [TODOs](./todos.md).

Tasks 8, 9 and 12 remain, and they are independent of one another.

## 8. Route mode bytes through the lease

**Today.** `TerminalBackend.acquire(mode)` returns a reference-counted lease and `release()` decrements it; neither issues bytes, and `isModeHeld` has no production caller. Each of the six modes still writes its own escape sequences at its own sites: the alternate screen and the cursor in `surface/fullscreen-surface.ts`, the cursor again in `surface/inline-surface.ts` and `surface/log-update.ts` without a lease, bracketed paste in `session/stdin-controller.ts`, the Kitty protocol in `terminal/kitty-keyboard.ts`, synchronized output in `session/session.ts`. The ledger also means different things per mode: the raw and bracketed-paste leases are kept across a suspension while the physical mode is restored, whereas the alternate-screen, cursor and Kitty leases are released on suspend. The architecture record's boundary "terminal modes are only operated through `terminal/`" and its Lease pattern describe the target, not this.

**Steps.**

1. Move each mode's enable and restore bytes into `acquire` and `release` on the node backend, keeping the ordering the sites enforce today: raw mode and the input protocols after the output surface is ready; the alternate screen left before raw mode is restored on teardown.
2. Sweep outstanding leases on teardown, suspension and runtime failure from one place, so "restored on a clean exit, not restored on suspension or a failure" cannot recur.
3. Delete the per-mode bookkeeping at the sites, and give Inline's cursor handling a lease like Fullscreen's.

**Done when.** `isModeHeld` decides a restore, each of the six modes has one write site, and it is inside `terminal/`.

**Verify.** `grep -rn '1049\|?25[lh]\|?2004\|>1u\|<u\|?2026' packages/runtime/src` lists nothing outside `terminal/`. The PTY suites under `tests/runtime/e2e/pty` and the lifecycle suites under `tests/runtime/integration/lifecycle` are the behavioural check; nothing about what reaches the screen changes.

**Watch for.** The mode writes carry output-transaction semantics — synchronous best-effort writes on the signal path, handoff callbacks on the coordinated path — that the lease has to keep; a lease that writes through the coordinator on the emergency path is the regression to avoid.

## 9. Fold suspend, resume and teardown control into the lifecycle

**Today.** `Session.lifecycle` is the union `"mounting" | "running" | "suspended" | "tearing-down" | "torn-down"`, and exit selection and settlement are unions of their own. Suspension still uses the persistent booleans `pendingMountSuspension`, `terminalResumeInProgress` and `terminalResumePainting`, while `TeardownControl` holds eight independent fields. The lifecycle union therefore rejects invalid top-level transitions but cannot reject invalid combinations inside suspension or teardown.

**Steps.**

1. Model pending mount suspension and the resume transaction as states carried by the lifecycle union.
2. Replace the teardown sub-flags with the combinations teardown can be in, and let the compiler reject the rest.

**Done when.** No boolean in `session/session.ts` expresses a fact the lifecycle union can carry.

**Verify.** The lifecycle suites under `tests/runtime/integration/lifecycle/`, the PTY suspension and signal suites, and the vite e2e suites that exercise HMR replacement and suspension.

**Watch for.** Some of these flags guard re-entrancy inside one transition rather than a state of their own; a flag that is set and cleared within one synchronous call stays a local, not a state.

## 12. One content parse per revision, with the runs on the node

**Today.** `layout/yoga.ts` keeps `textYogaMeasureStates`, a `WeakMap<TuiText, TextMeasureState>` whose entry is keyed by the node's `textRevision`, the available width, the width mode and `wrap`; its measure callback flattens the leaves through `sanitizeAnsiMultiline` and calls `measureTextNatural` and `wrapText`, which parse the content's ANSI themselves. `paint/paint.ts` keeps a second cache, `preparedTextPaintCache`, keyed by `textRevision`, the inherited background, `textAlign`, the wrap width and mode, and the wrapped-lines identity; it re-renders the node's inline styles into one string, which the per-root `OutputCaches` then parse back into cells. Each side parses the same content on its own.

**Steps.**

1. Put the runs on the node. `TuiText` already carries `textRevision` beside its props in `host/nodes.ts`, and `host/` imports nothing, so the runs are plain data with no engine handle.
2. Keep the parse in `text/`: `styledGraphemesFromAnsi` in `text/text-measure.ts` is where a content string becomes styled runs today.
3. Trigger it from `layout/`, not from `vue/`. The `vue/` row does not list `text/`, and `vue/node-ops.ts` only bumps `textRevision` or calls `layout/`'s `markTextDirty`, so the measure callback parses when the node's recorded revision differs and stores the runs.
4. Have paint read the node's runs together with `ComputedLayout`'s `text.wrapWidth` and `text.wrappedLines`, which it already receives, and delete `preparedTextPaintCache`.

**Done when.** One parse per content revision, and no cache in `paint/`.

**Verify.** `packages/runtime/tests/text/`, `packages/runtime/tests/layout/layout-transaction/single-pass-text-measurement.test.ts` and the `tests/runtime/integration/components/text/` suites; `benchmarks/runtime/renderer.bench.ts` is where the change's cost is measured.

**Watch for.** `textRevision` is not a content revision today: `vue/node-ops.ts` bumps it for every style prop on a Text host, including paint-only ones like `color`, so runs keyed on it alone would be reparsed on a colour change. The second cache is `OutputCaches` in `paint/paint.ts`, pinned by `packages/runtime/tests/paint/paint/output-cache.test.ts`; its width and slice helpers serve the clip path, which works on strings. `paint/paint.ts` also applies a Text node's own props by wrapping its composed content in SGR through `applyTextStyle`, so runs kept on the node have to be serialized back into that string unless the props' style moves onto the runs in the same change. And `text/text-measure.ts` slices and re-styles strings for that clip path (`sliceAnsiPreservingIntensity`, `safeSliceEnd`, `styleMeasuredTextLines`), so runs have to survive it or the clip moves onto runs; OSC 8 links and `extraSgr` must survive it too.
