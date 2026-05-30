# Common Pitfalls & Best Practices

- AGENTS.md is the source of truth. CLAUDE.md is a symlink to it.
- Always use Vue's `shallowRef` over `ref` by default. Using `ref` requires a solid justification and a code comment explaining why deep reactivity is needed.
- Always use `defineComponent()` to define components. Never use bare `{ setup() {} }` objects — they lack component scope, so `inject`, `watch`, and `onScopeDispose` won't work correctly.
- Vue SFCs must use `<script setup>` unless there's an explicit reason not to.
- When code must deviate from normal/idiomatic style because the situation genuinely requires it (e.g. a control-character regex in a terminal parser, a deliberate string code-point spread, a lint rule suppressed for a justified reason), add a comment explaining _why_ it has to be written that way. Don't silence a linter or write surprising code without a note — the next reader should not have to guess whether it's intentional.
- Bug fixes must follow test-first: write a failing test that reproduces the bug, then fix the code and verify the test passes.
- Tests must simulate real user conditions. Non-TTY environments disable chalk colors — use `FORCE_COLOR` env var so ANSI output is always exercised. A bug invisible in tests but visible in a real terminal is a testing gap, not a minor issue. Each spawned subprocess is a fresh Node process with its own chalk, so PTY/child helpers must set `FORCE_COLOR` in the child env too, not just the vitest config.
- When debugging color/ANSI output in non-TTY environments (e.g. Claude Code shell), use `FORCE_COLOR=3` env var to force chalk to output ANSI codes.
- **Test files run in parallel (`fileParallelism: true`), but tests WITHIN a file run serially.** We deliberately do NOT set `sequence.concurrent`: many render tests assert timing-sensitive counts driven by the renderer's ~32ms commit throttle, and in-file concurrency starves them of wall-clock on a 4-core CI runner (it passes on higher-core dev machines — the classic local-vs-CI trap). PTY tests need `pool: "forks"` (node-pty requires `child_process.fork`, not worker threads).
- Tests that depend on **process-global state** — fake timers (`vi.useFakeTimers`, which mutates global `setTimeout`/`performance`) or assertions on shared globals (`process.listenerCount`, live yoga-node counts) — live in `*.sequential.test.*` files. Even file-level parallelism can perturb them, and grouping them by name documents the constraint. Add a header comment saying which global forces it.
- Tests must not implicitly depend on the host environment. The CI runner sets `CI=true`, which flips `interactive = !isInCi && isTTY` off (disabling the resize listener, cursor, ANSI erases) — so both vitest configs force `env: { CI: "false" }`, and PTY child helpers set `CI: "false"` per-spawn. If a test needs a specific CI/TTY/color behavior, inject it explicitly (mount option, child env) rather than relying on the ambient value. Reproduce CI locally with `CI=true vp run ci` on a fresh checkout (`rm -rf packages/*/dist`).
- After completing any task, run `vp run ready` (or `vpr ready`) to verify: lint, type-check, test all packages, and build.
- Never commit anything under `docs/`. That directory is for local working notes and specs — it must stay out of git.
- To read Ink's source (parity / divergence work), clone it once to a fixed local path and read from there — `git clone https://github.com/vadimdemedes/ink /tmp/ink` only when `/tmp/ink` is missing, otherwise reuse the existing clone (Ink isn't an npm dependency, so it's not in `node_modules`). Before trusting anything you read, check out and confirm the pinned baseline — `.agents/docs/ink-divergences.md` records the exact version/commit (currently v7.0.4); a claim read against the wrong Ink version is worse than none.

# Context Engineering

Long-lived design context lives in `.agents/docs/` (committed — distinct from the
uncommitted `docs/` working-notes folder). Convention, borrowed from rolldown:

- One concept per file; files cross-link with `[[other-doc]]`.
- If a design doc covers the area you're about to work in, **read it first**.
- If your change affects a design doc, **update it in the same change**. Docs that drift
  from reality are worse than no docs.
- Capture the _why_ — trade-offs considered, alternatives rejected, known pitfalls — not
  just what the code does.
- Be concise and direct: the essential what + why, led by the principle or intuition. Lose no
  information, but don't write essays or exhaustive mechanism dumps. When a behavior is the
  correct default (e.g. render = f(current props)), state the principle — don't dress it up as
  a framework limitation.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
