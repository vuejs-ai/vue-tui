# ScrollBox — decision record

> **Status:** F7 Scroll composition is Done. The maintainer selected a boolean movement result for all four existing operations: `true` means only that the effective top content line changed after flooring and clamping. A sticky-following re-arm without movement returns `false`. Public types, runtime and JavaScript behavior, package consumption, deterministic F4/F6 routing, real PTY, visual restoration, full repository gates, and fresh CI agree. The component remains common, passive, and input-free; completed F8 owns its separate Text-selection and clipboard contract. No VOUCHED stamp is implied.

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

- `scrollToLine(line)` — move to an absolute content line after flooring and clamping, then return whether the effective top line changed
- `scrollByLines(lines)` — move relatively, with positive values toward the bottom, then return whether the effective top line changed
- `scrollToTop()` / `scrollToBottom()` — jump to the top or bottom and return whether the effective top line changed; `scrollToBottom()` always re-arms sticky following, even when it returns `false`

`line` and `lines` must be finite numbers. JavaScript values that bypass the TypeScript surface fail synchronously with a `TypeError` before scroll position or sticky-following state changes. The public `scrollToLine()` wrapper accepts only its documented line argument; the private sticky-policy control is not reachable through an extra JavaScript argument.

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
ownership, reliable geometry, and hit testing. F8 now supplies a separate application-controlled
Text selection and clipboard model after mouse capture; neither concern becomes `ScrollBox` state
or input. See [Fullscreen text selection and clipboard](../fullscreen-selection-and-copy.md),
[terminal UI prior art](../terminal-ui-prior-art.md), and [api-design.md](../api-design.md).

The implemented unstamped F6 contract composes Fullscreen wheel behavior through a ref-bound runtime
composable rather than a `PointerScrollBox`, a `PointerBox`, or `@wheel` on `ScrollBox`:

```ts
import { useMouseEvent } from "@vue-tui/runtime/fullscreen";

useMouseEvent(wheelTarget, "wheel", (event) => {
  const moved = scrollBox.value?.scrollByLines(event.delta.y) ?? false;
  return moved ? "consume" : "continue";
});
```

The boolean lets a nested handler consume wheel input while its viewport moves and continue to the registered ancestor at an edge. An outer owner may still choose its own policy when it also cannot move. The durable boundary is that targeted mouse input composes outside this component and follows the rendered target's lifetime.

## F7 accepted contract and closure evidence

The former `void` surface could not implement correct nested routing without duplicating `ScrollBox`'s private offset. Four target specifications first retained that gap as expected failures:

- one component-mechanics journey applies relative, clamped, repeated, absolute, top, bottom, and page-sized line movements and requires the same synchronous changed-versus-unchanged observation;
- the bounded conversational journey runs in deterministic Inline and Fullscreen, with an F4 focused inner viewport followed by its outer focus scope;
- the Fullscreen workbench journey uses F6's deepest wheel target followed by its registered rendered ancestor;
- the desired trace moves only the inner owner while it can move, continues to the outer owner at the inner edge, and returns to the inner owner immediately when direction reverses.

Before implementation, running those tests without `test.fails` produced the intended red evidence. All component observations collapsed to `undefined`, both keyboard modes ran the outer scope after every recognized inner operation, and Fullscreen wheel bubbled after every inner operation. They are now ordinary passing tests that consume the public boolean directly, with no multi-shape adapter.

### Accepted public contract

```ts
export interface ScrollBoxExpose {
  scrollToLine(line: number): boolean;
  scrollByLines(lines: number): boolean;
  scrollToTop(): boolean;
  scrollToBottom(): boolean;
}
```

The result has one exact meaning:

- the result is synchronous because F3 focused handlers and F6 mouse handlers must return synchronously;
- it reports whether the effective top rendered row changed after flooring and clamping, including partial movement toward an edge;
- `false` covers the top or bottom edge, the same absolute row, zero movement, values whose floored result is the same row, and a non-overflowing viewport;
- Page Up/Down need no new component method: the application reads the accepted wrapper height from F5 geometry and passes that cell count to `scrollByLines()`, receiving the same result as line movement;
- the result is not an `InputHandlerResult` or `MouseHandlerResult`: an inner unchanged operation continues to its outer owner, while an outer owner may apply a different keyboard policy, and F3 and F6 expose different route types;
- the component remains the sole offset and sticky-following owner and still acquires no keyboard or mouse input.

One existing edge makes the return meaning precise. Content shrink or viewport growth can clamp a non-sticky offset to the current bottom without re-arming follow. A later `scrollToBottom()` can therefore re-arm sticky following without changing the top row; appended content then follows. That call returns `false` even though internal follow policy changed.

All four existing names and parameters are retained, and their `void` return is replaced directly without an alias or compatibility shim. The named `ScrollBoxExpose` type and `InstanceType<typeof ScrollBox>` both expose the boolean. Template, TSX, and packed JavaScript consumers cover the type and runtime surface; the packed consumer uses Vue 3.4.38 and TypeScript 6.0.3 with `skipLibCheck: false` and proves both movement outcomes, invalid values, and continued use after an error.

Component tests cover relative, absolute, fractional, zero, clamped, repeated, top, bottom, non-overflowing, sticky-rearm, invalid-value, and extra-argument behavior. Deterministic nested tests run real F4 focus routing in Inline and Fullscreen and F6 target-to-ancestor wheel routing in Fullscreen; page movement reads the F5 wrapper height. A shared real-PTY fixture repeats the two keyboard modes and raw SGR wheel journey, including exact terminal-mode cleanup. Repository visual sessions inspected the same visible offsets and routes step by step, then proved normal-buffer, cursor, input-mode, termios, and post-exit shell restoration. `vp run ready` and a fresh zero-cache `CI=true vp run ci` pass.

### Alternatives considered

The bounded pinned-peer check does not settle the vue-tui shape. Textual's private non-animated pointer helper [returns whether clamped position changed](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/src/textual/widget.py#L2718-L2822), and its wheel handler [stops bubbling only after movement](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/src/textual/widget.py#L4777-L4805), but its public semantic scroll methods return `None` and its keyboard edge behavior differs. OpenTUI's [`scrollBy()` and `scrollTo()` return `void`](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/renderables/ScrollBox.ts#L404-L473); recognized keyboard commands are handled regardless of movement and wheel can reach multiple ancestors. Ratatui [leaves input to the application](https://github.com/ratatui/ratatui/blob/de5168de6ba2f4b310565c287764f213f249a61f/ratatui/src/lib.rs#L268-L289), while its stateful list scroll methods return unit. These sources support the mechanism and passive boundary, not one public Vue encoding.

The selected boolean is the smallest conventional encoding of the one fact every journey consumes, maps directly to `"consume"` versus `"continue"`, and allocates nothing on wheel input. A named `"moved" | "unchanged"` result would carry the same bit with a new public type and more verbose routing. A structured `{ moved, followingChanged }` result could expose the no-move sticky re-arm, but that internal policy fact is unused by every representative handler and would broaden every operation. Those alternatives remain decision history, not queued compatibility surfaces.

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
