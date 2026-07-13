# ScrollBox — decision record

> Decisions specific to `@vue-tui/components`'s `ScrollBox`. Shared conventions live in
> [components-design-principles.md](../components-design-principles.md). Tracking: #221.

`ScrollBox` is a **bounded, sticky-following viewport** for content taller than the space it is
given. Its core job — clip the overflow and follow the bottom as content grows — works with **no
props and no input**. Scrolling back is driven **imperatively** through the exposed handle; the
component itself listens to **no** mouse or keyboard input.

## What it's for — and what to use instead

- Use it for an **app-owned bounded scroll region** in either rendering mode — for example a log pane
  in a full-screen dashboard or a fixed-height preview inside an inline workflow. The parent must
  allocate a height; mode does not create that bound by itself.
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
- **The mouse wheel is an application-level tradeoff.** Receiving wheel events requires enabling
  terminal mouse tracking, which redirects terminal-native selection and wheel behavior to the
  application. Modifier-key bypass behavior varies by terminal. A scroll region whose content users
  need to read and copy must not silently make that choice; the evidence and terminology live in
  [terminal UI prior art](../terminal-ui-prior-art.md#mouse-and-event-delivery).
- **Keyboard input is global and collision-prone.** `useInput` is global (no focus routing baked
  in), so a built-in binding would grab keys app-wide and collide with a focused input — arrows move
  its cursor, `Home` / `End` are line-start / -end. Which keys scroll which region is the app's call.
- **Do not rely on wheel-to-arrow translation as a framework contract.** It depends on terminal
  configuration and modes that vue-tui does not currently negotiate. Keyboard bindings remain a
  valid application policy, but they do not imply portable wheel support.

Targeted wheel, click, and drag are separate framework-level concerns. They require terminal mouse
ownership, reliable geometry, and hit testing. Preserving application-controlled text selection and
copy after mouse capture would additionally require a selection and clipboard model. Both concerns
are out of scope for this input-free component; see
[terminal UI prior art](../terminal-ui-prior-art.md) and [api-design.md](../api-design.md).

The implemented unstamped F6 contract composes Fullscreen wheel behavior through a ref-bound runtime
composable rather than a `PointerScrollBox`, a `PointerBox`, or `@wheel` on `ScrollBox`:

```ts
import { useMouseEvent } from "@vue-tui/runtime/fullscreen";

useMouseEvent(wheelTarget, "wheel", (event) => {
  scrollBox.value?.scrollByLines(event.delta.y);
  return "consume";
});
```

That example intentionally consumes every delivered wheel. F7 will decide whether scroll methods
report actual movement so a nested handler can return `"continue"` at an edge. The durable boundary
is that targeted mouse input composes outside this component and follows the rendered target's
lifetime.

## Future direction (not in scope now)

Add these when a real need shows up — shaped to _not_ leak internal state:

- **Page scrolling.** A "page" needs the viewport height (how many lines fit). That is a _size_, so
  a consumer can observe the resolved `geometry.parent.height` from public `useElementGeometry()`
  on the box it wraps `ScrollBox` in, then call `scrollByLines(height)`. `ScrollBox` may also offer a convenience method
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

- The viewport and content boxes use the full resolved `geometry.parent.height` from `useElementGeometry()`, never the clipped visible fragment. Their last resolved heights are retained while geometry is pending, hidden, detached, or unavailable so a temporary surface loss cannot reset a non-sticky scroll position.
- Scrolling is `scrollTop` state applied as a negative `marginTop` on the inner content box, while
  the outer box clips with `overflowY: "hidden"`.
- Sticky-bottom: while sticky, content growth follows the bottom; after the app scrolls up (via the
  handle) growth preserves the current viewport. Any scroll that lands at `maxScroll` (incl.
  `scrollToBottom`) re-arms sticky.
- Geometry generations for the two boxes are reconciled in one batched watcher, so ScrollBox never clamps against one old and one new height during the same paint commit.
- Built only from the runtime public barrel (`Box`, `useElementGeometry`); no `@vue-tui/runtime/internal`.
