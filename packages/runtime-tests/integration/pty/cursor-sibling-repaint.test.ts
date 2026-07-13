// Persistent cursor re-assertion across an UNRELATED repaint (real-TTY PTY).
//
// The caret-restore bytes only reach a live TTY (frame-writer's `log` is null in
// content-frame tests), so this divergence is invisible to byte-exact non-TTY tests
// — per CLAUDE.md that is a testing gap, not a non-issue, hence a PTY repro.
//
// Storyboard (sibling topology): an input requests an element-local caret after
// typing "hi" (x = 2 + 2 = 4); paint maps the editor to surface row 1. A spinner whose state lives in a sibling
// component then repaints WITHOUT any further keystroke. The input child's own
// deps did not change, so the old value/reference gate dropped the caret and it
// zombied to the bottom-left corner. The fix re-emits the last-declared caret at
// the END of every commit, so the spinner-only frame must still end with the
// caret-restore suffix at the declared column.
//
// ansiEscapes.cursorTo(x) === `\x1b[${x + 1}G`. With x = 4 and a two-line frame
// (visibleLineCount 2, y 1 -> moveUp 1) the restore suffix is:
//   `\x1b[1A` (up 1) + `\x1b[5G` (to col 4) + `\x1b[?25h` (show).
import { test as it, expect } from "vite-plus/test";
import term from "./helpers/term.ts";

const SHOW = "\x1b[?25h";
// The full caret-restore suffix the spinner-only frame must end with.
const CARET_RESTORE = "\x1b[1A\x1b[5G\x1b[?25h";
// Synchronized-update end — the byte that closes each interactive frame.
const ESU = "\x1b[?2026l";

it("a spinner-only repaint (sibling topology) re-asserts the declared caret, not the corner", async () => {
  const ps = term("cursor-sibling-repaint");
  ps.write("hi");
  // Wait for the spinner-only repaint frame (spin index 1 -> "/ working") to
  // commit; the fixture fires it ~400ms after mount with no further keystroke.
  await ps.waitForOutput((o) => o.includes("/ working"));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");

  // Isolate the spinner-tick frame: from the "/ working" content up to its
  // synchronized-update end. That frame must END with the caret-restore suffix,
  // i.e. the caret is put back at the declared column, not left at the corner.
  const tickStart = ps.output.indexOf("/ working");
  expect(tickStart).toBeGreaterThan(-1);
  const tickEnd = ps.output.indexOf(ESU, tickStart);
  expect(tickEnd).toBeGreaterThan(-1);
  const tickFrame = ps.output.slice(tickStart, tickEnd);

  // The spinner-only frame ends with the caret-restore suffix (up, to col, show).
  expect(tickFrame.endsWith(CARET_RESTORE)).toBe(true);
  // And the last visibility change in that frame is a SHOW (caret visible).
  expect(tickFrame).toContain(SHOW);
});
