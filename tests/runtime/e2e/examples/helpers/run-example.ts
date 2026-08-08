import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";
import stripAnsi from "strip-ansi";
import { startPtySession } from "../../harness/pty-session.ts";

const require = createRequire(import.meta.url);

// This file lives at tests/runtime/e2e/examples/helpers/ — five segments
// below the repo root. The examples live at <root>/examples/<name>.
const repoRoot = url.fileURLToPath(new URL("../../../../../", import.meta.url));
export const exampleDir = (name: string): string => path.join(repoRoot, "examples", name);

// Resolve the example's local Vite CLI instead of relying on a workspace-global executable.
export const viteBin = (cwd: string): string => {
  const pkgPath = require.resolve("vite/package.json", { paths: [cwd] });
  const pkg = require(pkgPath) as { bin?: string | Record<string, string> };
  const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.vite;
  if (!rel) throw new Error(`could not locate Vite's CLI bin from ${pkgPath}`);
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
  /**
   * Resolve once `matcher` accepts the raw PTY output. Use this for stable screen signals that are
   * not alphabetic render tokens (for example, a prompt made only of punctuation).
   */
  waitForOutputOrCrash: (
    matcher: RegExp | ((output: string) => boolean),
    description: string,
    timeoutMs?: number,
  ) => Promise<void>;
  dispose: () => Promise<void>;
}

export function launch(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Launched {
  const session = startPtySession({
    command: [cmd, ...args],
    cwd,
    // The child owns a real PTY. Model its terminal explicitly and let Runtime
    // exercise per-stream automatic detection instead of forcing Chalk globally.
    env,
    columns: 100,
    rows: 24,
  });

  const waitForOutputOrCrash = (
    matcher: RegExp | ((output: string) => boolean),
    description: string,
    timeoutMs = 20000,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const output = (): string => session.output;
      const cleanup = () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
      const fail = (msg: string, detail = output()) => {
        cleanup();
        reject(new Error(`${msg}\n--- output ---\n${detail}`));
      };
      const matches = () => {
        if (typeof matcher === "function") return matcher(output());
        matcher.lastIndex = 0;
        return matcher.test(output());
      };
      const check = () => {
        // Screen signal first: an app that paints and then exits should still pass. Then the
        // explicit failure modes — a module-system signature, or any exit before the frame appeared.
        if (matches()) {
          cleanup();
          resolve();
        } else if (CRASH_SIGNATURE.test(output())) {
          fail("example crashed before rendering.");
        } else if (session.exit !== undefined) {
          fail(`example exited (code ${session.exit.exitCode}) before painting ${description}.`);
        }
      };
      const interval = setInterval(check, 100);
      const timer = setTimeout(
        // JSON.stringify so a "rendered nothing" timeout shows the empty/whitespace output plainly.
        () =>
          fail(
            `timed out after ${timeoutMs}ms waiting for ${description}.`,
            JSON.stringify(output()),
          ),
        timeoutMs,
      );
      check();
    });

  return {
    output: () => session.output,
    dispose: () => session.dispose(),
    waitForOutputOrCrash,
    waitForRenderOrCrash: (token, timeoutMs = 20000) => {
      const want = lettersOnly(token);
      return waitForOutputOrCrash(
        (output) => lettersOnly(output).includes(want),
        `"${token}"`,
        timeoutMs,
      );
    },
  };
}
