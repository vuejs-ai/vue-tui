// Lazy cursor-hide parity (Ink v7.0.4). Ink hides the cursor LAZILY: log-update
// hides on the first render that actually writes (log-update.ts:55-59), and the
// onRender outer gate `output !== lastOutput || log.isCursorDirty()`
// (ink.tsx:1094) skips log-update entirely for an empty frame (both ""). So an
// interactive app whose root renders nothing emits no cursor escape on its
// initial commit; vue-tui must match. Teardown may still restore cursor
// visibility.
//
// These run under a real PTY (run() spawns a TTY child with FORCE_COLOR=3 +
// CI=false) so the genuine interactive log-update path is exercised, not the
// deterministic content-frame observer.
import { test as it, expect } from "vite-plus/test";
import { run } from "./helpers/run.ts";

const HIDE = "\x1b[?25l";
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
