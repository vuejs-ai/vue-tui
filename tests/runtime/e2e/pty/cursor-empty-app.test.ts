// Cursor hiding is output-driven: an empty initial frame writes no cursor escape,
// while the first non-empty frame hides it. Teardown may still restore visibility.
//
// These run under a real PTY whose TERM/COLORTERM advertise truecolor, so
// the genuine interactive log-update path is exercised, not the deterministic
// content-frame observer.
import { test as it, expect } from "vite-plus/test";
import { run } from "./helpers/run.ts";

const HIDE = "\x1b[?25l";
const NEL = "\x1bE";

it("interactive empty app (() => null) emits NO cursor-hide escape", async () => {
  const output = await run("cursor-empty-app");
  expect(output).toContain("exited");
  // Nothing rendered, so mount must not hide or advance the cursor.
  expect(output).not.toContain(HIDE);
  expect(output).not.toContain(NEL);
});

it("interactive non-empty app still hides the cursor on first render", async () => {
  const output = await run("cursor-nonempty-app");
  expect(output).toContain("exited");
  // The lazy hide (log-update render) covers the non-empty case.
  expect(output).toContain(HIDE);
});
