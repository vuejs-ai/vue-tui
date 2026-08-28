# ScrollBox

`ScrollBox` is the passive bounded viewport in `@vue-tui/components`. It keeps content at natural height, clips the visible window, follows the bottom until the application scrolls away, and exposes movement through one imperative handle.

## Scope

Use `ScrollBox` for application-owned live history that must remain navigable and replaceable. Use `Static` from `@vue-tui/runtime/inline` for completed Inline output that should become irreversible terminal scrollback.

`ScrollBox` works in both Inline and Fullscreen because it is ordinary reactive layout. It acquires no input and imports only supported public Runtime APIs.

## Public contract

```ts
export interface ScrollBoxExpose {
  scrollToLine(line: number): boolean;
  scrollByLines(lines: number): boolean;
  scrollToTop(): boolean;
  scrollToBottom(): boolean;
}
```

The component has no props. Each operation returns synchronously whether the effective top rendered line changed after flooring and clamping:

- partial movement toward an edge returns `true`;
- an edge, the current line, zero movement, a value flooring to the current line, or a non-overflowing viewport returns `false`;
- re-arming sticky following without changing the current top line returns `false`.

The boolean is a movement fact, not an input-propagation result. It lets application code decide explicitly whether to try another scroll owner.

## Input policy

Keyboard, wheel, focus, and nested-owner policy belong to the application. Current Runtime exposes global broadcast `useInput()` and no public targeted mouse API, so `ScrollBox` must not claim keys or manufacture component-level pointer routing.

```ts
import { useInput } from "@vue-tui/runtime";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import { shallowRef } from "vue";

const viewport = shallowRef<ScrollBoxExpose | null>(null);

useInput((event) => {
  if (event.type !== "key") return;
  if (event.key.name === "up") viewport.value?.scrollByLines(-1);
  if (event.key.name === "down") viewport.value?.scrollByLines(1);
});
```

Page movement is application policy: bind `useBoxMetrics()` to the wrapper Box, read its accepted height, and pass that count to `scrollByLines()`.

## Following and measurement

While sticky, content growth follows the bottom. Scrolling away preserves the current viewport as content grows. Any operation that lands at the current bottom re-arms following.

The viewport and content bind to public Box instances and use `useBoxMetrics()` for accepted sizes. A temporary hidden or detached state does not reset an existing non-sticky position. The component never exposes its raw internal offset as a second state model.

## Evidence

[`scroll-box.test.tsx`](../../../packages/components/tests/scroll-box/scroll-box.test.tsx) covers relative and absolute movement, clamping, fractional and invalid inputs, non-overflowing content, sticky re-arming, content and viewport changes, and public handle behavior. Public export and declaration tests cover the constructor and `ScrollBoxExpose` type.
