# Ink Test Parity — Design Spec

## Goal

Supplement ~290 missing tests to reach parity with Ink v7.0.4's test suite. Only covers code already implemented in vue-tui. Excludes kitty keyboard protocol management, alternateScreen, synchronized output (BSU/ESU), and React concurrent mode (assigned to other agents or N/A).

## Approach

Expand existing test files in-place. No new test files unless a module has zero tests today. Follow existing test patterns: unit tests colocated with source (`packages/runtime/src/**/*.test.ts`), integration tests in `packages/runtime-tests/integration/**/*.test.tsx`.

All tests reference Ink's test suite at `/tmp/ink/test/` as the source of truth. Each test should be adapted to Vue's API (`defineComponent`, `h()`, `shallowRef`) and vue-tui's test helper (`render()` from `@vue-tui/testing`).

## Scope Exclusions

- **kittyKeyboard** (77 tests) — feature not implemented, separate agent
- **alternateScreen** (12 tests) — feature not implemented, separate agent
- **synchronized output** (5 tests) — feature not implemented
- **concurrent mode** (20 tests) — React-specific, N/A
- **build-output** (4 tests) — Ink build verification, not applicable
- **reconciler** (10 tests) — React reconciler internals, not applicable

---

## Part A: Unit Tests (~125 tests)

Pure function tests. No render helper needed. Colocated with source in `packages/runtime/src/`.

### A1: sanitize-ansi (+24 tests)

**File:** `packages/runtime/src/paint/sanitize-ansi.test.ts` (5 → 29)
**Ink ref:** `/tmp/ink/test/sanitize-ansi.ts`

Missing categories:

- C1 variant stripping (CSI, OSC with C1/ESC ST/BEL terminators)
- DCS passthrough stripping (tmux, incomplete, BEL in payload)
- SOS control strings (all terminator variants, escaped ESC in payload, SGR preserved around SOS)
- Private-parameter m-sequences
- ESC ST stripping, malformed ESC sequences, incomplete CSI
- Standalone ST bytes, standalone C1 controls

### A2: ansi-tokenizer (+19 tests)

**File:** `packages/runtime/src/paint/ansi-tokenizer.test.ts` (7 → 26)
**Ink ref:** `/tmp/ink/test/ansi-tokenizer.ts`

Missing categories:

- C1 CSI with intermediates, C1 SGR CSI, incomplete C1 CSI/OSC
- OSC with ST terminator (vs BEL)
- tmux DCS as single token, DCS with BEL in payload
- ESC/C1 SOS (ST, C1 ST, BEL-invalid, incomplete, escaped ESC)
- Incomplete CSI/ESC-intermediate marked as invalid
- Standalone C1 controls

### A3: input-parser (+32 tests)

**File:** `packages/runtime/src/io/input-parser.test.ts` (12 → 44)
**Ink ref:** `/tmp/ink/test/input-parser.ts`

Missing categories:

- Multi-key chunks, CSI parameters, SS3 sequences
- Meta+CSI/SS3 double escape, escaped printable/supplementary codepoints
- Legacy ESC[[ (mixed, across chunks, combined)
- Incomplete holding states (legacy, SS3, double-escape)
- Flush pending (escape, CSI, SS3, legacy), meta+SS3
- Empty chunk handling, text + incomplete escape
- 14 backspace/delete splitting cases
- 10 bracketed paste tests (event creation, split delivery, empty paste, chunk assembly, backspace in paste)

### A4: cursor-helpers (+7 tests)

**File:** `packages/runtime/src/io/cursor-helpers.test.ts` (10 → 17)
**Ink ref:** `/tmp/ink/test/cursor-helpers.tsx`

Missing:

- `buildCursorSuffix` (first line, single-line output)
- `buildReturnToBottom` (moves down, no cursorDown at bottom)
- `buildCursorOnlySequence` (full sequence with hide prefix, no hide when cursor not shown)
- `buildReturnToBottomPrefix` (undefined previousCursorPosition)

### A5: frame-writer / log-update (+34 tests)

**File:** `packages/runtime/src/io/frame-writer.test.ts` (1 → 35)
**Ink ref:** `/tmp/ink/test/log-update.tsx`

vue-tui's frame-writer wraps a self-built log-update. Tests should cover the frame-writer's public API (not log-update internals).

Missing categories:

- Standard rendering: render, update, skip identical output
- Incremental rendering: render, update, skip identical, surgical line updates, cursor rewind, clear extra lines, grow, single write call, shrinking output
- clear()/done() reset behavior, multiple clear(), sync()+update
- 14 cursor positioning tests (setCursorPosition, cursor suffix, return-to-bottom)
- 6 no-trailing-newline tests (fullscreen mode behavior)
- Render-to-empty edge case

### A6: text-width (+9 tests)

**File:** `packages/runtime/src/host/text-measure.test.ts` (4 → 13)
**Ink ref:** `/tmp/ink/test/text-width.tsx`

Missing:

- Wide chars in fixed-width Box, CJK fixed-width
- Mixed ASCII+wide char width
- ANSI styled text width
- Empty Text sibling
- Truncate CJK (3 variants + box-width)
- Overlay CJK 2nd/1st cell, CJK overlay on CJK
- Clipped empty write

---

## Part B: Component & Composable Tests (~114 tests)

Functional tests using `render()` from `@vue-tui/testing`. Located in `packages/runtime-tests/integration/`.

### B1: text component (+15 tests)

**File:** `packages/runtime-tests/integration/components/text.test.tsx` (31 → 46)
**Ink ref:** `/tmp/ink/test/text.tsx`

Missing: ANSI sanitization integration through `<Text>` — the text component should strip non-SGR ANSI sequences while preserving SGR styling and OSC hyperlinks. Ink has ~18 tests for this; ~15 are unique after deduplication.

Categories:

- Strip cursor movement/position/erase sequences
- Preserve SGR, OSC hyperlinks (BEL+ST), C1 OSC, SGR colon params
- Strip non-SGR CSI, C1 non-SGR CSI, ESC controls
- Strip tmux DCS (BEL+ST), C1 DCS, PM/APC, C1 PM/APC, ESC/C1 SOS
- Strip malformed SOS, preserve SGR around SOS
- Strip incomplete DCS/C1 DCS/OSC/C1 OSC/ESC, standalone ST/C1

### B2: use-animation (+36 tests)

**File:** `packages/runtime-tests/integration/composables/use-animation.test.tsx` (9 → 45)
**Ink ref:** `/tmp/ink/test/use-animation.tsx`

Missing categories:

- Shared timer: same/different intervals, cleanup/recreation, stays alive, inactive animations
- Timer leak prevention, frame catch-up
- isActive/interval reset behavior (frame, time, delta)
- Different interval rates
- Edge intervals: NaN, Infinity, -Infinity, oversized, zero, negative
- maxFps interaction (4 tests)
- Delta with throttled ticks
- Pausing stops ticks, interval change unsubscribes
- Wall clock protection, debug+non-interactive modes
- Newly mounted/activated don't inherit time
- Same-interval rerender stability
- time/delta progression
- reset() (function, stable ref, while paused)
- Unmount before first tick, resume cycles, isActive false from mount

### B3: use-box-metrics / measure (+19 tests)

**Files:**

- `packages/runtime-tests/integration/composables/use-box-metrics.test.tsx` (9 → ~24)
- `packages/runtime/src/host/text-measure.test.ts` (see A6)
  **Ink ref:** `/tmp/ink/test/use-box-metrics.tsx` + `measure-element.tsx` + `measure-text.tsx`

Missing useBoxMetrics (11):

- Resize updates, tracked ref on resize
- Sibling content changes (2 variants)
- Tracked ref attaches after initial render
- No extra re-renders, resize listener cleanup
- No crash after unmount+resize, zeros when ref unattached
- hasMeasured lifecycle (3), resets on unmount

Missing measure-element (4):

- After state update, multiple updates, useLayoutEffect, throttled

Missing measure-text (4, beyond A6):

- Cache behavior, multiline+wide chars

### B4: screen-reader (+11 tests)

**File:** `packages/runtime-tests/integration/accessibility/screen-reader.test.tsx` (14 → 25)
**Ink ref:** `/tmp/ink/test/screen-reader.tsx`

Missing:

- aria-label on Text/Box in screen-reader mode
- Omit ANSI styling
- Multiple Text components, nested Box+Text, null component
- aria-state variants (busy, disabled, expanded, multiline, multiselectable, readonly, required, selected)
- Multi-line text/nested row layout, roles on multi-line
- Listbox with multiselectable

### B5: render-to-string (+18 tests)

**File:** `packages/runtime-tests/integration/render-to-string.test.tsx` (14 → 32)
**Ink ref:** `/tmp/ink/test/render-to-string.tsx`

Missing:

- Text with variable, nested text, empty fragment
- Box padding, flex row/column, margin, gap
- Fixed width+height, Spacer, Newline, Border
- Colored/bold text, wrap/truncate
- Default/custom columns, Transform
- Static (3 variants)
- Effect behavior (3: initial before effects, useLayoutEffect, cleanup)
- Error handling (3: propagation, text-outside-Text, recovery)
- Independent calls, deeply nested tree

### B6: cursor composable (+7 tests)

**File:** `packages/runtime-tests/integration/composables/use-cursor.test.tsx` (5 → 12)
**Ink ref:** `/tmp/ink/test/cursor.tsx`

Missing:

- Cursor follows text input, space input cursor move
- Cursor cleared on unmount
- No screen scroll on subsequent renders
- useStdout/useStderr write with cursor
- Debug mode write interactions

### B7: components general (+8 tests)

**Files:** various in `packages/runtime-tests/integration/components/`
**Ink ref:** `/tmp/ink/test/components.tsx` (63 in-scope after exclusions)

vue-tui already covers most. Gap is ~8 tests:

- OSC hyperlink wrapping (6: BEL/ST wrap, non-hyperlink, hard-wrap BEL/ST single-word)
- Text with fragment
- Link ANSI escapes closed properly

---

## Part C: Layout Tests (+22 tests)

Small gaps across 9 existing layout test files. All use `render()` helper.

| File                          | Current | Target | Gap |
| ----------------------------- | ------- | ------ | --- |
| display.test.tsx              | 2       | 4      | +2  |
| gap.test.tsx                  | 3       | 6      | +3  |
| flex-direction.test.tsx       | 5       | 7      | +2  |
| flex-justify-content.test.tsx | 10      | 12     | +2  |
| margin.test.tsx               | 11      | 13     | +2  |
| padding.test.tsx              | 12      | 14     | +2  |
| width-height.test.tsx         | 18      | 22     | +4  |
| overflow.test.tsx             | 36      | 40     | +4  |
| position.test.tsx             | 11      | 12     | +1  |

---

## Part D: Render Lifecycle & Integration (+29 tests)

### D1: render lifecycle (+27 tests)

**Files:** `packages/runtime-tests/integration/lifecycle/*.test.tsx` + `pty/render.test.ts`
**Ink ref:** `/tmp/ink/test/render.tsx` (56 in-scope after exclusions)

Missing categories:

- Clear output behavior
- Console intercept
- Rerender on resize
- Throttle to maxFps
- onRender metrics
- No throttled render after unmount, unmount forces pending
- waitUntilExit timing
- waitUntilRenderFlush suite (6 tests)
- Issue-596 effect timing
- Exit value ordering (3 tests)
- Cross-realm Error (2 tests)
- Unmount with ended stdout (3 tests)
- Primary screen cleanup
- CI/non-TTY rendering (4 tests)
- Non-interactive mode suite

### D2: hooks misc (+2 tests)

**Files:** existing use-input / use-stdout tests
**Ink ref:** `/tmp/ink/test/hooks.tsx`

Missing:

- "ignore input if not active" (multiple hooks variant)
- useStdout PTY write variant

---

## Execution

4 Parts, executed sequentially via subagent-driven development. Each Part produces a branch → PR.

**Estimated effort:**

- Part A: ~125 tests, mostly mechanical (copy Ink test logic, adapt to vitest/vue-tui API)
- Part B: ~114 tests, moderate (need render helper, Vue component adaptation)
- Part C: ~22 tests, small (fill gaps in existing files)
- Part D: ~29 tests, moderate (lifecycle timing, some may need PTY)

**Total: ~290 tests across ~25 existing files.**
