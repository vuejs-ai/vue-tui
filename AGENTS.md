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
- Design each functional renderer layout around exactly one layout-engine pass. A second pass is not categorically forbidden, but it is a severe architectural warning and requires explicit, exceptionally careful review before adoption; changing a backend, or a backend merely exposing a problem, is not justification by itself. [VOUCHED @hyfdev 2026-08-22]
- Tests must simulate the output capability they assert. Ordinary Runtime and `@vue-tui/testing` tests select the public `color` option instead of mutating process color variables; focused paint tests pass an internal terminal-style capability. Resolver tests may model `FORCE_COLOR` / `NO_COLOR` precedence directly, and PTY tests exercise automatic detection against a real TTY. A spawned tool whose own CLI color behavior is in scope may use one deliberate color-control state, but must never set `NO_COLOR` together with `FORCE_COLOR`.
- When debugging color/ANSI output in a non-TTY shell, remove `NO_COLOR` and use `FORCE_COLOR=3` for that command. To debug suppression, remove `FORCE_COLOR` and use non-empty `NO_COLOR`. Never encode “unset” as an empty string in shared test configuration.
- A package's `src/` contains build inputs only. Put tests, type-test fixtures, and other test-only inputs under that package's `tests/` tree. Use `tests`, never a singular `test` directory.
- Keep source-owned tests under `packages/*/tests`. Cross-package Runtime behavior belongs in the private `tests/runtime` workspace, and full Vite plugin system tests belong in the private `tests/vite` workspace.
- Performance measurements belong in private top-level `benchmarks/*` workspaces and use `*.bench.*`. Keep their workload inputs under `fixtures/`; correctness and lifecycle coverage remain ordinary tests in the owning package or system-test workspace. `check` typechecks benchmarks but does not run host-sensitive measurements.
- Package-local `tests/` trees mirror source or contract ownership without a redundant `unit/` layer. System-test workspaces classify top-level suites by verification kind; keep each suite's fixtures and harness beside that suite rather than mixing support directories with suite kinds.
- An ordinary unit test mirrors its target's source path and file stem. When one target has several substantial test facets, put them under a directory named for the target rather than creating one giant file or a pile of ambiguous compound names. Integration and end-to-end tests instead live in explicit `integration` / `e2e` directories and are named for the contract or user-visible claim they prove.
- Use `*.test.*` repository-wide, never `*.spec.*`. The standardized `*.sequential.test.*` form is the execution-constraint exception, not a behavior name.
- **Test files run in parallel (`fileParallelism: true`), but tests WITHIN a file run serially.** We deliberately do NOT set `sequence.concurrent`: many render tests assert timing-sensitive counts driven by the renderer's ~32ms commit throttle, and in-file concurrency starves them of wall-clock on a 4-core CI runner (it passes on higher-core dev machines — the classic local-vs-CI trap). PTY tests need `pool: "forks"` (node-pty requires `child_process.fork`, not worker threads).
- Tests that depend on **process-global state** — fake timers (`vi.useFakeTimers`, which mutates global `setTimeout`/`performance`) or assertions on shared globals (`process.listenerCount`, live yoga-node counts) — live in `*.sequential.test.*` files. Even file-level parallelism can perturb them, and grouping them by name documents the constraint. Add a header comment saying which global forces it.
- Tests must not implicitly depend on the host environment. If a test needs a specific TTY/color behavior, model it through the official test host, a focused fake stream, an internal paint capability, or a sanitized child environment rather than relying on ambient values or a Vitest-wide color override.
- After completing any task, run `vp run check` (or `vpr check`) to verify: lint, type-check, test all packages, and build.
- Commit messages and PR titles must follow Conventional Commits, e.g.
  `fix(runtime): preserve inline history on resize`.
- Never commit anything under `docs/`. That directory is for local working notes and specs — it must stay out of git.
- vue-tui is an independent product. Peer frameworks provide bounded behavioral evidence; they do not define product scope, package membership, public API, or a default behavior. Start from local product intent and contracts, then use the standing set and selection rules in `.agents/docs/peer-frameworks.md` when a comparison would reduce uncertainty.
- A terminal-dependent peer behavior claim is a hypothesis until a real harness verifies it against the exact upstream version or commit examined. For each new or reopened decision, pin load-bearing peer evidence in the local record that uses it. Source reading, shared names, and memory are not proof of observable output, input, timing, or cleanup.
- Record accepted vue-tui behavior in its owning design record or decision ledger, never in a parallel parity or divergence catalog. A surprising difference from relevant peers deserves investigation and a local reason; it is not automatically a bug.

<!-- PCR:START -->
## Project Context Records (PCR)

This project follows **Project Context Records (PCR)** — methodology: https://github.com/hyfdev/project-context-records. PCR keeps the project's durable judgment — the *why*, the decisions, the intent — so you inherit it instead of re-deriving or re-litigating what's already settled.

When working here:
- **Where records live.** Records are in `.agents/docs/`, one topic per file, cross-linked with relative Markdown links.
  - A `README.md` there is the **map**: it routes code areas or hotspots to the exact record or heading, one-line gist per route. Create it when retrieval stops being a glance or one record grows into a long ledger.
- **Read first.** Start from the map if present, else scan the folder. Open the records or headings that cover an area before changing or answering for it; if the area has a decision ledger, read it first.
- **Use the strongest durable form.** Machine-checkable constraints go in types, tests, lints, or CI; rules that must bind every session go in the agent-instructions file, outside the markers; single-spot rationale goes beside the code with a link; records carry the cross-cutting judgment, intent, and context that must stay prose.
- **Record as you go.** Capture context when a decision lands, a trap costs you, a human corrects you, or a human asks — anything true about this project, not durable in a stronger form, and useful beyond the moment.
  - Report what you record so a human can review or vouch it.
  - Records are as public as the repo: keep secrets out, and ask before recording rationale from private context.
- **Write to be acted on.** Lead with the current conclusion and where it applies; capture the why — trade-offs, alternatives rejected, known pitfalls. Keep each topic's current truth in one fresh place, updated in place: evolution belongs to git, never to supersede chains.
- **Keep it fresh.** Update affected records in the same change that touches their subject.
  - When code and a record disagree, decide which side went stale and fix that side.
  - Back facts with durable evidence — tests, reproducible commands, committed artifacts, stable URLs, commit hashes — not ephemeral paths or one session's output.
- **Provenance.** Unstamped text is AI-accumulated: challenge and verify it freely. `[VOUCHED @handle YYYY-MM-DD]` means the named human explicitly accepted the covered words as current project direction.
  - A vouch is direction, not proof: facts keep needing durable evidence. Don't reopen vouched direction for its own sake — only on new evidence, a changed constraint, or the human's say-so.
  - When evidence argues with vouched direction, record the conflict and surface it to a human; stay inside the direction unless progress becomes impossible. Silence is not an option.
  - Scope: at a non-heading line's end, the stamp covers that line; alone on the first nonblank line below a heading, that section until the next heading of the same or higher level; alone below the document title, the whole file. Never in heading text — link anchors derive from headings.
  - Add a stamp only on explicit instruction. A stamp added by work under review counts only once the named human confirms it; an unchanged stamp on the target branch is inherited project state.
  - The stamp binds the exact covered words. Any edit that changes them — or changes which words the scope covers — removes the stamp until the human re-vouches; a change that leaves the covered words identical keeps it.
  - Legacy stamp forms (undated, before the title, inside a heading) stay valid with their original scope; never move, re-date, or reinterpret one without the human's approval.
- **Decision ledgers.** When the human declares that an area records decisions, keep that area's judgments in `<area>-decisions.md` and register new judgments there.
  - Placement: beside the area's derived document (`DESIGN-decisions.md` beside `DESIGN.md`, typically both in the records folder); with no derived document, in the records folder — a map route either way.
  - You may propose opening a ledger; only the human opens one.
  - The register contract, stated at the top of the file: only judgments the human actually expressed enter — a finished implementation, a passed review, resemblance to a reference, or silence is not acceptance. Never invent a rationale: if no reason was given, the entry says so.
  - Record the act of judgment, not the chosen thing's full content — exhaustive detail lives in the area's own document, linked. Edit entries in place; git keeps history.
  - Entries sit under **Decided** or **Open**. An Open entry marks a known-undecided question — current behavior is not a choice — with any stopgap and what would settle it. A Decided entry carries:
    - a short stable topic heading — map routes and stamp scopes anchor to it;
    - **Ruling:** one plain sentence, its force in its own wording — must / never / prefer / default to; no status field;
    - **Limits:** what it does not govern, what may change without reopening it, what would reopen it — a stopgap is a ruling plus its reopen condition;
    - **Why:** premises, alternatives compared, rejections — exactly as the human gave them;
    - **Source:** who expressed it, when, a durable pointer; for "accept the reviewed thing as a whole", pin the thing (commit hash, spec section) instead of transcribing it;
    - the vouch stamp, once the human vouches the entry, alone under the entry's heading — covering the whole entry.
- **Distill when a human reviews.** Accumulation is noisy by design; the valve is a human pass, and you draft it.
  - Propose: prune what is contradicted or dead, merge near-duplicates, promote buried context, fix map drift. Unattended, apply this to your own unstamped layer as you go — never the vouched one.
  - Flag: unstamped direction that has become load-bearing, factual claims whose evidence no longer holds, vouches plausibly affected by changes to what they cover.
  - The human decides and vouches.
- **Suggested topics.** Draft the missing ones that apply; when an existing doc already covers a topic, enroll it — a map route pointing at it where it lives, held to these same rules — instead of drafting a twin:
  - `intent.md` — what this is trying to be, for whom, and the non-goals; enroll the README instead if it truly covers them.
  - `technology-stack.md` — why tools, restrictions, and pins exist; not a manifest dump.
  - `architecture.md` — units, boundaries, and why the lines are where they are; when structure isn't glanceable.
  - `gotchas.md` — traps already paid for, each with its why; only real paid lessons.
  - `DESIGN.md` — only for a visual surface; follow https://github.com/google-labs-code/design.md (records folder by default — the spec fixes no location), enroll it in the map, and suggest wiring its linter into the project's own checks with the file's actual path (e.g. `npx @google/design.md lint .agents/docs/DESIGN.md`; platform variants in the spec).
  - `loop-goal.md` — only for an unattended run: the run's contract — goal, boundaries, finish criteria. You may draft it; the run starts only once the human has vouched the whole file (stamp below the title), and a human edit plus re-vouch re-baselines it. Never edit it yourself; if the contract itself blocks progress, stop and surface the conflict rather than stepping outside it.
  - `loop-status.md` — only for an unattended run: the run's memory — done, in flight, next, blocked — overwritten in place each iteration; its final overwrite is the handover to the returning human (what landed, what to vouch, what to prune, conflicts included). Both `loop-*` files die after the human's distillation pass over that handover; git keeps them.
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
