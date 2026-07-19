import { test as it, describe, expect } from "vite-plus/test";
import term from "./helpers/term.ts";

// Ink parity G18: when the process receives SIGINT/SIGTERM/SIGHUP, signal-exit
// runs teardown() first — restoring the cursor and leaving the alternate
// screen — so the terminal is not left corrupted (cursor hidden / alt-screen
// active). Mirrors Ink's `signalExit(this.unmount, {alwaysLast:false})`.
const SHOW_CURSOR = "\x1b[?25h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";

// Robustness (Finding 2): the fixture has NO self-unmount path — `await
// app.waitUntilExit()` only resolves once teardown runs, and nothing in the
// fixture calls unmount()/exit(). So the ONLY way the restore bytes can appear
// is the signal driving the runtime's signal-exit teardown. That makes the
// restore-byte assertions below a genuine proof of the SIGNAL path, not a
// coincidental normal unmount emitting the same bytes: with the registration
// removed, the default signal action kills the child uncaught and NO restore
// bytes are emitted, so these assertions go red (verified RED on unfixed for
// all three signals + unthrottled output).
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
// under `vp run ready` every core is busy (lint/build/other pools), and a
// starved vitest worker may not process onData callbacks for seconds — the
// bytes are buffered in node-pty, not lost, so waiting for exit is reliable.
const restored = (output: string) =>
  output.includes(SHOW_CURSOR) && output.includes(EXIT_ALT_SCREEN);
const assertRestored = async (ps: ReturnType<typeof term>) => {
  await ps.waitForExitInfo();
  // Drain the final post-exit chunk if it hasn't arrived yet. If the signal-exit
  // registration is broken the child dies uncaught with NO restore bytes, so
  // this drain times out (red).
  await ps.waitForOutput(restored, 5000);
  expect(ps.output).toContain(SHOW_CURSOR);
  expect(ps.output).toContain(EXIT_ALT_SCREEN);
};

// Scoped retry (NOT config-wide): the runtime now flushes the restore escapes
// SYNCHRONOUSLY on the signal path (render.ts/kitty-keyboard.ts Finding A), so
// the child reliably emits show-cursor + leave-alt-screen before it dies
// (verified 40/40 standalone spawns, normal + unthrottled). The only residual
// flakiness is a PARENT-SIDE harness read-race: under `vp run ready` every core
// is saturated by lint/build/other test pools, and a starved vitest worker can
// fail to drain node-pty's buffered onData (the already-flushed restore bytes)
// within the 5s post-exit window. That is a test-harness artifact, not a runtime
// regression — a broken signal-exit registration emits NO restore bytes on EVERY
// attempt, so these still go RED if the fix is reverted. The retry is scoped to
// THIS suite only so it can never mask flakiness in the rest of the PTY suite.
describe("signal-teardown", { retry: 2 }, () => {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    it(`restores terminal on ${signal}`, async () => {
      const ps = term("signal-teardown");
      ps.kill(signal);
      // Teardown ran (only possible via the signal): cursor re-shown, alt-screen left.
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
