# Common Pitfalls & Best Practices

- AGENTS.md is the source of truth. CLAUDE.md is a symlink to it.
- Always use Vue's `shallowRef` over `ref` by default. Using `ref` requires a solid justification and a code comment explaining why deep reactivity is needed.
- Always use `defineComponent()` to define components. Never use bare `{ setup() {} }` objects — they lack component scope, so `inject`, `watch`, and `onScopeDispose` won't work correctly.
- Vue SFCs must use `<script setup>` unless there's an explicit reason not to.
- When code must deviate from normal/idiomatic style because the situation genuinely requires it (e.g. a control-character regex in a terminal parser, a deliberate string code-point spread, a lint rule suppressed for a justified reason), add a comment explaining _why_ it has to be written that way. Don't silence a linter or write surprising code without a note — the next reader should not have to guess whether it's intentional.
- Bug fixes must follow test-first: write a failing test that reproduces the bug, then fix the code and verify the test passes.
- Tests must simulate real user conditions. Non-TTY environments disable chalk colors — use `FORCE_COLOR` env var so ANSI output is always exercised. A bug invisible in tests but visible in a real terminal is a testing gap, not a minor issue.
- When debugging color/ANSI output in non-TTY environments (e.g. Claude Code shell), use `FORCE_COLOR=3` env var to force chalk to output ANSI codes.
- **Tests run concurrently by default** (`sequence.concurrent: true` in both the main `vite.config.ts` and `vitest.pty.config.ts`). Write each test self-contained — own subprocess/app, no shared mutable state. Never assert on wall-clock-dependent behavior (e.g. exact render/commit counts that rely on the renderer's ~32ms throttle): trigger the event so it renders synchronously and assert immediately after, or it flakes under CPU contention. `it.sequential` does NOT fix cross-fork CPU contention — fix the timing dependency instead.
- A few patterns are **incompatible with concurrent execution**. Handle by cause:
  - **Inline/file snapshots** (`toMatchInlineSnapshot`): the module-level `expect` loses snapshot test context under concurrency. _Fix in place_ — use the context-local `expect`: `test("name", async ({ expect }) => { expect(x).toMatchInlineSnapshot() })`. These stay concurrent.
  - **Process-global state** — fake timers (`vi.useFakeTimers`, which mutates global `setTimeout`/`performance`), or assertions on shared globals (e.g. `process.listenerCount`, live yoga-node counts). A concurrent sibling clobbers the shared state mid-test. _Not fixable_ in place — put these in a `*.sequential.test.*` file and mark them `it.sequential` / `describe.sequential`, with a header comment saying which global forces it.
- After completing any task, run `vp run ready` (or `vpr ready`) to verify: lint, type-check, test all packages, and build.
- Never commit anything under `docs/`. That directory is for local working notes and specs — it must stay out of git.

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
