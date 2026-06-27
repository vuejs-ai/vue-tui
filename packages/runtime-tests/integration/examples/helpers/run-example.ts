import process from "node:process";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";

// node-pty is a native addon shipped as CommonJS; load it through createRequire so this
// ESM helper can use it without a default-interop wrapper (same pattern as the other PTY helpers).
const require = createRequire(import.meta.url);
const { spawn } = require("node-pty") as typeof import("node-pty");

// This file lives at packages/runtime-tests/integration/examples/helpers/ — five segments below
// the repo root. The examples live at <root>/examples/<name>.
export const repoRoot = url.fileURLToPath(new URL("../../../../../", import.meta.url));
export const exampleDir = (name: string): string => path.join(repoRoot, "examples", name);

// Resolve an example's local Vite CLI entry so we launch the SAME vite the example would (its
// workspace-pinned version), not whatever is hoisted at the repo root. Vite's `exports` doesn't
// expose ./bin/vite.js, so resolve its package.json and read the `bin` field instead.
export const viteBin = (cwd: string): string => {
  const pkgPath = require.resolve("vite/package.json", { paths: [cwd] });
  const pkg = require(pkgPath) as { bin?: string | Record<string, string> };
  const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.vite;
  if (!rel) throw new Error(`could not locate vite's CLI bin from ${pkgPath}`);
  return path.join(path.dirname(pkgPath), rel);
};

// Launch-failure signatures, so a broken example fails fast with a useful message instead of
// burning the whole render timeout. Two families:
//   - module-system crashes (#212's `Calling \`require\` ... doesn't expose the \`require\``, plus the
//     adjacent ESM/CJS-interop and resolution failures) — these surface on both dev and build;
//   - `[vue-tui] failed to launch` — the dev plugin's own log when `runner.import(entry)` rejects.
//     The dev SERVER does NOT exit when the entry throws (it stays up and logs), so neither the
//     process-exit handler nor the module-system patterns would catch a generic entry crash on the
//     dev path; this string does.
export const CRASH_SIGNATURE =
  /Calling `require`|doesn't expose the `require`|require is not defined|ERR_REQUIRE_ESM|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_|Cannot find (?:module|package)|\[vue-tui\] failed to launch/;

// Reduce a rendered frame to its letters so a wrap-robust token check survives the box border,
// padding, color escapes, and hard line-wraps the renderer inserts. basic-template pins its box to
// `width="20"`, so the title "vue-tui basic (template)" wraps mid-token in a real terminal; the
// individual characters are still emitted in order, so letters-only concatenation reconstructs the
// token regardless of where the wrap landed.
//
// The `\x1b` (ESC, U+001B) prefix is mandatory: an escape sequence is ESC then the bytes. Without
// it we'd strip literal "[...]" from app text, and — worse — the final byte of an SGR/cursor escape
// ("m", "H", "J", "h", "A"…) is itself a letter that would survive lettersOnly() and break the
// contiguous token match. Every escape vue-tui emits here is a CSI sequence (ESC "[" … final),
// covering colors, cursor moves, erases, and the alt-screen / hide-cursor "?"-private forms.
// eslint-disable-next-line no-control-regex -- matching terminal escape sequences by design
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const lettersOnly = (s: string): string => s.replace(/[^A-Za-z]/g, "");

export interface Launched {
  output: () => string;
  /**
   * Resolve once the rendered frame contains `token` (compared letters-only, so terminal wrapping
   * does not hide it). Reject immediately if a module-system crash signature appears, or after
   * `timeoutMs` if neither happens.
   */
  waitForRenderOrCrash: (token: string, timeoutMs?: number) => Promise<void>;
  kill: () => void;
}

export function launch(cmd: string, args: string[], cwd: string): Launched {
  let buf = "";
  let exitCode: number | undefined;
  const onExitWaiters = new Set<() => void>();
  const ps = spawn(cmd, args, {
    name: "xterm-256color",
    cols: 100,
    rows: 24,
    cwd,
    // FORCE_COLOR so chalk emits ANSI in the non-TTY-parent test; CI:false so vue-tui's
    // `interactive = !isInCi && isTTY` stays on under the runner's CI=true (the PTY is a real TTY).
    env: {
      ...(process.env as Record<string, string>),
      CI: "false",
      FORCE_COLOR: "3",
      NODE_NO_WARNINGS: "1",
    },
  });
  ps.onData((d) => {
    buf += d;
  });
  // A successful launch (a dev server or the live app) never exits on its own — it's killed by the
  // test. So an exit BEFORE the frame paints is always a failure: a Vue/yoga/plugin error that
  // exits non-zero, not just the module-system strings in CRASH_SIGNATURE. Without this, every such
  // crash would silently burn the full render timeout and reject with a misleading "timed out"
  // message instead of the exit code + output. (After a successful match the waiter is gone, so the
  // test's own kill() lands here harmlessly.)
  ps.onExit(({ exitCode: code }) => {
    exitCode = code;
    for (const w of onExitWaiters) w();
  });

  return {
    output: () => buf,
    kill: () => {
      try {
        ps.kill();
      } catch {
        // already gone
      }
    },
    waitForRenderOrCrash: (token, timeoutMs = 20000) =>
      new Promise<void>((resolve, reject) => {
        const want = lettersOnly(token);
        const done = (fn: () => void) => {
          clearInterval(interval);
          clearTimeout(timer);
          onExitWaiters.delete(check);
          fn();
        };
        const check = () => {
          // Token first: an app that paints and then exits should still pass. Then the explicit
          // failure modes — a module-system signature, or any exit before the frame appeared.
          if (lettersOnly(stripAnsi(buf)).includes(want)) {
            done(resolve);
            return;
          }
          if (CRASH_SIGNATURE.test(buf)) {
            done(() =>
              reject(new Error(`example crashed before rendering.\n--- output ---\n${buf}`)),
            );
            return;
          }
          if (exitCode !== undefined) {
            done(() =>
              reject(
                new Error(
                  `example exited (code ${exitCode}) before painting "${token}".\n--- output ---\n${buf}`,
                ),
              ),
            );
          }
        };
        const interval = setInterval(check, 100);
        const timer = setTimeout(() => {
          done(() =>
            reject(
              new Error(
                `timed out after ${timeoutMs}ms waiting for "${token}".\n--- output ---\n${JSON.stringify(buf)}`,
              ),
            ),
          );
        }, timeoutMs);
        onExitWaiters.add(check);
        check();
      }),
  };
}

// The fingerprint #212 leaves in a built bundle: rolldown could not externalize a CJS `require`, so
// it emitted the runtime shim that throws on call. Asserting the bundle is free of this is a fast,
// deterministic #212 guard that needs no PTY and no API key — usable even for examples we can't run.
export const CJS_REQUIRE_SHIM = /doesn't expose the `require` function|Calling `require` for/;
