# ScrollBox — decision record

> Decisions specific to `@vue-tui/components`'s `ScrollBox`. Shared conventions live in
> [components-design-principles.md](../components-design-principles.md). Tracking: #221.

`ScrollBox` is a **bounded, sticky-following viewport** for content taller than the space it is
given. Its core job — clip the overflow and follow the bottom as content grows — works with **no
props and no input**. Scrolling back is driven **imperatively** through the exposed handle; the
component itself listens to **no** mouse or keyboard input.

## What it's for — and what to use instead

- Use it for a **fixed-height scroll region inside a persistent layout** — a pane in a full-screen
  (`fullscreen`) app (a dashboard, a multi-pane TUI) where content can't just flow into the
  terminal's own scrollback.
- For **inline streaming output** (a coding agent's transcript, a long log), prefer `Static`: let
  the content flow into the terminal's scrollback, where the terminal owns scrolling and text
  selection natively. vue-tui's own `coding-agent` example does exactly this — it uses `Static`, not
  `ScrollBox`. Bounding streaming output in an inline `ScrollBox` fights the grain (see below).
- Fullscreen does not retain `<Static>` output on its fixed surface: new Static bytes are emitted to
  stream observers and then repainted away. Keep fullscreen history in reactive state inside a
  `ScrollBox`; see [fullscreen-output.md](../fullscreen-output.md).

## No built-in input — imperative handle only

`ScrollBox` deliberately ships **no `wheel` / `keyboard` props**. It exposes an imperative handle
(`ScrollBoxExpose`) via `defineExpose`, grabbed with a template ref:

- `scrollToLine(line)` — absolute position in content lines (clamped)
- `scrollByLines(lines)` — relative (positive = toward the bottom)
- `scrollToTop()` / `scrollToBottom()` — jump to top / bottom (`scrollToBottom` re-arms sticky, so
  streaming output is followed again)

The consumer wires whatever mouse / keyboard it wants onto these actions. Why input is the app's
job, not a built-in prop:

- **The best practice for terminal scroll input isn't settled**, and its tradeoffs leak terminal
  internals into a component API. Rather than bake in a half-answer, `ScrollBox` ships only the
  scroll **mechanism** and lets the app own the **policy**.
- **The mouse wheel is a footgun.** Receiving wheel events requires enabling terminal mouse
  tracking, which suppresses the terminal's native text selection **window-wide** (the Shift/Option
  bypass is unreliable across terminals — verified broken in Warp and macOS Terminal.app). A scroll
  region whose content you often want to read and copy is exactly the wrong place to silently break
  copy. `useMouseInput` stays a runtime capability for an app that knowingly wants it.
- **Keyboard input is global and collision-prone.** `useInput` is global (no focus routing baked
  in), so a built-in binding would grab keys app-wide and collide with a focused input — arrows move
  its cursor, `Home` / `End` are line-start / -end. Which keys scroll which region is the app's call.
- **In a full-screen app the wheel works for free anyway.** Most terminals convert the wheel into
  arrow keys on the alternate screen ("alternate scroll", DECSET 1007), so if the app binds arrow
  keys to `scrollByLines`, the wheel scrolls the box **without** mouse tracking and **without**
  breaking selection. That is the terminal's doing, delivered as ordinary keyboard events — not ScrollBox's.

Rich mouse interaction (wheel-follows-the-pointer + click / drag + copy) is a separate,
framework-level concern: it needs mouse tracking plus an app-level selection + clipboard layer (OSC
52), the way Textual and opencode do it. That is out of scope here and deferred.

## Future direction (not in scope now)

Add these when a real need shows up — shaped to _not_ leak internal state:

- **Page scrolling.** A "page" needs the viewport height (how many lines fit). That is a _size_, so
  a consumer can already measure it with the public `useBoxMetrics` on the box it wraps `ScrollBox`
  in, then call `scrollByLines(height)`. `ScrollBox` may also offer a convenience method
  (`scrollByPage(pages)`) — that is fine, it's sugar over a public capability, not a leak. Don't
  bake a fixed "page = half / full viewport" policy into the core; let the consumer (or a `pages`
  argument) decide the size.
- **Scroll-position readouts.** Unlike a size, the _current scroll position_ is `ScrollBox`'s own
  bookkeeping — the consumer cannot measure it, only `ScrollBox` knows it. If a consumer needs it,
  expose a **semantic** answer to the specific question, never the raw offset:
  - `atBottom` (boolean) — "are we following the latest?" → for a "↓ N new" badge. (Note: this
    answers _whether we're at the bottom_, not _where_ we are.)
  - `scrollFraction` (0–1) — proportional position (0 = top, 1 = bottom) → for a scrollbar. This is
    the "where are we" readout.
  - the raw line offset — the literal "which line is at the top", only for save / restore of a
    position (rare). It is the internal number, so add it only with a clear reason.

## Implementation notes

- The viewport and content boxes are measured with `useBoxMetrics`.
- Scrolling is `scrollTop` state applied as a negative `marginTop` on the inner content box, while
  the outer box clips with `overflowY: "hidden"`.
- Sticky-bottom: while sticky, content growth follows the bottom; after the app scrolls up (via the
  handle) growth preserves the current viewport. Any scroll that lands at `maxScroll` (incl.
  `scrollToBottom`) re-arms sticky.
- Built only from the runtime public barrel (`Box`, `useBoxMetrics`); no `@vue-tui/runtime/internal`.
