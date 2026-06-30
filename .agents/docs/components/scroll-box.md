# ScrollBox — decision record

> Decisions specific to `@vue-tui/components`'s `ScrollBox`. Shared conventions live in
> [components-design-principles.md](../components-design-principles.md). Tracking: #221.

`ScrollBox` is a bounded app-managed viewport for long terminal content that may keep updating,
such as streaming agent output.

## Package placement

- `ScrollBox` lives in `@vue-tui/components`, not `@vue-tui/runtime`.
- It is built only from the runtime public barrel: `Box`, `useBoxMetrics`, `useInput`, and
  `useMouseInput`.
- It deliberately does not import `@vue-tui/runtime/internal`; SGR mouse-mode ownership and mouse
  input decoding live in the runtime public `useMouseInput` capability.

## Behavior

- Mouse-wheel scrolling is enabled by default because it is the natural way users browse terminal
  history.
- Sticky-bottom is the core semantic: while sticky, content growth follows the bottom; after the
  user scrolls up, content growth preserves the current viewport instead of jumping to the latest
  output.
- Keyboard scrolling (`PageUp` / `PageDown` / `Ctrl|Meta+Home` / `Ctrl|Meta+End`) is optional via
  `enableKeyboard`.
- `renderToString()` must not emit SGR mouse-mode sequences.

## Implementation notes

- The viewport and content boxes are measured with `useBoxMetrics`.
- Scrolling is represented as `scrollTop` state and applied as negative `marginTop` on the inner
  content box while the outer box clips with `overflowY:"hidden"`.
- SGR mouse mode is owned by runtime `useMouseInput`; `ScrollBox` only consumes wheel events and
  updates its app-managed scroll offset.
