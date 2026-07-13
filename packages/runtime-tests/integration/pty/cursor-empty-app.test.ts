// Lazy cursor-hide parity (Ink v7.0.4). Ink hides the cursor LAZILY: log-update
// hides on the first render that actually writes (log-update.ts:55-59), and the
// onRender outer gate `output !== lastOutput || log.isCursorDirty()`
// (ink.tsx:1094) skips log-update entirely for an empty frame (both ""). So an
// interactive app whose root renders nothing emits no cursor escape on its
// initial commit; vue-tui must match. Teardown may still restore cursor
// visibility. A non-empty app with a focused semantic caret hides on the first
// render and restores the terminal cursor at the selected cell.
//
// These run under a real PTY (run() spawns a TTY child with FORCE_COLOR=3 +
// CI=false) so the genuine interactive log-update path is exercised, not the
// deterministic content-frame observer.
import { test as it, expect } from "vite-plus/test";
import { run } from "./helpers/run.ts";

const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";
const NEL = "\x1bE";

it("interactive empty app (() => null) emits NO cursor-hide escape", async () => {
  const output = await run("cursor-empty-app");
  expect(output).toContain("exited");
  // The bug: vue-tui eagerly hid the cursor at mount even though nothing
  // renders. Ink emits no hide escape for an empty initial frame.
  expect(output).not.toContain(HIDE);
  expect(output).not.toContain(NEL);
});

it("interactive non-empty app still hides the cursor on first render", async () => {
  const output = await run("cursor-nonempty-app");
  expect(output).toContain("exited");
  // The lazy hide (log-update render) covers the non-empty case.
  expect(output).toContain(HIDE);
});

it("focused caret app: last cursor visibility change is SHOW at its rendered cell", async () => {
  const output = await run("caret-active-app");
  expect(output).toContain("exited");
  // log-update hides-then-shows within one render; the SHOW must come last so
  // the cursor stays visible at the requested position.
  expect(output).toContain(SHOW);
  expect(output.lastIndexOf(SHOW)).toBeGreaterThan(output.lastIndexOf(HIDE));
  // cursorTo(x=2) -> "\x1b[3G": the physical cursor is placed at the caret.
  expect(output).toContain("\x1b[3G");
});
