# Ink Parity — Reference Pin & Intentional-Divergence Allowlist

> The audit in [[ink-parity-loop]] diffs vue-tui against the Ink source pinned below.
> Anything listed under "Intentional divergences" is **deliberate** and is NOT a gap —
> the audit skips it. Confirmed gaps and sweep history live in [[parity-ledger]].

## Target Ink reference

| field             | value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| package           | `ink` (vadimdemedes/ink)                                                                       |
| version           | v7.0.4                                                                                         |
| tag               | `v7.0.4`                                                                                       |
| pinned commit SHA | `40b3a7578811fd616341ca4e31cc7748aeeff12f`                                                     |
| clone             | `git clone --depth 1 --branch v7.0.4 https://github.com/vadimdemedes/ink.git /tmp/ink-40b3a75` |
| verify            | `git -C /tmp/ink-40b3a75 rev-parse HEAD` must equal the pinned commit SHA above                |

> Note: `git ls-remote …/ink refs/tags/v7.0.4` returns `c4f638cf…`, the **annotated tag
> object** SHA — _not_ the commit. The commit the tag points to is `40b3a75…` (what we pin
> and what `rev-parse HEAD` resolves to after checkout). Pin the commit, not the tag object.

Re-pin deliberately when bumping the target Ink version: update the row above, note the
bump in the ledger sweep history, and re-run a full audit against the new SHA.

## Intentional divergences (allowlist — skip these)

These are differences the audit must treat as **by design**. Format:
`area — what Ink does — what vue-tui does — why`.

- **Entry API** — Ink exposes `render()`; vue-tui exposes `createApp()`. Renamed to match
  Vue's `createApp` mental model. Deliberate.
- **Text measurement exports** — Ink does not export its `measure-text` module; vue-tui
  exports `measureText` / `measureTextNatural` from the public index. Deliberate public
  surface.
- **App composable** — Ink's `useApp()` returns the full AppContext (exit +
  `waitUntilRenderFlush` + stdout/stdin/…); vue-tui exposes `useExit()` returning only the
  exit fn. Intentional minimal surface. (`waitUntilRenderFlush` is not exposed as a
  composable.)
- **Accessibility props** — vue-tui adds `AriaRole` / `AriaState` props with no Ink
  equivalent. Additive, deliberate.
- **Named type/prop re-exports** — Ink re-exports BoxProps, TextProps, StaticProps,
  TransformProps, NewlineProps, WindowSize, CursorPosition, DOMElement, RenderOptions,
  Instance, App/Stdin/Stdout/StderrProps. vue-tui intentionally does not re-export these
  names (uses TuiApp / MountOptions and its own type surface instead).
- **React concurrent mode** — Suspense / useTransition have no Vue equivalent. N/A, not a
  gap.

## Candidate intentional divergences (needs human review)

_(The loop appends here when it finds a difference it suspects is intentional but that is
not yet on the allowlist. A human promotes entries up into the allowlist — the loop never
does.)_

- **Kitty-protocol Ctrl+C exits the app (G07)** — Ink does NOT exit on a kitty-encoded
  Ctrl+C (`\x1b[99;5u`): `use-input.ts:245-247` only `return`s (suppresses the user
  handler), and Ink's real exit path (`App.tsx:244-246`) fires only on the literal `\x03`
  byte, which kitty never produces. vue-tui's `useInput.ts:100-105` calls `app.exit()`
  directly on `input==='c' && key.ctrl`, so Ctrl+C exits under BOTH legacy and kitty
  protocols. **This is arguably better UX than Ink** (Ctrl+C reliably exits) and looks
  like a kitty-era oversight in Ink rather than a deliberate choice. Flagged for the
  maintainer to decide: keep vue-tui's behavior (promote to the allowlist) or match Ink
  (remove the kitty-path exit so only `\x03` exits). Not auto-changed — removing a working
  Ctrl+C-exits behavior to match an Ink limitation needs a human call. Tracked as G07 in
  [[parity-ledger]] (status `candidate`).
- **Multiple `<Static>` nodes supported (G24)** — vue-tui's `findStatics(root)` collects and
  renders EVERY `<Static>` in the tree; Ink maintains a single `staticNode` (only the
  most-recent `<Static>` renders). So vue-tui supports multiple `<Static>` regions, which
  Ink does not — matching Ink would REMOVE that capability. Flagged for the maintainer:
  keep vue-tui's multi-Static support (promote to allowlist) or restrict to Ink's single
  staticNode. Not auto-changed. Tracked as G24 in [[parity-ledger]] (status `candidate`).
