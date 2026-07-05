# Mouse input — design & decision record

> The public mouse-input API for `@vue-tui/runtime`: the event shape, the author surface, the
> dispatch model, and how it is gated to full-screen apps. Tracking:
> [#207](https://github.com/vuejs-ai/vue-tui/issues/207). Builds on the low-level stream
> `useMouseInput`, added in #237. Shared surface/SemVer rules live in
> [api-contract.md](./api-contract.md); Ink-alignment is explicitly **not** a constraint here — the
> deciding rules are **user-friendliness** and **following Vue/DOM conventions, not inventing names**.
>
> **Status:** design approved through the API shape and names; adversarially reviewed against source;
> implementation not started. §5 (forward-compat contract) is the load-bearing part.

## 1. What this is, and the scope of v1

`ScrollBox` ships no input and lets the app own the policy
([components/scroll-box.md](./components/scroll-box.md)); this is the other half — the **runtime**
owns pointer input, because decoding mouse bytes and flipping terminal modes is terminal-I/O work.

The model is **runtime-owned targeted dispatch**: the runtime hit-tests the pointer against its
layout tree and delivers the event to the element under the pointer, which bubbles up its ancestors
— exactly like the DOM (and Textual / OpenTUI / blessed). The raw-coordinate broadcast alternative
(Bubble Tea / Ratatui, where the app hit-tests itself) is kept only as the low-level escape hatch
(`useMouseInput`, §4.3).

The event **types** cover the full pointer space, but **v1 delivers a subset**:

- **v1 ships:** the hit-test + dispatch infrastructure; the `TuiMouseEvent` / `TuiWheelEvent`
  types; element handler props `@mousedown` / `@mouseup` / `@click` / `@wheel`; **drag** via
  `useDraggable` (which owns pointer **capture** internally); buttons **left / middle / right**. Wire
  mode: `1002` (button + drag).
- **Deferred, additive later:** bare **hover** — `@mousemove` / `@mouseenter` / `@mouseleave` and
  `useElementHover` — which needs the heavier `1003` mode (§9); an in-app selection + clipboard
  layer; the side buttons and pixel mode.

## 2. The architecture in one picture (why `useMouseInput` works anywhere but `@click` needs full-screen)

There is **one** raw source; the high-level API is that same source **plus a hit-test step**. They
are not two parallel systems.

```
terminal bytes (SGR: absolute screen coordinates)
   │
   ▼
 parser  →  raw mouse event stream (each event carries absolute screenX/screenY)   ← mode-independent
   │
   ├───────────►  useMouseInput: hands you the raw event as-is           (any mode)
   │
   └───────────►  hit-test + dispatch: map (screenX,screenY) → "which box"
                   → deliver to that box's @click                         (full-screen only)
```

- The vertical spine (terminal → parser → raw stream) is **identical inline and full-screen** — the
  bytes are the same, the absolute coordinates are the same. `useMouseInput` just reads that stream,
  so it works in **any** mode.
- `@click` is **not** a separate system: it is that same stream **plus one extra step — hit-testing**
  (turn the absolute coordinate into "which box"). That step, and only that step, needs the frame's
  absolute screen origin, which is knowable only in full-screen (§3).

So: `useMouseInput` = raw stream; `@click` = raw stream + hit-test. Both consume the same internal
stream and share the same ref-counted mouse-mode switch (§4.3). The **only** full-screen-restricted
piece is the hit-test.

## 3. Why hit-testing needs full-screen, and how the gate is enforced

To convert an absolute click coordinate into "which box," the runtime must know where the frame's
top-left sits on the physical screen.

- **Inline:** vue-tui writes each frame at the cursor's current position and updates it _relative to
  the previous frame_ (log-update-style line diffing — verified: `eraseLines`, `cursorUp`,
  `cursorTo(0)`, never an absolute home in steady state). It never tracks the frame's absolute top
  row, so an absolute click cannot be reliably mapped to a node. This is verbatim why Ink's
  maintainer rejected `onClick`:

  > "In the normal interactive path, Ink does not know or track the frame's absolute terminal origin
  > … SGR mouse coordinates are absolute screen coordinates. So clicks will be offset or just hit the
  > wrong element."

  (Precise claim: the origin is _not stably knowable_ inline — a `clearTerminal` branch does home the
  cursor occasionally, but not frame-to-frame. Content flushed outside the tracked layout, à la
  `<Static>`, shifts rows too. So the conservative gate is a full-app full-screen declaration.)

- **Full-screen (alternate buffer):** vue-tui enters the alt buffer _before the first render_ and
  paints from its top, so the frame's top-left **is** screen origin `(0,0)` and the conversion is
  exact. (Robustness: emit `\x1b[H` before the first alt frame so origin `(0,0)` is guaranteed, not
  reliant on the terminal homing on alt-buffer entry.)

Second, independent reason: enabling mouse tracking suppresses the terminal's native click-drag text
selection window-wide, including scrollback above an inline app. In full-screen the app owns the
whole viewport, so there is nothing shared to break.

### 3.1 The mode is `fullscreen`; enabling is automatic

**The mount option is renamed `alternateScreen` → `fullscreen`** (with `alternateScreen` kept as a
deprecated alias). It names the user's intent, not the terminal mechanism.

**There is no `mouse` option — enabling is fully automatic.** Mouse tracking turns on **when the app
actually uses mouse** (any element handler / `useDraggable` mounts) **and** the app is `fullscreen`,
via the existing ref-counted SGR-mode ownership (`acquireSgrMouseMode`). Rationale:

- **No explicit opt-in needed, because in full-screen there is no side effect to opt into.** The
  reason mouse tracking is normally "opt-in with a warning" (it suppresses native selection) does not
  apply once the app owns the whole screen. Declaring `fullscreen` _is_ the opt-in.
- **On-when-used, not blanket-on.** A full-screen app that uses no mouse never enables tracking, so
  its users keep native selection. Only apps that actually wire mouse pay the selection tradeoff.

There is deliberately **no opt-out flag** either; an app that wants native selection simply doesn't
wire mouse.

### 3.2 Telling an inline author that `@click` won't work

`@click` type-checks everywhere (the mount-option↔template coupling isn't expressible in types), so
in an inline app a bound handler **silently never fires**. This is the one unavoidable exception to
"misuse is a compile error"; it is covered two ways so the author can't miss it:

- **Write-time (passive):** JSDoc on the handler props — hovering `@click` in the editor shows
  "fires only in `fullscreen` mode; for raw mouse in inline mode use `useMouseInput()`."
- **Run-time (active):** when `patchProp` registers a mouse handler while mouse isn't armed (inline,
  or full-screen with no fullscreen), it warns **once** (dev **and** prod — a real dead-end, not a
  style nit), at **registration time**, not on first click, naming both fixes:
  `app.mount({ fullscreen: true })`, or `useMouseInput()` for raw inline mouse.

Refusing to render the whole app is rejected as disproportionate; the correct "don't render" is the
runtime simply not delivering events, plus the warning.

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
| `useMouseInput`, `MouseInputEvent`                                                                                 | existing vue-tui exports (#237), unchanged                                                                    |
| `fullscreen` mount option                                                                                          | intent-named; renames the mechanism-named `alternateScreen`                                                   |

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
dead no-ops) — binding one is a vue-tsc error today; they arrive with mode `1003` (§9), purely
additively. Drag has **no** element prop: it is a gesture with capture, handled by `useDraggable`
(§4.3) — mirroring the web, which has no mouse-drag DOM event either (drag is a library/composable
there too).

There is **no** `@mouse` catch-all and **no** general `useMouse` composable — both were dropped as
redundant: `@mouse` duplicates binding the specific events (and the raw stream already is a
catch-all), and `useMouse(ref, handlers)` just re-expressed `@click`. `useDraggable`/`useElementHover`
survive because they add something element props can't (gesture state, capture, a reactive
`hovered`) and match VueUse.

**This is net-new renderer work:** `patchProp` currently _ignores_ `on*` props on host nodes. v1
records mouse handlers on the node so the dispatch layer finds them (this is also the hook that fires
the §3.2 inline warning), and `<Box>`/`<Text>` fall these props through to the host node, typed so
`@click` type-checks in templates.

### 4.3 Low-level — `useMouseInput`, and `useDraggable`

```ts
/** Existing (#237). The raw broadcast stream (§2): absolute coords, you hit-test yourself, any mode.
 *  The inline escape hatch. Its coords are 1-based (unchanged); see §8 for the base mismatch. */
export function useMouseInput(
  handler: MaybeRefOrGetter<(e: MouseInputEvent) => void>,
  options?,
): void;

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

## 5. Forward-compatibility contract — fix now vs add later

| Get right NOW (breaking to change later)                                                                           | Add LATER (purely additive)                                         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `offsetX/offsetY` (target rendered-box-relative) **and** `screenX/screenY` (absolute), all 0-based, always present | new `type` members (`move`, `enter`, `leave`)                       |
| `movementX/movementY` on `TuiMouseEvent`, `deltaX/deltaY` on `TuiWheelEvent` (never mixed)                         | new handler props (`onMousemove`, `onMouseenter`, `onMouseleave`)   |
| `button` an **open** string union; wheel is `TuiWheelEvent`, not a button                                          | populating `movementX/Y`, `buttons`, `detail` as gestures gain them |
| flat DOM modifier names (`ctrlKey/shiftKey/altKey/metaKey`)                                                        | emitting side buttons (`back`/`forward`/8–11)                       |
| `type` an **open** discriminator                                                                                   | `useElementHover` + hover via mode `1003`                           |
| `target`/`currentTarget` + `stopPropagation`/`preventDefault` on the event                                         | additive event methods                                              |
| `offsetX/offsetY` stay relative-to-`currentTarget`'s rendered box and re-base while bubbling                       | switching the default motion level (config)                         |
| `MouseTarget` exposes an **absolute** rect and does **not** expose the internal `TuiNode`                          | an in-app selection + OSC 52 clipboard layer                        |
| type names `TuiMouseEvent`/`TuiWheelEvent` (prefixed)                                                              | —                                                                   |

## 6. Dispatch infrastructure (the hit map)

Each committed frame, build a map of every node's **absolute** cell rectangle in **paint order**
(vue-tui has no z-index; later paint ops overwrite earlier, so paint order _is_ stacking order — a
hit is the last-painted node covering the cell). The absolute rects come from the paint walk's
existing origin accumulation, captured by a new recording pass (the paint op-list keeps no node
identity today). The map **must honor** `overflow: "hidden"` clip rects and `position: "absolute"`
placement, or it reports hits on clipped/mispositioned nodes.

Per raw event: `hitTest(screenX, screenY)` → topmost node → build the event with `offsetX/offsetY`
re-based into that node's box → dispatch to its handlers, then **bubble up the parent chain until
`stopPropagation()`**. Each bubbling hop receives its own event object with that hop's
`currentTarget` and re-based offsets; the shared `stopPropagation()` closure is the only mutable
dispatch state. `click` is synthesized when `up` lands on the same target as the preceding `down`;
`detail` increments on repeat clicks at the same cell within a short window — driven by the commit
scheduler's timing hooks (not a bare timer), so tests stay deterministic. Capture bypasses `hitTest`.

Invariants from Ink's failure (§3): the map is built **only** in full-screen (known origin), and
content flushed outside the tracked layout (`<Static>`) is excluded so screen rows and layout rows
can't disagree.

The correctness gate is about dispatch and terminal mode: targeted handlers / `useDraggable` arm
mouse tracking only when there is a mouse registration and the app is full-screen. Building a
full-screen hit map on frames without a current mouse registration is allowed as an implementation
detail; gating that work on the controller's armed state is only a performance optimization, and it
must not change the public event / `MouseTarget.rect` contract.

**⚠️ Teardown must disable the actual mouse level (correctness bug if missed).** Today's disable
string is `\x1b[?1000l\x1b[?1006l`, used by both the async and the synchronous signal-exit paths.
`\x1b[?1000l` does **not** turn off `1002`/`1003`. Once v1 enables `1002`, exit / Ctrl-C / SIGINT
would leave the terminal spewing `<35;..M` on every move — the exact corruption the sync-restore
machinery exists to prevent. Simplest airtight fix: on teardown always emit
`\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l` (disabling an un-set mode is a no-op). Degradation:
non-TTY / `TERM=dumb` enables nothing; handlers never fire.

## 7. What "level negotiation" actually requires (net-new work, not a tweak)

- **Parser widening.** `parseMouseInput` decodes wheel only and drops every non-wheel button; v1
  decodes press / release / drag, and needs a dispatch channel beyond today's single wheel-only
  `"mouse"` emitter.
- **Leveled enable.** Today's enable (`1000`) fires only on the 0→1 refcount transition; v1 requests
  `1002` and must emit escapes on upgrade/downgrade transitions (`off`=1000 / `drag`=1002 /
  `hover`=1003).
- Both the low-level `useMouseInput` and the high-level dispatch acquire the **same** underlying mode
  through the shared refcount (§2) — one switch, not two.

## 8. Settled implementation notes and follow-ups (no effect on §5)

- **`MouseTarget` surface** — settled for v1: a thin public wrapper for event `target` /
  `currentTarget`: stable identity + an **absolute** rect accessor from the paint walk. It must not
  re-export `TuiNode`, must not be accepted as a way to recover a `TuiNode`, and must not be required
  for ordinary template-ref composables such as `useDraggable`.
- **`useMouseInput` future** — its coords are **1-based**; the new events are **0-based**. Keep it as
  the narrow wheel/raw stream, or replace with a `useRawMouse` delivering `TuiMouseEvent` — the
  latter is a **breaking change** (coord base + shape), so decide it deliberately, not as a
  "compatible" widening. Its handler source accepts `MaybeRefOrGetter`; because handler functions
  and getter functions overlap at runtime, the implementation calls a direct handler normally and
  also calls a function returned by a zero-argument getter source.
- **`useDraggable` follow-ups** — v1 carries over VueUse's element-position semantics,
  `initialValue`, `axis`, and strict `false` from `onStart` to cancel a drag. The public TypeScript
  callback return is `void` so normal expression callbacks like `onStart: () => calls.push(...)`
  remain valid; runtime still checks the actual return value. VueUse's CSS `style`
  helper does not map directly to terminal props; a future helper can return a vue-tui layout-prop
  object if real examples need it. `handle` also remains additive.
- **Settled v1 mechanics** — handler storage lives on the node; pointer capture is owned and released
  by `useDraggable`, including when the capturing node unmounts; mouse composables use a local
  `tryOnScopeDispose` helper for scope-safe cleanup; `fullscreen` is the primary mount option and
  `alternateScreen` remains only as a deprecated alias.

## 9. Deliberately out of scope (v1)

- **Bare hover** (`@mousemove` / `@mouseenter` / `@mouseleave`, `useElementHover`, mode `1003`): every
  cursor move floods stdin (heavy over SSH) and suppresses selection more aggressively than `1002`.
  Declared in the types, emitted later.
- **Side buttons** (back / forward / 8–11) and **pixel mode (1016).** v1 emits left/middle/right only.
- **In-app text selection + clipboard (OSC 52).** A whole subsystem (Textual/opencode ship their own);
  the full-screen gate contains the tradeoff meanwhile, and Shift bypasses tracking for a native
  selection in most terminals.
