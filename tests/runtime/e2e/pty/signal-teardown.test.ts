import { test as it, describe, expect } from "vite-plus/test";
import term from "./helpers/term.ts";

// SIGINT/SIGTERM/SIGHUP must run Runtime teardown before process termination so
// the cursor and alternate-screen state are restored.
const SHOW_CURSOR = "\x1b[?25h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";

// The fixture settles only through signal-triggered Runtime teardown. It never
// calls unmount() or exit(), so the restore bytes prove the signal path.
//
// We deliberately do NOT assert on node-pty's reported exit signal: a signalled
// PTY death is reported nondeterministically (signal-exit sometimes intercepts
// for a graceful code-0 exit, sometimes re-raises so the child dies by the
// signal number — both AFTER teardown has restored the terminal). The restore
// bytes are the stable, meaningful invariant.
//
// We wait for the child to EXIT first, then for the restore bytes to drain:
// node-pty can fire the exit event a tick before delivering the final onData
// chunk (the teardown bytes), so we give a short post-exit drain window. We
// anchor on exit rather than racing a wall-clock on incremental output because
// under `vp run check` every core is busy (lint/build/other pools), and a
// starved vitest worker may not process onData callbacks for seconds — the
// bytes are buffered in node-pty, not lost, so waiting for exit is reliable.
const restored = (output: string) =>
  output.includes(SHOW_CURSOR) && output.includes(EXIT_ALT_SCREEN);
const assertRestored = async (ps: ReturnType<typeof term>) => {
  await ps.waitForExitInfo();
  // Drain the final post-exit chunk; absence of either restore sequence times out.
  await ps.waitForOutput(restored, 5000);
  expect(ps.output).toContain(SHOW_CURSOR);
  expect(ps.output).toContain(EXIT_ALT_SCREEN);
};

// Runtime flushes restore escapes synchronously, but a saturated parent worker
// may drain node-pty's buffered data after the five-second window. The retry is
// local to this suite, and every attempt requires both restore sequences.
describe("signal-teardown", { retry: 2 }, () => {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    it(`restores terminal on ${signal}`, async () => {
      const ps = term("signal-teardown");
      ps.kill(signal);
      await assertRestored(ps);
    });

    // An unthrottled full-screen app owns the same terminal modes and must
    // restore them on signals independently of commit scheduling.
    it(`restores terminal on ${signal} with unthrottled commits`, async () => {
      const ps = term("signal-teardown", ["--unthrottled"]);
      ps.kill(signal);
      await assertRestored(ps);
    });
  }
});
