# Ink Test Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~233 tests to reach parity with Ink v7.0.4's test suite for all already-implemented features.

**Architecture:** Expand existing test files in-place. Unit tests colocated with source (`packages/runtime/src/**/*.test.ts`), integration tests in `packages/runtime-tests/integration/**/*.test.tsx`. Each task migrates one module's missing tests from Ink (at `/tmp/ink/test/`) to vue-tui, adapting from React/AVA to Vue/vitest.

**Tech Stack:** vitest (via vite-plus/test), Vue 3 (defineComponent, h(), shallowRef), @vue-tui/testing render helper

---

## Common Adaptation Patterns

All tasks follow these rules when porting from Ink:

**Imports:**

```ts
// Ink (AVA)
import test from "ava";
import { renderToString } from "../src/index.js";
// vue-tui (vitest)
import { test, expect, describe } from "vite-plus/test";
import { sanitizeAnsi } from "./sanitize-ansi.ts";
```

**Assertions:**

```ts
// Ink: t.is(result, expected)
// vue-tui: expect(result).toBe(expected)
// Ink: t.deepEqual(a, b)
// vue-tui: expect(a).toEqual(b)
// Ink: t.true(x) / t.false(x)
// vue-tui: expect(x).toBe(true) / expect(x).toBe(false)
```

**Components (integration tests):**

```tsx
// Ink: const output = renderToString(<Text>hello</Text>);
// vue-tui:
const App = defineComponent(() => () => <Text>hello</Text>);
const { lastFrame } = await render(App);
expect(lastFrame()).toBe("hello");
```

**Loop-generated tests:** Use `test.each` or `for` loop with `test()` inside.

**Run commands:**

- Unit tests: `cd packages/runtime && vp test run -- src/path/to/file.test.ts`
- Integration tests: `cd packages/runtime-tests && vp test run -- integration/path/to/file.test.tsx`

**Commit convention:** `test: add <module> parity tests from Ink`

---

## Part A: Unit Tests (+125)

**Branch:** `test/ink-parity-unit`

### Task 1: sanitize-ansi (+24 tests)

**Files:**

- Modify: `packages/runtime/src/paint/sanitize-ansi.test.ts`
- Ink ref: `/tmp/ink/test/sanitize-ansi.ts`

- [ ] **Step 1: Read Ink's sanitize-ansi.ts and existing vue-tui test**

Read `/tmp/ink/test/sanitize-ansi.ts` (29 tests) and `packages/runtime/src/paint/sanitize-ansi.test.ts` (5 tests). Identify the 24 tests present in Ink but not in vue-tui.

- [ ] **Step 2: Add the 24 missing tests**

Append to the existing `describe("sanitize-ansi", ...)` block. Each Ink test like:

```ts
test("strips C1 CSI", (t) => {
  t.is(sanitizeAnsi("\x9b2Ahello"), "hello");
});
```

becomes:

```ts
test("strips C1 CSI", () => {
  expect(sanitizeAnsi("\x9b2Ahello")).toBe("hello");
});
```

Port all 24 missing tests following this pattern. Categories:

- C1 variant stripping (CSI, OSC with C1/ESC ST/BEL terminators)
- DCS passthrough stripping (tmux, incomplete, BEL in payload)
- SOS control strings (all terminator variants, escaped ESC, SGR preserved)
- Private-parameter m-sequences, ESC ST, malformed ESC, incomplete CSI
- Standalone ST bytes, standalone C1 controls

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime && vp test run -- src/paint/sanitize-ansi.test.ts`
Expected: 29 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/paint/sanitize-ansi.test.ts
git commit -m "test: add sanitize-ansi parity tests from Ink (+24)"
```

### Task 2: ansi-tokenizer (+19 tests)

**Files:**

- Modify: `packages/runtime/src/paint/ansi-tokenizer.test.ts`
- Ink ref: `/tmp/ink/test/ansi-tokenizer.ts`

- [ ] **Step 1: Read Ink's ansi-tokenizer.ts and existing test**

Read `/tmp/ink/test/ansi-tokenizer.ts` (26 tests) and `packages/runtime/src/paint/ansi-tokenizer.test.ts` (7 tests). Identify the 19 missing tests.

- [ ] **Step 2: Add the 19 missing tests**

Ink uses `tokenize()` which returns an array of token objects. vue-tui's `tokenizeAnsi()` may have a slightly different API — check the export in `packages/runtime/src/paint/ansi-tokenizer.ts` and adapt accordingly.

Categories: C1 CSI with intermediates, C1 SGR CSI, incomplete C1 CSI/OSC, OSC with ST terminator, tmux DCS as single token, DCS with BEL in payload, ESC/C1 SOS variants, incomplete CSI/ESC-intermediate as invalid, standalone C1 controls.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime && vp test run -- src/paint/ansi-tokenizer.test.ts`
Expected: 26 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/paint/ansi-tokenizer.test.ts
git commit -m "test: add ansi-tokenizer parity tests from Ink (+19)"
```

### Task 3: input-parser (+32 tests)

**Files:**

- Modify: `packages/runtime/src/io/input-parser.test.ts`
- Ink ref: `/tmp/ink/test/input-parser.ts`

- [ ] **Step 1: Read Ink's input-parser.ts and existing test**

Read `/tmp/ink/test/input-parser.ts` (44 tests, including 14 loop-generated from `deleteAndBackspaceCases`). Existing vue-tui file has 12 tests.

- [ ] **Step 2: Add the 32 missing tests**

Ink creates a parser with `createInputParser()` and calls `parser.push(chunk)`. vue-tui uses the same API. For the backspace/delete loop tests, use `test.each`:

```ts
const deleteAndBackspaceCases = [
  { title: "0x7F before text", chunks: ["\x7Fabc"], events: ["\x7F", "abc"] },
  // ... port all 14 cases from Ink
];

test.each(deleteAndBackspaceCases)("$title", ({ chunks, events }) => {
  const parser = createInputParser();
  const result = chunks.flatMap((c) => parser.push(c));
  expect(result).toEqual(events);
});
```

Categories: multi-key chunks, CSI parameters, SS3 sequences, meta+CSI/SS3 double escape, escaped printable/supplementary codepoints, legacy ESC[[, incomplete holding states, flush pending, empty chunk handling, 14 backspace/delete cases, 10 bracketed paste tests.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime && vp test run -- src/io/input-parser.test.ts`
Expected: 44 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/io/input-parser.test.ts
git commit -m "test: add input-parser parity tests from Ink (+32)"
```

### Task 4: cursor-helpers (+7 tests)

**Files:**

- Modify: `packages/runtime/src/io/cursor-helpers.test.ts`
- Ink ref: `/tmp/ink/test/cursor-helpers.tsx`

- [ ] **Step 1: Read Ink's cursor-helpers.tsx and existing test**

Read `/tmp/ink/test/cursor-helpers.tsx` (17 tests) and existing file (10 tests). Identify 7 missing.

- [ ] **Step 2: Add the 7 missing tests**

Ink tests `buildCursorSuffix`, `buildReturnToBottom`, `buildCursorOnlySequence`, `buildReturnToBottomPrefix`. Check vue-tui's exported function names in `packages/runtime/src/io/cursor-helpers.ts` and adapt.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime && vp test run -- src/io/cursor-helpers.test.ts`
Expected: 17 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/io/cursor-helpers.test.ts
git commit -m "test: add cursor-helpers parity tests from Ink (+7)"
```

### Task 5: frame-writer / log-update (+34 tests)

**Files:**

- Modify: `packages/runtime/src/io/frame-writer.test.ts`
- Ink ref: `/tmp/ink/test/log-update.tsx`

- [ ] **Step 1: Read Ink's log-update.tsx and existing test**

Read `/tmp/ink/test/log-update.tsx` (35 test declarations, 6 run in 2 rendering modes via `for` loop). Existing vue-tui file has 1 test.

**Critical:** Ink tests `logUpdate.create()` which returns a `render/clear/done` API. vue-tui's equivalent is `createFrameWriter()` which returns `write/clear/done/sync/setCursorPosition/willRender`. Map Ink's `render()` to vue-tui's `write()`. The stream setup pattern is:

```ts
const stream = new PassThrough() as unknown as NodeJS.WriteStream;
Object.assign(stream, { columns: 80, rows: 24, isTTY: true });
const writes: string[] = [];
stream.on("data", (chunk) => writes.push(chunk.toString()));

const writer = createFrameWriter(stream, { debug: false, incremental: false });
```

- [ ] **Step 2: Add the 34 missing tests**

For rendering mode variants (standard vs incremental), use `describe.each`:

```ts
const modes = [
  { name: "standard", incremental: false },
  { name: "incremental", incremental: true },
];

describe.each(modes)("$name mode", ({ incremental }) => {
  test("clear() returns cursor to bottom before erasing", () => {
    // ...
  });
});
```

Categories: standard render/update/skip-identical, incremental render/update/skip-identical/surgical/cursor-rewind/clear-extra/grow/shrink, clear()/done() reset, multiple clear(), sync()+update, 6 cursor positioning tests × 2 modes, 6 no-trailing-newline tests, render-to-empty.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime && vp test run -- src/io/frame-writer.test.ts`
Expected: 35 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/io/frame-writer.test.ts
git commit -m "test: add frame-writer parity tests from Ink log-update (+34)"
```

### Task 6: text-width (+9 tests)

**Files:**

- Modify: `packages/runtime/src/host/text-measure.test.ts`
- Ink ref: `/tmp/ink/test/text-width.tsx`

- [ ] **Step 1: Read Ink's text-width.tsx and existing test**

Read `/tmp/ink/test/text-width.tsx` (13 tests) and existing file (4 tests). Identify 9 missing.

**Note:** Ink's text-width tests render components with `renderToString` and check visual widths. vue-tui's `text-measure.test.ts` tests the `measureText` function directly. For tests that require rendering (e.g., "wide chars in fixed-width Box"), use `renderToString` from `@vue-tui/runtime` or the render helper.

- [ ] **Step 2: Add the 9 missing tests**

Categories: wide chars in fixed-width Box, CJK fixed-width, mixed ASCII+wide, ANSI styled width, empty Text sibling, truncate CJK (3 variants + box-width), overlay CJK 2nd/1st cell, CJK overlay on CJK, clipped empty write.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime && vp test run -- src/host/text-measure.test.ts`
Expected: 13 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/host/text-measure.test.ts
git commit -m "test: add text-width parity tests from Ink (+9)"
```

### Task 7: Part A verification + PR

- [ ] **Step 1: Run all unit tests**

```bash
cd packages/runtime && vp test run
```

Expected: all pass

- [ ] **Step 2: Run full test suite**

```bash
cd packages/runtime-tests && vp test run && pnpm pty-test
```

Expected: 482+ in-process + 82 PTY tests pass

- [ ] **Step 3: Create PR**

```bash
git push -u origin test/ink-parity-unit
gh pr create --title "test: add Ink unit test parity (+125)" --body "..."
```

---

## Part B: Component & Composable Tests (+100)

**Branch:** `test/ink-parity-components`

### Task 8: text component (+15 tests)

**Files:**

- Modify: `packages/runtime-tests/integration/components/text.test.tsx`
- Ink ref: `/tmp/ink/test/text.tsx`

- [ ] **Step 1: Read Ink's text.tsx and existing test**

Read `/tmp/ink/test/text.tsx` (54 raw, 46 after excluding 8 concurrent). Existing file has 31. Identify 15 missing — all are ANSI sanitization integration tests (Text strips non-SGR sequences).

- [ ] **Step 2: Add the 15 missing tests**

These test that `<Text>` content passes through `sanitizeAnsi`. Pattern:

```tsx
test("strips cursor movement in Text content", async () => {
  const App = defineComponent(() => () => <Text>{"\x1b[2Ahello"}</Text>);
  const { lastFrame } = await render(App);
  expect(lastFrame()).toBe("hello");
});
```

Categories: strip cursor movement/position/erase, preserve SGR/OSC hyperlinks/C1 OSC/SGR colon params, strip non-SGR CSI/C1 non-SGR/ESC controls, strip tmux DCS/C1 DCS/PM/APC/SOS, strip incomplete sequences/standalone ST/C1.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime-tests && vp test run -- integration/components/text.test.tsx`
Expected: 46 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime-tests/integration/components/text.test.tsx
git commit -m "test: add text ANSI sanitization parity tests from Ink (+15)"
```

### Task 9: use-animation (+34 tests)

**Files:**

- Modify: `packages/runtime-tests/integration/composables/use-animation.test.tsx`
- Ink ref: `/tmp/ink/test/use-animation.tsx`

- [ ] **Step 1: Read Ink's use-animation.tsx and existing test**

Read `/tmp/ink/test/use-animation.tsx` (45 raw, 43 after excluding 2 concurrent/Suspense). Existing file has 9. Identify 34 missing.

- [ ] **Step 2: Add the 34 missing tests**

Ink's animation uses `useAnimation()` returning `{frame, time, delta, reset, isActive}`. vue-tui's `useAnimation()` returns the same shape. Many tests use `vi.useFakeTimers()` — check if vue-tui's existing tests use fake timers and follow the same pattern.

Categories: shared timer (same/different intervals), timer leak prevention, frame catch-up, isActive/interval reset behavior, different interval rates, edge intervals (NaN/Infinity/-Infinity/oversized/zero/negative), maxFps interaction, delta with throttled ticks, pausing, interval change, wall clock protection, debug+non-interactive, newly mounted/activated, same-interval rerender stability, time/delta progression, reset(), unmount before first tick, resume cycles.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime-tests && vp test run -- integration/composables/use-animation.test.tsx`
Expected: 43 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime-tests/integration/composables/use-animation.test.tsx
git commit -m "test: add use-animation parity tests from Ink (+34)"
```

### Task 10: use-box-metrics / measure (+15 tests)

**Files:**

- Modify: `packages/runtime-tests/integration/composables/use-box-metrics.test.tsx`
- Ink ref: `/tmp/ink/test/use-box-metrics.tsx` + `measure-element.tsx` + `measure-text.tsx`

- [ ] **Step 1: Read Ink's test files and existing test**

Read all three Ink ref files (32 total). Existing vue-tui has 9 use-box-metrics tests. After A6 covers text-measure, ~15 remain.

- [ ] **Step 2: Add the 15 missing tests**

Ink's `useMeasureElement()` returns `{ref, ...metrics}`. vue-tui's `useBoxMetrics()` may have a different API — check `packages/runtime/src/composables/useBoxMetrics.ts` first.

Missing useBoxMetrics (11): resize updates, tracked ref on resize, sibling content changes, tracked ref attaches after initial render, no extra re-renders, resize listener cleanup, no crash after unmount+resize, zeros when ref unattached, hasMeasured lifecycle, resets on unmount.

Missing measure-element (4): after state update, multiple updates, useLayoutEffect equivalent, throttled.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime-tests && vp test run -- integration/composables/use-box-metrics.test.tsx`
Expected: ~24 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime-tests/integration/composables/use-box-metrics.test.tsx
git commit -m "test: add use-box-metrics/measure parity tests from Ink (+15)"
```

### Task 11: screen-reader (+11 tests)

**Files:**

- Modify: `packages/runtime-tests/integration/accessibility/screen-reader.test.tsx`
- Ink ref: `/tmp/ink/test/screen-reader.tsx`

- [ ] **Step 1: Read Ink's screen-reader.tsx and existing test**

Read `/tmp/ink/test/screen-reader.tsx` (25 tests). Existing file has 14. Identify 11 missing.

- [ ] **Step 2: Add the 11 missing tests**

Screen reader tests render components with the screen reader enabled and check text output. vue-tui may need the render helper with `isScreenReaderEnabled: true` option — check how existing tests set this up.

Missing: aria-label on Text/Box, omit ANSI styling, multiple Text components, nested Box+Text, null component, aria-state variants (busy, disabled, expanded, multiline, multiselectable, readonly, required, selected), multi-line text, roles on multi-line, listbox with multiselectable.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime-tests && vp test run -- integration/accessibility/screen-reader.test.tsx`
Expected: 25 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime-tests/integration/accessibility/screen-reader.test.tsx
git commit -m "test: add screen-reader parity tests from Ink (+11)"
```

### Task 12: render-to-string (+18 tests)

**Files:**

- Modify: `packages/runtime-tests/integration/render-to-string.test.tsx`
- Ink ref: `/tmp/ink/test/render-to-string.tsx`

- [ ] **Step 1: Read Ink's render-to-string.tsx and existing test**

Read `/tmp/ink/test/render-to-string.tsx` (32 tests). Existing file has 14. Identify 18 missing.

- [ ] **Step 2: Add the 18 missing tests**

Ink's `renderToString()` takes JSX and returns a string. vue-tui's `renderToString()` takes a component. Pattern:

```ts
// Ink: const output = renderToString(<Text>hello</Text>);
// vue-tui:
const App = defineComponent(() => () => <Text>hello</Text>);
const output = renderToString(App);
```

Missing: text with variable, nested text, empty fragment, box padding, flex row/column, margin, gap, fixed width+height, Spacer, Newline, Border, colored/bold text, wrap/truncate, default/custom columns, Transform, Static (3), effect behavior (3), error handling (3), independent calls, deeply nested tree.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime-tests && vp test run -- integration/render-to-string.test.tsx`
Expected: 32 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime-tests/integration/render-to-string.test.tsx
git commit -m "test: add render-to-string parity tests from Ink (+18)"
```

### Task 13: cursor composable (+7 tests)

**Files:**

- Modify: `packages/runtime-tests/integration/composables/use-cursor.test.tsx`
- Ink ref: `/tmp/ink/test/cursor.tsx`

- [ ] **Step 1: Read Ink's cursor.tsx and existing test**

Read `/tmp/ink/test/cursor.tsx` (13 raw, 12 after excluding 1 concurrent). Existing file has 5. Identify 7 missing.

- [ ] **Step 2: Add the 7 missing tests**

Ink's cursor tests use `useCursor()` and check stdout output for cursor positioning sequences. vue-tui's `useCursor()` should work similarly — check the composable API.

Missing: cursor follows text input, space input cursor move, cursor cleared on unmount, no screen scroll on subsequent renders, useStdout/useStderr write with cursor, debug mode write interactions.

- [ ] **Step 3: Run tests**

Run: `cd packages/runtime-tests && vp test run -- integration/composables/use-cursor.test.tsx`
Expected: 12 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime-tests/integration/composables/use-cursor.test.tsx
git commit -m "test: add cursor composable parity tests from Ink (+7)"
```

### Task 14: Part B verification + PR

- [ ] **Step 1: Run full test suite**

```bash
cd packages/runtime-tests && vp test run && pnpm pty-test
```

Expected: all pass (482+ in-process + 82 PTY)

- [ ] **Step 2: Create PR**

```bash
git push -u origin test/ink-parity-components
gh pr create --title "test: add Ink component/composable test parity (+100)" --body "..."
```

---

## Part D: Render Lifecycle (+8)

**Branch:** `test/ink-parity-lifecycle`

### Task 15: render lifecycle (+8 tests)

**Files:**

- Modify: `packages/runtime-tests/integration/lifecycle/on-render.test.tsx` and/or `lifecycle/exit.test.tsx`
- Ink ref: `/tmp/ink/test/render.tsx`

- [ ] **Step 1: Read Ink's render.tsx and existing lifecycle tests**

Read `/tmp/ink/test/render.tsx` (61 raw, ~56 in-scope). Read all files in `packages/runtime-tests/integration/lifecycle/` (33 total) + `pty/render.test.ts` (15). Identify ~8 missing scenarios.

- [ ] **Step 2: Add the 8 missing tests**

Distribute across appropriate existing lifecycle test files:

- `on-render.test.tsx`: onRender metrics callback variants
- `exit.test.tsx` or new: unmount forces pending throttled render, no throttled render after unmount, exit value ordering edge cases, unmount with ended stdout
- Possibly `scheduler-throttle.test.tsx`: throttle-related render tests
- CI/non-TTY rendering variants may go in PTY or lifecycle tests

- [ ] **Step 3: Run full suite**

```bash
cd packages/runtime-tests && vp test run && pnpm pty-test
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add packages/runtime-tests/integration/lifecycle/
git commit -m "test: add render lifecycle parity tests from Ink (+8)"
```

### Task 16: Part D verification + PR

- [ ] **Step 1: Run `vp run ready`**

```bash
vp run ready
```

Expected: lint, type-check, all tests pass

- [ ] **Step 2: Create PR**

```bash
git push -u origin test/ink-parity-lifecycle
gh pr create --title "test: add Ink render lifecycle test parity (+8)" --body "..."
```
