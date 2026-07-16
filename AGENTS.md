# Common Pitfalls & Best Practices

- AGENTS.md is the source of truth. CLAUDE.md is a symlink to it.
- Always use Vue's `shallowRef` over `ref` by default. Using `ref` requires a solid justification and a code comment explaining why deep reactivity is needed.
- Always use `defineComponent()` to define components. Never use bare `{ setup() {} }` objects — they lack component scope, so `inject`, `watch`, and `onScopeDispose` won't work correctly.
- Vue SFCs must use `<script setup>` unless there's an explicit reason not to.
- When passing function-valued props into composables, do not pass a one-time prop value
  like `useInput(props.onInput)`. Pass a live source with `toRef(props, "onInput")`, or
  pass a wrapper closure that reads `props.onInput(...)` at event time. For composable
  APIs that accept function handlers, prefer `MaybeRef<Handler>` + `unref()` over
  `MaybeRefOrGetter<Handler>`: handler functions and getter functions are ambiguous.
- For ordinary Vue UI, start with template syntax. Use JSX/TSX when it makes test fixtures or highly dynamic structures clearer, and reserve `h()` for renderer internals or genuinely programmatic vnode construction where template/JSX would be the wrong tool.
- Prefer kebab-case for new file names, including Vue SFCs and JSX/TSX files. Keep local consistency when touching existing areas, and do not rename existing files only for casing unless the task is explicitly about naming.
- When code must deviate from normal/idiomatic style because the situation genuinely requires it (e.g. a control-character regex in a terminal parser, a deliberate string code-point spread, a lint rule suppressed for a justified reason), add a comment explaining _why_ it has to be written that way. Don't silence a linter or write surprising code without a note — the next reader should not have to guess whether it's intentional.
- Bug fixes must follow test-first: write a failing test that reproduces the bug, then fix the code and verify the test passes.
- Tests must simulate real user conditions. Non-TTY environments disable chalk colors — use `FORCE_COLOR` env var so ANSI output is always exercised. A bug invisible in tests but visible in a real terminal is a testing gap, not a minor issue. Each spawned subprocess is a fresh Node process with its own chalk, so PTY/child helpers must set `FORCE_COLOR` in the child env too, not just the vitest config.
- When debugging color/ANSI output in non-TTY environments (e.g. Claude Code shell), use `FORCE_COLOR=3` env var to force chalk to output ANSI codes.
- **Test files run in parallel (`fileParallelism: true`), but tests WITHIN a file run serially.** We deliberately do NOT set `sequence.concurrent`: many render tests assert timing-sensitive counts driven by the renderer's ~32ms commit throttle, and in-file concurrency starves them of wall-clock on a 4-core CI runner (it passes on higher-core dev machines — the classic local-vs-CI trap). PTY tests need `pool: "forks"` (node-pty requires `child_process.fork`, not worker threads).
- Tests that depend on **process-global state** — fake timers (`vi.useFakeTimers`, which mutates global `setTimeout`/`performance`) or assertions on shared globals (`process.listenerCount`, live yoga-node counts) — live in `*.sequential.test.*` files. Even file-level parallelism can perturb them, and grouping them by name documents the constraint. Add a header comment saying which global forces it.
- Tests must not implicitly depend on the host environment. The CI runner sets `CI=true`, which flips `interactive = !isInCi && isTTY` off (disabling the resize listener, cursor, ANSI erases) — so both vitest configs force `env: { CI: "false" }`, and PTY child helpers set `CI: "false"` per-spawn. If a test needs a specific CI/TTY/color behavior, inject it explicitly (mount option, child env) rather than relying on the ambient value. Reproduce CI locally with `CI=true vp run ci` on a fresh checkout (`rm -rf packages/*/dist`).
- After completing any task, run `vp run ready` (or `vpr ready`) to verify: lint, type-check, test all packages, and build.
- For every terminal-visible change, use the repository's TUI visual review tool as the default implementation and non-deterministic acceptance loop. Start `vp run visual:basic-template` in a persistent execution session that keeps stdin open, wait for an explicit screen state, call `observe`, load the returned PNG into visual input, and choose one action from that observation. After the action, wait for an explicit result or at least a visible revision advance before observing again; do not mistake a capture from before the next render for the action's result. The agent must use what it sees to decide whether another code pass is needed; do not replace this with a prewritten UI journey or image snapshot. If basic-template does not exercise the affected behavior, extend the tool or add the appropriate fixture instead of treating an unrelated observation as acceptance. Read [`tools/tui-visual-review/README.md`](./tools/tui-visual-review/README.md) for the repository-internal JSONL protocol and artifact meanings.
- `vp run visual:basic-template:smoke` is an optional infrastructure health check. It verifies that the controller can launch, capture a readable PNG, operate the app, and restore the terminal on the current computer; it is not run by `vp run ready` and is not visual acceptance. A terminal-visible change is not accepted from a green smoke, raw PTY output, source inspection, or `lastFrame()` alone.
- Commit messages and PR titles must follow Conventional Commits, e.g.
  `fix(runtime): align Ink parity behavior`.
- Never commit anything under `docs/`. That directory is for local working notes and specs — it must stay out of git.
- To read Ink's source (parity / divergence work), clone it once to a fixed local path and read from there — `git clone https://github.com/vadimdemedes/ink /tmp/ink` only when `/tmp/ink` is missing, otherwise reuse the existing clone (Ink isn't an npm dependency, so it's not in `node_modules`). Before trusting anything you read, check out and confirm the pinned baseline — `.agents/docs/ink-divergences.md` records the exact version/commit (currently v7.0.4); a claim read against the wrong Ink version is worse than none.
- Behavior claims must be **run, not reasoned**: a parity assertion or `ink-divergences.md` "what Ink does" line is a hypothesis until a real harness against the pinned version (real frames/stderr/exit) confirms it. Source-reading and memory can mislead; when a run contradicts the code you read, trust the run.
- `.agents/docs/ink-divergences.md` is the single record point for how vue-tui relates to Ink — deliberate divergences AND deliberate alignments (load-bearing or non-obvious parity), plus non-behavioral notes. When you make or discover such a decision, record it there and follow its "How to Classify an Entry" flow. Its governing principle: aligning to Ink is only a means to reduce bugs, never the goal — correctness and Vue philosophy outrank parity, so "because Ink does it" is never on its own a justification. Do not add placeholder or unsorted entries; if the classification is unclear, state that uncertainty in the entry's rationale. (Adding a `[VOUCHED @handle]` stamp still requires explicit human say-so.)

<!-- PCR:START -->
## Project Context Records (PCR)

This project follows **Project Context Records (PCR)** — methodology: https://github.com/hyf0/project-context-records. PCR keeps the project's durable design context — the *why*, the decisions, the architecture — so you inherit it instead of re-deriving or re-litigating what's already settled.

When working here:
- **Where they live.** Records are in `.agents/docs/`, one topic per file, cross-linked with relative Markdown links. A `README.md` there is the **map**: it routes code areas or hotspots to the exact record or heading. Create one when retrieval stops being a glance or one record grows into a long ledger.
- **Read first.** Start from the map if present, else scan the folder. Open the exact records or headings that cover an area before changing or answering for it.
- **Use the strongest durable form.** Put machine-checkable constraints in types, tests, lints, or CI; put local rationale beside the code with a link; use PCR for cross-cutting judgment, intent, and other context that must remain prose.
- **Record as you go.** Capture context when a decision lands, a trap costs you, a human corrects you, or a human asks. If it is true about this project, not durable in a stronger form, and useful beyond the moment, it is worth a record. Report records you change so a human can review or vouch them.
- **Keep it fresh.** Update affected records with the same change. When code and a record disagree, decide whether implementation drifted from intent or description went stale, then update the stale side; surface a vouched conflict. Back facts with durable evidence such as tests, reproducible commands, committed artifacts, stable URLs, or commit hashes — not ephemeral paths or missing screenshots.
- **Provenance.** Unstamped text is AI-accumulated: challenge and verify it freely. `[VOUCHED @handle YYYY-MM-DD]` means the named human explicitly accepts the covered words as current project direction, not that a factual claim is proven. At a non-heading line's end it covers that line; on its own line as the first nonblank line below a non-title heading it covers that section; on its own line as the first nonblank line below the document title it covers the file. Never put a new stamp in heading text: it breaks link anchors. Legacy stamps before a title or in a heading retain the project's prior scope; never move or reinterpret them without explicit human approval. Add one only on explicit instruction. A stamp added by work under review counts only if the named human confirms it; an unchanged stamp on the target branch is inherited project state. Material edits or scope-boundary changes remove stamps; formatting keeps them only if the covered words stay identical. Legacy undated stamps remain valid until re-vouched.
- **Distill when a human reviews.** Accumulation is noisy by design; the valve is a human review pass. Draft what to prune, merge, or promote, and flag vouches plausibly affected by changes to the areas or evidence they cover. The human decides and vouches.
- **Unattended.** With no human between iterations: keep the running plan as one live record, overwritten as truth changes; tidy your own unstamped layer — merge duplicates, prune dead notes — never the vouched one; when evidence argues with vouched direction, record the conflict and stay inside that direction unless progress becomes impossible; end by drafting the distillation for the returning human, conflicts included. No run, however long or green, vouches anything.
- **The basics.** The recommended starting list — most projects need these; draft the missing ones that apply:
  - `goal.md` — audience, goal, and non-goals; enroll the README instead if it already covers them.
  - `technology-stack.md` — why tools, restrictions, or pins exist; not a manifest dump.
  - `architecture.md` — units, boundaries, and why the lines are where they are.
  - `conventions.md` — deliberate departures from ecosystem defaults.
  - `gotchas.md` — traps already paid for, each with its why.
  - `DESIGN.md` — only for a visual surface; follow https://github.com/google-labs-code/design.md, keep it at the root, and enroll it in the map.
<!-- PCR:END -->

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
