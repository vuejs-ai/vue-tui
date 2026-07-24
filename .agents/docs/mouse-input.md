# Mouse input — design & decision record

> **Current status:** historical mouse design evidence only. The current branch exposes no mouse hook or `/fullscreen` subpath. Public-only composition evidence leaves target-bound pointer input as a future additive feature behind a narrow Runtime-owned operation if a selected journey requires it; this conclusion does not alter the accepted `Static` contract, preselect the pointer operation's public shape, or add a vouch.

> The public mouse-input API for `@vue-tui/runtime`: the event shape, the author surface, the
> dispatch model, and how it is gated to full-screen apps. Tracking:
> [#207](https://github.com/vuejs-ai/vue-tui/issues/207). Builds on the low-level stream
> `useMouseInput`, added in #237. Shared public-surface rules live in
> [api-contract.md](./api-contract.md); Ink-alignment is explicitly **not** a constraint here — the
> deciding rules are **user-friendliness** and **following Vue/DOM conventions, not inventing names**.
>
> **Status:** v1 shipped in [#245](https://github.com/vuejs-ai/vue-tui/pull/245) at commit
> `3e44c9a266e52ebeba2db669b4bb96521b9e2f3a`. The fixed fullscreen output contract that keeps the
> visible surface and hit map at the same origin is recorded in
> [fullscreen-output.md](./fullscreen-output.md). §5 records the shipped v1 event shape as historical
> evidence; the experimental API-stability policy does not require the target API to preserve it.
> At that checkpoint, target refs, dispatch, bubbling, low-level raw-mouse shape, hover,
> selection/clipboard, side buttons, and pixel mode remained open or deferred. The current
> correction below supersedes those future-facing v1 conclusions.
>
> **Current API-design correction (2026-07-14):** this file records the shipped v1 implementation and its historical rationale; it no longer describes the current public authoring surface. The selected unstamped F6 contract is implemented in [Fullscreen targeted pointer](./targeted-pointer.md): common components reject listener fallthrough; `@vue-tui/runtime/fullscreen` supplies a keyed `useMouseEvent()` for click and wheel plus one rendered-host-owned `useMouseDrag()` lifecycle; accepted paint geometry drives targeting; active visible demand selects `1000` or `1002`; effective visual Inline fails while expected non-targetable presentations remain inert. It adds no separate mouse authorization or availability API. It directly removes v1 listener props, root `useDraggable()`, root `useMouseInput()`, and their historical mutable/clipped event types without compatibility shims. The one-`createApp`, optional-`mode`, default-Inline mount contract remains unchanged. Automated, PTY, headless visual, direct native macOS Terminal selection/wheel, and cleanup evidence pass, so F6 is Done.
>
> **F2 implementation update (2026-07-12, unstamped):** at the F2 checkpoint, `useDraggable()` consumed the shared internal [rendered-target lifetime](./rendered-target-lifetime.md). It followed insertion, keyed inner-root replacement, removal, scope disposal, HMR, and stale Vue 3.4 component refs by resolved host identity; active capture and raw/SGR ownership ended when that host disappeared. This fixed the lifetime mechanism without accepting the then-current root export, public signature, event model, or common-component listeners as the F6 target API. F6 later removed that public hook while reusing the mechanism.
>
> Carry new design work through [api-design.md](./api-design.md) and the bounded
> [terminal UI prior-art record](./terminal-ui-prior-art.md), not the superseded v1 conclusions below.

## 1. What this is, and the scope of v1

`ScrollBox` ships no input and lets the app own the policy
([components/scroll-box.md](./components/scroll-box.md)); this is the other half — the **runtime**
owns pointer input, because decoding mouse bytes and flipping terminal modes is terminal-I/O work.

The model is **runtime-owned targeted dispatch**: the runtime hit-tests the pointer against its
layout tree and delivers the event to the element under the pointer, which bubbles up its ancestors
— a DOM-like model also used by Textual and OpenTUI. Bubble Tea and Ratatui demonstrate the
alternative global-event model where the application routes input. vue-tui's legacy
`useMouseInput` exposes only the vertical-wheel subset of that lower-level model (§4.3).

The event **types** cover the full pointer space, but **v1 delivers a subset**:

- **v1 ships:** the hit-test + dispatch infrastructure; the `TuiMouseEvent` / `TuiWheelEvent`
  types; element handler props `@mousedown` / `@mouseup` / `@click` / `@wheel`; **drag** via
  `useDraggable` (which owns pointer **capture** internally); buttons **left / middle / right**. Wire
  mode: `1002` (button + drag).
- **Deferred in v1:** bare **hover** — `@mousemove` / `@mouseenter` / `@mouseleave` and
  `useElementHover` — which needs the heavier `1003` mode (§9); an in-app selection + clipboard
  layer; the side buttons and pixel mode.

## 2. The shipped architecture: one parser, two unequal public paths

There is one SGR parser and one reference-counted terminal-mode owner. The two current public paths
do not expose the same event set:

```
terminal bytes (SGR: absolute screen coordinates)
   │
   ▼
 internal parser → down / up / drag / four wheel directions
   │
   ├───────────► legacy useMouseInput filter → vertical wheel + 1-based absolute x/y
   └───────────► hit-test + dispatch → targeted element events + 0-based coordinates
```

- SGR bytes and absolute coordinates do not depend on rendering mode, but receiving them still
  depends on raw-capable stdin, writable TTY stdout, terminal support, and explicit mouse capture.
- Public `useMouseInput` is a terminal-wide vertical-wheel stream, not a catch-all raw stream and not
  an inline substitute for `@click`.
- Targeted events add renderer geometry, hit testing, target selection, and bubbling. The current
  vue-tui implementation enables that path only for effective full-screen sessions.

## 3. Why current hit testing is gated to full-screen

To convert an absolute click coordinate into "which box," the runtime must know where the frame's
top-left sits on the physical screen.

- **Current vue-tui inline writer:** vue-tui writes each frame at the cursor's current position and updates it _relative to
  the previous frame_ (log-update-style line diffing — verified: `eraseLines`, `cursorUp`,
  `cursorTo(0)`, never an absolute home in steady state). It never tracks the frame's absolute top
  row, so an absolute click cannot currently be mapped reliably to a node. Content flushed outside
  the tracked layout, such as `<Static>`, can also shift the live region.

- **Full-screen (alternate buffer):** vue-tui owns a terminal-sized viewport for the whole mount. After a valid baseline, ordinary consecutive frames replace only changed rows through absolute cursor addressing. Initial paint, dimension changes, continuation, `app.clear()`, uncertain physical output state, and coordinated stdout/stderr/console output clear, home, and repaint the complete viewport. Yoga receives the current terminal height, and paint plus hit testing are clipped to the addressable rows, so output cannot move the visible frame away from the hit map. `/inline` Static presence is rejected before a new Fullscreen target frame, so it cannot move or publish stale hit geometry. Direct `process.stdout.write()` calls bypass this coordination; see [fullscreen-output.md](./fullscreen-output.md).

Full-screen is sufficient for the current implementation, not a universal requirement. fzf proves
that a bounded main-screen application can query its physical origin, translate SGR coordinates,
and invalidate mouse when that origin becomes unreliable; see
[terminal UI prior art](./terminal-ui-prior-art.md#fzf). vue-tui has not yet validated that model
across its own writers and target terminals.

Mouse capture is a second, independent concern. Enabling tracking redirects terminal-native
selection and wheel behavior to the application in either rendering mode. Alternate screen changes
surface ownership; it does not remove the user's possible desire to select terminal text.

### 3.1 Historical v1 policy: full-screen gate and automatic acquisition

**The mount option is renamed `alternateScreen` → `fullscreen`** (with `alternateScreen` kept as a
deprecated alias). It names the user's intent, not the terminal mechanism.

In v1 there is no `mouse` option: enabling is automatic. Mouse tracking turns on **when the app
actually uses mouse** (any element handler / `useDraggable` mounts) **and** the app is `fullscreen`,
via the existing ref-counted SGR-mode ownership (`acquireSgrMouseMode`). This correctly avoids
blanket enabling and restores the mode after the last consumer unmounts.

The historical claim that full-screen removes the side effect is incorrect. Automatic when-used
acquisition minimizes the duration of capture, but applications still need a deliberate selection
and copy story. The future direction in [api-design.md](./api-design.md) does not add a separate
public authorization step: using an explicit full-screen target composable is the request, and the
runtime owns minimum-level acquisition and restoration internally.

The shipped runtime has no opt-out beyond removing all pointer handlers and `useDraggable`
consumers.

### 3.2 Historical v1 behavior when an inline author uses `@click`

In v1, `@click` type-checks on the common `Box` and `Text` in every application. Inline registration
warns once and the handler never fires:

- **Write-time (passive):** JSDoc on the handler props — hovering `@click` in the editor shows
  "fires only in `fullscreen` mode; for raw mouse in inline mode use `useMouseInput()`."
- **Run-time (active):** when `patchProp` registers a mouse handler while mouse isn't armed, it warns
  **once** (dev **and** prod — a real dead-end, not a
  style nit), at **registration time**, not on first click, naming both fixes:
  `app.mount({ fullscreen: true })`, or `useMouseInput()` for raw inline mouse.

The warning's second suggestion is inaccurate for click: public `useMouseInput()` emits only wheel
events and does not hit-test elements. The API-design audit also proved that Vue template misuse is
not unavoidable: explicit `onClick?: never` listener props can make `<Box @click>` a `vue-tsc`
error. The current replacement candidate is a ref-bound composable from the full-screen entry point,
not a pointer-specific component. That proposal remains unstamped until the rendering-mode and
input contract is accepted.

## 4. The public surface

### 4.1 Naming — follow DOM/Vue, don't invent

Applying "follow Vue/DOM conventions" rigorously shaped both the names and the event fields. The
event object mirrors the **DOM `MouseEvent` / `WheelEvent`** field-for-field, so a Vue-web developer
already knows it. The two **type names** are prefixed `Tui` to avoid shadowing the DOM globals
of the same name; the **field** names stay DOM-exact.

```ts
/** Which button. String union (a deliberate, friendlier divergence from DOM's numeric `button`). */
export type MouseButton = "left" | "middle" | "right" | "back" | "forward";

interface MouseEventShared {
  /** Button for down/up/click/drag; `null` for move/enter/leave/wheel. */
  readonly button: MouseButton | null;
  /** Buttons currently held. BEST-EFFORT: SGR reports one button/event, so it is reconstructed by
   *  tracking down/up; multi-button chords are unreliable across terminals. (DOM uses a numeric
   *  bitmask `buttons`; a set is friendlier.) */
  readonly buttons: ReadonlySet<MouseButton>;

  // Modifiers — flat, DOM-exact names.
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;

  // Coordinates — DOM-exact names, all 0-based.
  readonly offsetX: number; // relative to `currentTarget`'s rendered box, not its content box; re-based as the event bubbles
  readonly offsetY: number;
  readonly screenX: number; // absolute terminal cell (1-based SGR wire value − 1)
  readonly screenY: number;

  // Dispatch/propagation — DOM-exact.
  readonly target: MouseTarget | null; // deepest element under the pointer; constant while bubbling
  readonly currentTarget: MouseTarget | null; // element whose handler is running; changes per hop
  stopPropagation(): void;
  preventDefault(): void; // reserved for forward-compat; no default action in v1, so a no-op today
  readonly defaultPrevented: boolean; // always false in v1
  readonly detail: number; // multi-click count (1,2,3…), meaningful on `click` — DOM's name
}

export interface TuiMouseEvent extends MouseEventShared {
  readonly type:
    | "down"
    | "up"
    | "click"
    | "move"
    | "drag"
    | "dragstart"
    | "dragend"
    | "enter"
    | "leave";
  readonly movementX: number; // movement since the previous event of this gesture — DOM's name
  readonly movementY: number;
}

/** DOM has `WheelEvent extends MouseEvent`; mirror that (prefixed to dodge the DOM globals). */
export interface TuiWheelEvent extends MouseEventShared {
  readonly type: "wheel";
  readonly button: null;
  readonly deltaX: number; // DOM WheelEvent names. Sign encodes direction (deltaY > 0 = down).
  readonly deltaY: number;
}
```

Applying the DOM lens fixed a real design trap for free: pointer movement is `movementX/movementY`
(DOM) and wheel scroll is `deltaX/deltaY` (DOM `WheelEvent`) — two _different_ DOM names, so the
"one event with two conflicting deltas" problem from an earlier draft disappears.

Every author-facing name maps to a real precedent, none invented:

| name                                                                                                               | precedent                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `@mousedown` `@mouseup` `@click` `@wheel` (props `onMousedown`…`onWheel`)                                          | DOM / Vue native event names, exact                                                                           |
| every event field (`ctrlKey`, `offsetX`, `screenX`, `movementX`, `deltaX`, `detail`, `target`, `stopPropagation`…) | DOM `MouseEvent` / `WheelEvent`, exact                                                                        |
| type names `TuiMouseEvent` / `TuiWheelEvent`                                                                       | DOM `MouseEvent`/`WheelEvent`, `Tui`-prefixed like PixiJS's `Federated…`; also matches vue-tui's own `TuiApp` |
| `useDraggable`                                                                                                     | VueUse `useDraggable`, exact                                                                                  |
| `useElementHover` (deferred)                                                                                       | VueUse `useElementHover`, exact                                                                               |
| `useMouseInput`, `MouseInputEvent`                                                                                 | existing vue-tui exports in v1 (#237); target names and shape reopened                                        |
| `mode: "fullscreen"` mount option                                                                                  | current full-screen request; replaces the historical `fullscreen` and `alternateScreen` fields                |

Only the two names that collide with a DOM global are prefixed. `Tui` — not the brand `VueTui`, and
not a namespace — is the deliberate call: it matches PixiJS (a non-DOM renderer with DOM-shaped
events prefixes `Federated…`, a _concept_ word, never the brand) and vue-tui's own existing `TuiApp` /
`TuiNode` / `TuiRoot`. A namespace (`VueTui.MouseEvent`, React's `@types` pattern) was rejected
because modern TS discourages namespaces — the handbook prefers ES modules,
`@typescript-eslint/recommended` bans them in source (`no-namespace`), and TS 5.8 `erasableSyntaxOnly`
\+ Node's native type-stripping treat `namespace` as non-erasable (React gets away with it only
because its namespace lives in `.d.ts` files). `MouseButton`, `MouseTarget`, and `MouseHandlerProps`
have no DOM global to collide with, so they stay unprefixed (prefix only where there is an actual
clash — verified: vue-tui compiles with `lib: ["es2023"]`, so these names are clean internally; the
prefix is purely to protect a consumer whose own project pulls in the DOM lib).

### 4.2 High-level — element handler props (the 90% path)

```vue
<Box @mousedown="onDown" @click="onClick" @wheel="onWheel" />
```

```ts
/** v1 interface. Hover props deliberately absent (below). */
export interface MouseHandlerProps {
  onMousedown?: (e: TuiMouseEvent) => void;
  onMouseup?: (e: TuiMouseEvent) => void;
  onClick?: (e: TuiMouseEvent) => void;
  onWheel?: (e: TuiWheelEvent) => void;
}
```

`@mousemove` / `@mouseenter` / `@mouseleave` are **omitted** from the v1 interface (not shipped as
dead no-ops) — binding one is a vue-tsc error today; v1 expected them to arrive with mode `1003`
(§9). Drag has **no** element prop: it is a gesture with capture, handled by `useDraggable`
(§4.3) — mirroring the web, which has no mouse-drag DOM event either (drag is a library/composable
there too).

There is **no** `@mouse` catch-all and **no** general `useMouse` composable. `@mouse` would duplicate
the specific targeted handlers, while `useMouse(ref, handlers)` would re-express `@click`.
`useDraggable`/`useElementHover` survive because they add something element props cannot (gesture
state, capture, a reactive `hovered`) and match VueUse. The public vertical-wheel
`useMouseInput` hook is not a catch-all substitute.

This is the shipped v1 choice, not the future authoring decision. The current API-design proposal
reverses the preference between element listeners and a target-ref composable to avoid visual
component variants and mode-dependent listener props.

The shipped renderer stores these mouse handler props on host nodes so the dispatch layer can find
them (this is also the hook that fires the §3.2 inline warning), and `<Box>`/`<Text>` fall the props
through to the host node, typed so `@click` type-checks in templates.

### 4.3 Low-level — `useMouseInput`, and `useDraggable`

```ts
/** Existing (#237). A terminal-wide vertical-wheel stream with 1-based absolute coordinates.
 *  It does not deliver click, down, up, drag, or targeted events. */
export function useMouseInput(handler: MaybeRef<(e: MouseInputEvent) => void>, options?): void;

/** VueUse `useDraggable`, adapted to the terminal: the element position tracks the pointer during
 *  a drag, owning pointer capture internally. Returns element cell position + drag state. */
export type UseDraggableTarget = MaybeRefOrGetter<ComponentPublicInstance | null | undefined>;

export function useDraggable(
  target: UseDraggableTarget, // a normal <Box>/<Text> template ref
  options?: {
    initialValue?: { x: number; y: number };
    axis?: "x" | "y" | "both";
    onStart?: (position: { x: number; y: number }, e: TuiMouseEvent) => void; // strict false cancels
    onMove?: (position: { x: number; y: number }, e: TuiMouseEvent) => void;
    onEnd?: (position: { x: number; y: number }, e: TuiMouseEvent) => void;
  },
): {
  readonly x: Ref<number>;
  readonly y: Ref<number>;
  readonly position: Readonly<Ref<{ x: number; y: number }>>;
  readonly isDragging: Readonly<Ref<boolean>>;
};
```

**Pointer capture** (keep routing to one node until release, even as the pointer leaves it) is what
lets a drag survive leaving the element. `useDraggable` acquires it on button-down and releases on
button-up, so apps never touch capture directly in v1; the dispatch layer must support "bypass
hit-testing, route to node X" (§8).

`useDraggable` deliberately accepts a normal typed template ref, the same shape as
`shallowRef<InstanceType<typeof Box> | null>(null)`, and resolves it internally to a TUI node.
`MouseTarget` is not an input handle and there is no `useMouseTarget`: `MouseTarget` only appears on
delivered events as the public `target` / `currentTarget` wrapper. This keeps the author surface
aligned with VueUse and avoids exposing a second ref type just to start dragging.

The returned `x` / `y` are the draggable element's `left` / `top` cell position, initialized from
`initialValue` and updated by pointer delta during the drag. This is the part of VueUse
`useDraggable` that carries directly to vue-tui; terminal apps bind `x.value` / `y.value` to
`left` / `top` instead of binding a CSS `style` string. The event still exposes `screenX/Y` and
`movementX/Y` for custom gesture math.

## 5. Shipped v1 event-shape snapshot

This table records which fields v1 treated as fixed and which it expected to add later. It is evidence about the current implementation, not a compatibility constraint on the replacement API. The target may change or remove these fields directly, but coordinates, target selection, propagation, and gesture semantics still require explicit design and tests rather than accidental inheritance.

| V1 treated as fixed                                                                                                | V1 deferred                                                         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `offsetX/offsetY` (target rendered-box-relative) **and** `screenX/screenY` (absolute), all 0-based, always present | new `type` members (`move`, `enter`, `leave`)                       |
| `movementX/movementY` on `TuiMouseEvent`, `deltaX/deltaY` on `TuiWheelEvent` (never mixed)                         | new handler props (`onMousemove`, `onMouseenter`, `onMouseleave`)   |
| `button` an **open** string union; wheel is `TuiWheelEvent`, not a button                                          | populating `movementX/Y`, `buttons`, `detail` as gestures gain them |
| flat DOM modifier names (`ctrlKey/shiftKey/altKey/metaKey`)                                                        | emitting side buttons (`back`/`forward`/8–11)                       |
| `type` an **open** discriminator                                                                                   | `useElementHover` + hover via mode `1003`                           |
| `target`/`currentTarget` + `stopPropagation`/`preventDefault` on the event                                         | additional event methods                                            |
| `offsetX/offsetY` stay relative-to-`currentTarget`'s rendered box and re-base while bubbling                       | switching the default motion level (config)                         |
| `MouseTarget` exposes an **absolute** rect and does **not** expose the internal `TuiNode`                          | an in-app selection + OSC 52 clipboard layer                        |
| type names `TuiMouseEvent`/`TuiWheelEvent` (prefixed)                                                              | —                                                                   |

## 6. Dispatch infrastructure (the hit map)

Each committed frame where targeted mouse is effective builds a map of every node's **absolute**
cell rectangle in **paint order**. That requires effective full-screen, a supported terminal, TTY
stdin, and the normal paint path rather than screen-reader linearization. vue-tui has no z-index;
later paint ops overwrite earlier, so paint order _is_ stacking order and a hit is the last-painted
node covering the cell. The paint walk records node identity and the visible rectangle after
clipping. The map **must honor** `overflow: "hidden"` clip rects and `position: "absolute"`
placement, or it reports hits on clipped or misplaced nodes.

Per raw event: `hitTest(screenX, screenY)` → topmost node → build the event with `offsetX/offsetY`
re-based into that node's box → dispatch to its handlers, then **bubble up the parent chain until
`stopPropagation()`**. Each bubbling hop receives its own event object with that hop's
`currentTarget` and re-based offsets; the shared `stopPropagation()` closure is the only mutable
dispatch state. `click` is synthesized when `up` lands on the same target as the preceding `down`;
`detail` increments on repeat clicks at the same cell within a short window — driven by the commit
scheduler's timing hooks (not a bare timer), so tests stay deterministic. Capture bypasses `hitTest`.

Invariants from Ink's failure (§3): the map is built **only** in full-screen (known origin), is
clipped to the same terminal viewport as paint, and excludes `<Static>`. Fullscreen Static output is
not retained visually; the runtime repaints the live surface at `(0,0)` after emitting it, so screen
rows and layout rows cannot disagree.

The correctness gate is about dispatch and terminal mode: targeted handlers / `useDraggable` arm
mouse tracking only when there is a mouse registration and the app is full-screen. Building a
full-screen hit map on frames without a current mouse registration is allowed as an implementation
detail; gating that work on the controller's armed state is only a performance optimization, and it
must not change the public event / `MouseTarget.rect` contract.

**⚠️ Teardown releases exact ownership.** Normal teardown disables only the active level this controller successfully acquired plus SGR coordinates. Synchronous signal teardown retries every level this controller previously acquired, without disabling unrelated levels it never owned. Suspension temporarily releases the exact active level and continuation reacquires the strongest still-live request. Non-TTY and `TERM=dumb` paths acquire nothing, so targeted handlers never fire there and cleanup emits no mouse controls.

## 7. Mouse-level negotiation

- **Two parser surfaces.** The internal `parseSgrMouseInput` decodes press, release, drag, and four
  wheel directions for targeted dispatch. The current public `useMouseInput` stream exposes the
  vertical-wheel-only `parseMouseInput` shape; its target replacement or removal is open (§8).
- **Leveled enable.** Each consumer holds a mode token; the controller selects the highest request
  (`button`=1000, `drag`=1002, `hover`=1003) and re-emits terminal modes on upgrades and downgrades.
- Both the low-level `useMouseInput` and the high-level dispatch acquire the **same** underlying mode
  through the shared refcount (§2) — one switch, not two.

## 8. Shipped v1 implementation notes and follow-ups

- **`MouseTarget` surface** — settled for v1: a thin public wrapper for event `target` /
  `currentTarget`: stable identity + an **absolute** rect accessor from the paint walk. It must not
  re-export `TuiNode`, must not be accepted as a way to recover a `TuiNode`, and must not be required
  for ordinary template-ref composables such as `useDraggable`.
- **Current `useMouseInput` shape** — its coordinates are **1-based**, while shipped targeted
  events are **0-based**. A future complete terminal-level stream may retain, replace, or remove
  this API, but must define its coordinate and event model deliberately rather than inherit either
  current parser accidentally. Its handler source
  intentionally stays `MaybeRef`, not
  `MaybeRefOrGetter`, because function handlers and getter functions have the same runtime shape.
  Reactive handler replacement should pass a ref to the handler.
- **`useDraggable` follow-ups** — v1 carries over VueUse's element-position semantics,
  `initialValue`, `axis`, and strict `false` from `onStart` to cancel a drag. The public TypeScript
  callback return is `void` so normal expression callbacks like `onStart: () => calls.push(...)`
  remain valid; runtime still checks the actual return value. VueUse's CSS `style`
  helper does not map directly to terminal props; a future helper can return a vue-tui layout-prop
  object if real examples need it. A future `handle` option remains open.
- **Settled v1 mechanics** — handler storage lives on the node; pointer capture is owned and released
  by `useDraggable`, including when the capturing node unmounts; mouse composables use a local
  `tryOnScopeDispose` helper for scope-safe cleanup; `fullscreen` was the supported mount-option name
  and `alternateScreen` its deprecated alias in shipped v1. F1.4 replaced both with `mode`, without
  a compatibility alias. This naming decision does not settle
  whether full-screen or inline should be the product's primary mode; see
  [intent.md](./intent.md#rendering-modes).

## 9. Deliberately out of scope (v1)

- **Bare hover** (`@mousemove` / `@mouseenter` / `@mouseleave`, `useElementHover`, mode `1003`): every
  cursor move floods stdin (heavy over SSH) and suppresses selection more aggressively than `1002`.
  V1 declared parts of this surface in types and planned later emission; the replacement hover API
  remains open.
- **Side buttons** (back / forward / 8–11) and **pixel mode (1016).** v1 emits left/middle/right only.
- **In-app text selection + clipboard (OSC 52).** This requires a separate selection, copy, and
  terminal-capability subsystem. The full-screen gate does not remove the native-selection
  tradeoff, and modifier-key bypass behavior varies by terminal.
