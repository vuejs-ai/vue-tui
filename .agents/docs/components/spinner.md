# Spinner — decision record

> Decisions specific to `@vue-tui/components`' `Spinner`. Shared conventions live in
> [components-design-principles.md](../components-design-principles.md). Tracking: #218.

A pure composition of `<Text>` + `useAnimation` — no new runtime export needed.

## Style selection & the escape hatch

- `type` selects an **inlined preset**; only **`dots`** (default) and **`line`** ship.
- **Inclusion bar for a preset:** universal default + functional fallback only; every frame
  must be **width-safe (exactly 1 column, verified with `string-width`)**; non-novelty. `dots`
  is the universal default; `line` is the only pure-ASCII fallback (braille needs a braille font).
  Everything else — including the full `cli-spinners` set — is reachable via the escape hatch.
- **Escape hatch:** `frames: string[]` + `interval?: number` override `type`. A `cli-spinners`
  entry (`{ interval, frames }`) can be spread in verbatim. Empty `frames` and an unknown `type`
  both fall back to `dots`; `interval` overrides in either mode.
- **No `cli-spinners` dependency.** This is a _set-membership_ decision under the inclusion bar,
  recorded here — **not** an Ink divergence (`ink-spinner`/`cli-spinners` are third-party npm, not
  Ink-core v7.0.4, which has no Spinner; there is nothing to diverge from).

## Behavior

- **Always animates.** It does NOT gate on app interactivity — there is no public signal for
  `interactive` (it lives only on the internal `AppContext`), and reaching for it would break the
  pure-composition rule. This mirrors the third-party `ink-spinner`, which likewise just animates
  (unverified parity — not run-checked); the runtime governs
  non-interactive output one layer down. (If a static-when-non-interactive affordance is ever
  wanted, it needs the runtime to expose interactivity publicly first.)
- Switching `type` changes the preset interval; `useAnimation` resets `frame` to 0 on a live
  interval change — acceptable for a spinner.

## API shape

- `color` tints the **glyph only**; the `label` stays default-colored (matches ora / @inkjs/ui).
- `label` is a **`string` prop** (type-friendly + the common Vue idiom for simple text). If rich
  label content is ever needed, reconsider a same-purpose **default slot** from consumer evidence.

## Non-goals

- **succeed / fail / pending** terminal states (`✔`/`✖`) are NOT Spinner's job — they belong to a
  future `TaskList` / `StatusMessage` (render = f(state) in a separate component).
- **Screen-reader** handling: deferred (niche; no surveyed spinner implements it).
