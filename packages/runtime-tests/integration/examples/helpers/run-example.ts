import process from "node:process";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";
import stripAnsi from "strip-ansi";

// node-pty is a native addon shipped as CommonJS; load it through createRequire so this
// ESM helper can use it without a default-interop wrapper (same pattern as the other PTY helpers).
const require = createRequire(import.meta.url);
const { spawn } = require("node-pty") as typeof import("node-pty");

// This file lives at packages/runtime-tests/integration/examples/helpers/ — five segments below
// the repo root. The examples live at <root>/examples/<name>.
const repoRoot = url.fileURLToPath(new URL("../../../../../", import.meta.url));
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

// Resolve an example's local tsdown CLI the same way — production builds go through tsdown (a
// self-contained Node bundle), not `vite build`.
export const tsdownBin = (cwd: string): string => {
  const pkgPath = require.resolve("tsdown/package.json", { paths: [cwd] });
  const pkg = require(pkgPath) as { bin?: string | Record<string, string> };
  const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.tsdown;
  if (!rel) throw new Error(`could not locate tsdown's CLI bin from ${pkgPath}`);
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
const CRASH_SIGNATURE =
  /Calling `require`|doesn't expose the `require`|require is not defined|ERR_REQUIRE_ESM|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_|Cannot find (?:module|package)|\[vue-tui\] failed to launch/;

// Reduce a rendered frame to its letters so a wrap-robust token check survives the box border,
// padding, color escapes, and hard line-wraps the renderer inserts. basic-template pins its box to
// `width="20"`, so the title "vue-tui basic (template)" wraps mid-token in a real terminal; the
// characters are still emitted in order, so letters-only concatenation reconstructs the token
// regardless of where the wrap landed.
const lettersOnly = (s: string): string => stripAnsi(s).replace(/[^A-Za-z]/g, "");

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
  const ps = spawn(cmd, args, {
    name: "xterm-256color",
    cols: 100,
    rows: 24,
    cwd,
    // FORCE_COLOR so chalk emits ANSI in the non-TTY-parent test; CI:false so vue-tui's
    // default live updates stay on under the runner's CI=true (the PTY is a real TTY).
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
  // test. So an exit BEFORE the frame paints is always a failure (a Vue/yoga/plugin error that
  // exits, not just the module-system strings in CRASH_SIGNATURE); the poll below reports it with
  // the exit code instead of a misleading render timeout. After a successful match the poll is gone,
  // so the test's own kill() lands here harmlessly.
  ps.onExit(({ exitCode: code }) => {
    exitCode = code;
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
        const cleanup = () => {
          clearInterval(interval);
          clearTimeout(timer);
        };
        const fail = (msg: string, detail = buf) => {
          cleanup();
          reject(new Error(`${msg}\n--- output ---\n${detail}`));
        };
        const check = () => {
          // Token first: an app that paints and then exits should still pass. Then the explicit
          // failure modes — a module-system signature, or any exit before the frame appeared.
          if (lettersOnly(buf).includes(want)) {
            cleanup();
            resolve();
          } else if (CRASH_SIGNATURE.test(buf)) {
            fail("example crashed before rendering.");
          } else if (exitCode !== undefined) {
            fail(`example exited (code ${exitCode}) before painting "${token}".`);
          }
        };
        const interval = setInterval(check, 100);
        const timer = setTimeout(
          // JSON.stringify so a "rendered nothing" timeout shows the empty/whitespace output plainly.
          () => fail(`timed out after ${timeoutMs}ms waiting for "${token}".`, JSON.stringify(buf)),
          timeoutMs,
        );
        check();
      }),
  };
}
