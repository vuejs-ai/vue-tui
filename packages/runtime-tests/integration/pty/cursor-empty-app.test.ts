// Lazy cursor-hide parity (Ink v7.0.4). Ink hides the cursor LAZILY: log-update
// hides on the first render that actually writes (log-update.ts:55-59), and the
// onRender outer gate `output !== lastOutput || log.isCursorDirty()`
// (ink.tsx:1094) skips log-update entirely for an empty frame (both ""). So an
// interactive app whose root renders nothing emits ZERO cursor escapes; vue-tui
// must match. Non-empty + useCursor apps still hide on the first render (the
// lazy hide), so the cursor lifecycle is preserved.
//
// These run under a real PTY (run() spawns a TTY child with FORCE_COLOR=3 +
// CI=false) so the genuine interactive log-update path is exercised, not the
// debug helper.
import { test as it, expect } from "vite-plus/test";
import { run } from "./helpers/run.ts";

const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";

it("interactive empty app (() => null) emits NO cursor-hide escape", async () => {
  const output = await run("cursor-empty-app");
  expect(output).toContain("exited");
  // The bug: vue-tui eagerly hid the cursor at mount even though nothing
  // renders. Ink emits zero cursor escapes for an empty frame.
  expect(output).not.toContain(HIDE);
});

it("interactive non-empty app still hides the cursor on first render", async () => {
  const output = await run("cursor-nonempty-app");
  expect(output).toContain("exited");
  // The lazy hide (log-update render) covers the non-empty case.
  expect(output).toContain(HIDE);
});

it("useCursor app: last cursor visibility change is SHOW (cursor visible + positioned)", async () => {
  const output = await run("cursor-usecursor-app");
  expect(output).toContain("exited");
  // log-update hides-then-shows within one render; the SHOW must come last so
  // the cursor stays visible at the requested position.
  expect(output).toContain(SHOW);
  expect(output.lastIndexOf(SHOW)).toBeGreaterThan(output.lastIndexOf(HIDE));
  // cursorTo(x=2) -> "\x1b[3G": the cursor is placed at the useCursor position.
  expect(output).toContain("\x1b[3G");
});
