# Fullscreen targeted pointer

> **Status:** selected unstamped F6 public contract, implemented and complete on the current foundation branch. Public exports, direct v1 removal, deterministic behavior, package consumption, HMR, real PTY, headless visual review, cleanup, full local repository gates, and a direct native macOS Terminal observation agree with this record. F6 and the dependent F7 Scroll composition foundation are Done; F8 is Active. No VOUCHED stamp changed. The historical v1 surface remains in [mouse-input.md](./mouse-input.md); pinned peer evidence remains in [terminal-ui-prior-art.md](./terminal-ui-prior-art.md#targeted-pointer-observations).

## Product boundary

F6 supplies renderer-targeted mouse behavior for an effective visual Fullscreen terminal. It does not make common visual components interactive, manufacture a physical origin for Inline, provide a terminal-wide raw event stream, or solve application-owned selection and copy.

The layers remain separate:

1. the terminal reports SGR mouse facts after vue-tui acquires an exact reporting level;
2. the shared F3 ingress parses each physical fact once and keeps pointer facts private from ordinary keyboard/text/paste routing;
3. the Fullscreen pointer controller selects a rendered target from the last successfully displayed paint generation and routes one semantic event through registered ancestors.

`Box`, `Text`, and `ScrollBox` remain passive. A normal Vue component ref becomes interactive only while a Fullscreen mouse composable is attached to its resolved rendered host. No `PointerBox`, mode prop, `mouse: true`, or second focus owner is added.

## Evidence packet

The representative consumers do not protect the shipped API:

- the first-party mouse example is a capability demo rather than a product journey;
- the coding-agent example and the pinned mo Inline finder are keyboard-driven;
- the pinned machud Fullscreen monitor is intentionally pointer-free and must acquire no mouse mode merely because it is Fullscreen;
- Herdr supplies real click-to-focus, regional wheel, divider drag, right-click, selection, and terminal-pane forwarding needs, but it uses an application geometry router and cannot choose a Vue API shape;
- at the F6 audit boundary, no repository production consumer used the then-current terminal-wide `useMouseInput()` hook.

The peer review found targeted retained-tree dispatch in OpenTUI and Textual, a paint-cell callback grid in prompt_toolkit, global application routing in Bubble Tea, application-owned input in Ratatui, raw focused sequences in pi-tui, and no mouse API in Ink. Their target, coordinate, default, capture, click, Inline, and reporting policies differ. The resulting contract below is therefore a vue-tui decision, not claimed industry parity.

The implementation now exposes exactly the selected runtime and testing surfaces. Public/type/template/TSX/JavaScript guards, a clean Vue 3.4.38 and TypeScript 6.0.3 packed consumer, successful-frame targeting, click/wheel/focus/ScrollBox composition, same-host drag cohorts, re-entrant phase cleanup, failed-start click suppression, profile and acquisition failures, signals, suspension, teardown faults, HMR replacement, and a real nested-PTY workbench journey pass. A clean headless visual-review run observed `none -> 1000+1006 -> 1002+1006 -> 1000+1006 -> none`, alternate-screen restoration, exact termios restoration, and post-exit shell input. A direct native macOS Terminal 2.15 (470.2) observation on 2026-07-14 then covered the remaining visible side effect in a disposable 97×32 window. With `targets=hidden`, an ordinary unmodified drag produced a native selection highlight and wheel input entered and left Terminal scrollback. After `a` made the target visible, the same drag produced no native selection and wheel input reached the target, with the route marker and `ScrollBox` content both moving. After `x` removed the final target, native selection and Terminal scrollback worked again; after `q` restored the shell, both remained available. The pre-existing Terminal window was not reused or closed, and the frontmost application and pointer position were restored after observation.

## Selected authoring shape

The selected entry point is `@vue-tui/runtime/fullscreen`. It exports no second app creator; applications continue to use the root `createApp()` and mount with `mode: "fullscreen"`.

Stateless targeted events use one keyed ref composable. A captured drag is one stateful gesture with a dedicated composable so independently registered start/move/end callbacks cannot disagree about one capture owner.

```ts
import type { MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import type { CellPoint, ElementTarget } from "@vue-tui/runtime";

export type MouseButton = "left" | "middle" | "right";
export type MouseHandlerResult = "continue" | "consume";

export interface CellDelta {
  readonly x: number;
  readonly y: number;
}

export interface MouseModifiers {
  readonly shift: boolean;
  /** The SGR Meta modifier, exposed under the terminal convention users treat as Alt. */
  readonly alt: boolean;
  readonly ctrl: boolean;
}

interface TargetedMouseEventBase {
  /** Whether this registration was the selected target or a registered ancestor. */
  readonly delivery: "target" | "bubble";
  /** Zero-based cell in the accepted Fullscreen render surface. */
  readonly surface: CellPoint;
  /** Zero-based cell local to the registration receiving this callback. */
  readonly local: CellPoint;
  readonly modifiers: MouseModifiers;
}

export interface TuiMouseClickEvent extends TargetedMouseEventBase {
  readonly type: "click";
  readonly button: MouseButton;
}

export interface TuiMouseWheelEvent extends TargetedMouseEventBase {
  readonly type: "wheel";
  /** Signed terminal wheel steps; positive x/y move toward later columns/content. */
  readonly delta: CellDelta;
}

export interface TuiMouseEventMap {
  readonly click: TuiMouseClickEvent;
  readonly wheel: TuiMouseWheelEvent;
}

export type MouseEventHandler<Type extends keyof TuiMouseEventMap> = (
  event: TuiMouseEventMap[Type],
) => MouseHandlerResult;

export type TuiMouseDragEvent =
  | {
      readonly type: "drag";
      readonly phase: "start" | "move" | "end";
      readonly button: "left";
      readonly surface: CellPoint;
      /** Null only while capture places the pointer outside an exact target-local mapping. */
      readonly local: CellPoint | null;
      readonly modifiers: MouseModifiers;
      /** Signed cell delta since the preceding point in this gesture. */
      readonly movement: CellDelta;
    }
  | {
      readonly type: "drag";
      readonly phase: "cancel";
      readonly button: "left";
      readonly reason: "deactivated" | "target-lost" | "suspended";
      readonly surface: CellPoint;
      readonly local: CellPoint | null;
      readonly modifiers: MouseModifiers;
      readonly movement: null;
    };

export type MouseDragHandler = (event: TuiMouseDragEvent) => void;

export interface UseMouseEventOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
}

export interface UseMouseDragOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
}

export interface UseMouseDragReturn {
  readonly isDragging: Readonly<ShallowRef<boolean>>;
}

export function useMouseEvent<Type extends keyof TuiMouseEventMap>(
  target: ElementTarget,
  type: Type,
  handler: MaybeRef<MouseEventHandler<Type>>,
  options?: UseMouseEventOptions,
): void;

export function useMouseDrag(
  target: ElementTarget,
  handler: MaybeRef<MouseDragHandler>,
  options?: UseMouseDragOptions,
): UseMouseDragReturn;
```

The `/fullscreen` entry point has exactly two value exports, `useMouseEvent` and `useMouseDrag`. Its named type exports are `MouseButton`, `MouseHandlerResult`, `CellDelta`, `MouseModifiers`, `TuiMouseClickEvent`, `TuiMouseWheelEvent`, `TuiMouseEventMap`, `MouseEventHandler`, `TuiMouseDragEvent`, `MouseDragHandler`, `UseMouseEventOptions`, `UseMouseDragOptions`, and `UseMouseDragReturn`. It references the root `CellPoint` and `ElementTarget` types and Vue's ref utility types without re-exporting them. It does not re-export root application, component, focus, geometry, or render-session values.

`Mouse`, rather than `Pointer`, is deliberate. Every pinned terminal peer uses mouse terminology, and SGR supplies no browser `pointerId`, pointer type, pressure, contact dimensions, tilt, twist, or multi-device capture. Calling this `PointerEvent` would suggest semantics the terminal cannot report. VueUse supplies the Vue-shaped naming precedent: `useEventListener(target, event, listener)` is keyed and ref-aware, while its `usePointer()` specifically publishes those richer browser pointer fields.

The remaining names follow existing vue-tui and Vue conventions rather than Ink compatibility. `TuiMouseClickEvent`, `TuiMouseWheelEvent`, and `TuiMouseEventMap` remain distinct from browser event families; composable options and return shapes use `UseXOptions` and `UseXReturn`; `ElementTarget` and `CellPoint` are reused from F5. `CellDelta` is intentionally separate from `CellPoint`: a point is a location in rendered geometry, while wheel and drag displacement is signed and may be negative. `MouseButton`, `MouseModifiers`, and `MouseHandlerResult` need no brand prefix because they neither collide with platform globals nor expose renderer internals. SGR's modifier bit historically named Meta maps to `alt`; unlike Kitty keyboard input, SGR does not report independent Alt, Meta, Super, or Hyper mouse modifiers.

One keyed hook is preferable to a handler bag because independent features can attach one event without replacing each other, the event type determines its payload exactly, and reporting demand is static. It is preferable to separate `useClick()` and `useWheel()` hooks because those events share one stateless target route and a later evidence-backed event would not require another public composable. Drag is the exception because down, capture, movement, release, and cancellation form one lifecycle with one rendered-host owner. The former `useDraggable()` additionally owned application x/y state, which the renderer should not assume.

`ElementTarget` is the existing F5 normal Vue component-ref type. The functions return no renderer node, target handle, imperative capture control, or duplicate geometry state. `isActive` defaults to true and follows the same reactive option pattern as `useInput()`; false creates no demand and does not fail on Inline. Each `useMouseDrag()` call returns only the state of that registration in the current gesture, not position or layout state. A reactive target getter may still return `null` to detach from the current host.

F6 does not add `useMouseAvailability()`. No representative journey needs to branch on a third combined mouse-capability object. `useRenderSession()` already reports whether the application has an effective visual Fullscreen hit-test surface, and `useInputAvailability()` reports whether managed terminal input can be acquired. A live visible target must fail exactly when managed input is unavailable or local mouse-mode acquisition cannot complete; expected document, transcript, and final-output fallbacks remain inert as specified below. F6 supports the [xterm-compatible SGR mouse profile](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html) without adding a protocol handshake: a live terminal that accepts the control bytes but silently sends no SGR reports is indistinguishable from a user who generates no mouse input. A query can be added later only if an optional-mouse journey and a truthful cross-terminal detection mechanism justify it.

## Target selection and propagation

Click and wheel target only behavior explicitly registered for that kind. Passive descendants and registrations for the other kind do not change the target. For example, a `Text` inside a click-registered `Box` does not become a click target, and a wheel-only child does not intercept a click route.

For each wheel fact or synthesized click, the controller:

1. reads the last hit generation whose corresponding terminal frame write succeeded;
2. finds the topmost visible matching registration at the surface cell, using accepted paint order and exact F5 fragments;
3. freezes that target, the matching registered ancestor path, handler identities, and coordinate generation before invoking application code;
4. runs handlers captured on one current target in registration order until one throws or returns an invalid result;
5. proceeds to the next registered ancestor only if every handler at the current target returned `"continue"`.

A wheel uses the path and geometry captured when that fact starts. A synthesized click uses the registration path captured by its down candidate and the successfully displayed geometry selected by its up fact; this prevents a later registration from inheriting the gesture while keeping release coordinates truthful.

`"continue"` has the same `none + continue` meaning as F3's shorthand; `"consume"` has the same `performed + stop` meaning for this route. `"consume"` stops before the next ancestor after all handlers on the current target have run. It does not undo terminal mouse capture, prevent terminal-native selection per event, invoke focus, scroll a component, or control an external PTY owner. Those are independent effects. Click and wheel handlers must return synchronously; `undefined`, a Promise, or another value is a programming error. A throw or invalid result fails this application's mouse dispatch closed immediately: no later handler on the same receiver and no ancestor runs, the existing app error path receives the error, and other applications already captured by the shared physical ingress remain eligible for the fact. Controller state and terminal ownership still reconcile in `finally`. F6 deliberately exposes only these two truthful outcomes rather than accepting F3's complete default/external decision when this route has neither a framework default nor an external pointer receiver.

The public event is a frozen per-receiver projection of one shared immutable fact. It exposes the useful distinction through `delivery`, `surface`, and receiver-local `local`; it deliberately exposes neither `target` nor `currentTarget` object identity. The selected target is the deepest matching registration, and the current target is the ref passed to the hook whose handler is running. Publishing renderer nodes, mutable DOM-like target wrappers, or component proxies would add identity without enabling composition with F2, F4, or F5.

Surface and local coordinates are zero-based terminal cells from one accepted paint generation. A bubbling receiver gets its own exact local mapping rather than coordinates rebased from a clipped bounding rectangle. During drag capture, `surface` remains defined outside the owner and `local` becomes `null` only where F5 has no exact element-local mapping; movement remains usable.

Synchronous removal, retargeting, or registration changes inside one handler do not redirect the same event to a new target. The old lease may finish the already-frozen current dispatch, but no later physical fact or gesture step can reach a removed host, and a replacement never inherits its click or capture state.

## Click and drag state machines

A click is synthesized only when a supported button goes down on one live click target and the matching button release hit-tests to the same still-live rendered host without a drag having started. Left, middle, and right buttons all use this one terminal `click` event; F6 does not invent browser `auxclick` or `contextmenu` events. Down freezes the selected rendered-host identity plus every active matching target and ancestor registration lease. Up may deliver only to surviving captured leases; an individually removed or deactivated lease is skipped, a new or replacement registration cannot inherit the pending click, and losing every captured target-level lease cancels it. The surviving leases resolve their current handler values once at release before delivery. The release fact and current accepted geometry supply the click coordinates and modifiers. Losing the selected host through removal, retargeting, hiding, clipping, or failed reacquisition clears the candidate, as do suspension and teardown. Multi-click counts are not part of F6; they can be added when a journey needs them.

`useMouseDrag()` makes the deepest visible rendered host with at least one active drag registration under a left-button-down cell the pending capture owner. Down freezes the active registration leases on that host as one cohort; a registration added or replaced later waits for the next gesture. The first button-motion report sets each surviving cohort member's `isDragging` true, emits `phase: "start"`, clears every click candidate for that left-button gesture, and begins capture; later reports emit `"move"`. Release sets each surviving member's state false, emits `"end"`, and releases capture. Once started, the owner host continues to receive movement and release outside its bounds. Drag is exclusive rather than bubbled: every captured registration on the selected host runs, while an ancestor host becomes the owner only when no deeper visible drag host matches the down cell. Wheel facts remain independently hit-tested and do not join capture.

A started gesture sets `isDragging` false and emits `"cancel"` instead of `"end"`. Ordinary removal, reactive deactivation, scope or component disposal, or ref retargeting cancels that registration with reason `"deactivated"` before detaching its lease. Loss, replacement, or exact-geometry loss of the owner rendered host and HMR invalidation of that host cancel every still-live cohort member with reason `"target-lost"`; suspension uses `"suspended"`. One cohort member may leave without ending the gesture for the others; capture ends when the owner host is lost or the captured cohort becomes empty. A cancel uses the last delivered surface point and modifiers; `local` is recomputed when exact geometry remains and is `null` after geometry loss. Resume never continues an old gesture. Ordinary whole-app unmount or exit, fatal teardown, and non-returning process or signal teardown set every public state false and restore ownership without invoking new application callbacks. An unstarted pending capture can be discarded silently because no public drag state has begun.

A throwing drag handler fails the current application dispatch closed. No later cohort handler runs for that phase; the controller sets every cohort member's state false, abandons the capture without emitting another application callback, releases or downgrades reporting in `finally`, and reports the error through the existing app path. A later physical fact cannot resume that gesture. The normal end-or-cancel callback guarantee therefore applies only while application handlers return normally; teardown and handler failure still guarantee state and terminal cleanup.

F6 supports one button gesture at a time. A second button-down before the pending click candidate's matching release cancels that candidate; a started left drag retains ownership until its matching release or cancellation and ignores other button phases. Simultaneous multi-button chord state is deferred because SGR does not report it reliably enough for the selected journeys.

Handler values are snapshotted separately for each emitted phase, so a surviving registration follows a live handler ref without letting a new registration join the gesture. Multiple complete-lifecycle `useMouseDrag()` registrations may compose on one rendered host; the host, not one hook call, owns physical capture.

Focus and scrolling are explicit application composition, not hidden defaults:

```ts
useMouseEvent(composerRef, "click", () => (composerFocus.focus() ? "consume" : "continue"));

useMouseEvent(transcriptRef, "wheel", (event) => {
  transcript.value?.scrollByLines(event.delta.y);
  return "consume";
});

useMouseDrag(dividerRef, (event) => {
  if (event.phase === "start" || event.phase === "move") {
    ratio.value += event.movement.x;
  }
});
```

The focus call uses the existing F4 handle and a trapped approval scope keeps its existing isolation. `ScrollBox` remains input-free and imperative. F7 now makes each existing operation return a boolean top-line-change result, so a nested wheel owner returns `"consume"` after movement and `"continue"` at an edge without duplicating component state.

## Reporting demand and frame transactions

An attached hook does not capture the terminal merely because its setup scope exists. It contributes demand only after its rendered host has at least one visible exact fragment in an accepted Fullscreen frame.

- `click` and `wheel` require button reporting (`1000 + 1006`);
- `useMouseDrag()` requires button-motion reporting (`1002 + 1006`);
- bare hover would require all-motion reporting (`1003 + 1006`) and remains parked;
- simultaneous targets select the strongest live level;
- removal of the last drag target downgrades to `1000` if button-level targets remain;
- hidden, fully clipped, detached, inactive, screen-reader, Inline, and string-render targets contribute no demand; a visible effective-Fullscreen target that cannot acquire managed input or whose local mode write fails produces the exact error specified below;
- the final target release disables every mouse mode and raw-input lease owned by this controller.

Pointer hit generations follow the F5 frame transaction. Paint prepares exact registered fragments and paint order, a successful terminal write accepts the generation, and a failed write discards it while preserving the prior displayed map. Mouse mode acquisition, downgrade, suspension, continuation, HMR, ordinary teardown, signal teardown, and acquisition rollback participate in the existing exact-ownership lifecycle; one failure cannot skip another resource's release.

## Host behavior

| Host or surface                                                                                                       | Active resolved target behavior                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outside a vue-tui application setup context                                                                           | Throw the exact missing-runtime-context error before reading the target or `isActive`; an inactive option does not make this a standalone utility.               |
| Live visual Fullscreen TTY with controllable stdin and xterm-compatible SGR mouse                                     | Attach after a successful visible paint, acquire the minimum level, and deliver targeted events.                                                                 |
| Effective visual Inline live or deterministic app with an active hook                                                 | Fail immediately before target resolution or a mouse control sequence; `isActive: false` stays inert.                                                            |
| Effective visual Fullscreen with unavailable managed input or a local acquisition/write failure                       | A visible active target fails with the exact preflight or acquisition error before publishing a route; partial terminal ownership rolls back.                    |
| Live TTY that silently ignores the requested xterm-compatible mouse mode                                              | No event arrives. F6 performs no speculative handshake and cannot distinguish this terminal behavior from the absence of user mouse input.                       |
| Any requested mode resolving to a screen-reader transcript, final stream, or other non-targetable output presentation | Remain inert and quiet because `useRenderSession()` already reports the expected non-targetable presentation.                                                    |
| String/document render                                                                                                | Remain inert and isolated so a Fullscreen application can still produce a static snapshot.                                                                       |
| Deterministic modeled Fullscreen host                                                                                 | Attach to modeled visible geometry, expose modeled button/button-motion ownership, and accept parsed physical mouse phases through the public test driver below. |
| Hidden, zero-size, fully clipped, detached, or not-yet-painted target                                                 | Remain non-hittable and contribute no terminal reporting demand.                                                                                                 |

The Fullscreen subpath plus an active visible hook expresses the targeted-mouse choice; there is no separate authorization, mount flag, or combined availability query. Mouse reporting still redirects ordinary terminal selection and wheel behavior while active, including on the alternate screen. F6 documents and minimizes this interval. F8 owns application selection, copy commands, clipboard capability, and fallback.

## Deterministic testing surface

F6 extends the root `@vue-tui/testing` entry point rather than adding a testing subpath. The public `RenderResult` gains one `mouse` driver:

```ts
import type { CellPoint } from "@vue-tui/runtime";
import type { MouseButton } from "@vue-tui/runtime/fullscreen";

export type TestMouseReportingLevel = "none" | "button" | "button-motion";

export interface TestMouseReportingState {
  /** `button` models 1000 + 1006; `button-motion` models 1002 + 1006. */
  readonly current: TestMouseReportingLevel;
  readonly history: readonly TestMouseReportingLevel[];
}

export interface TestMouseModifiers {
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
}

export interface TestMouseButtonOptions extends TestMouseModifiers {
  /** @default "left" */
  readonly button?: MouseButton;
}

export interface TestMouse {
  readonly reporting: TestMouseReportingState;
  down(point: CellPoint, options?: TestMouseButtonOptions): Promise<void>;
  /** Emit one left-button motion fact after an unmatched left-button down. */
  move(point: CellPoint, modifiers?: TestMouseModifiers): Promise<void>;
  up(point: CellPoint, options?: TestMouseButtonOptions): Promise<void>;
  wheel(
    point: CellPoint,
    direction: "up" | "down" | "left" | "right",
    modifiers?: TestMouseModifiers,
  ): Promise<void>;
}

export interface RenderResult {
  readonly mouse: TestMouse;
}
```

The driver vocabulary follows the established [Playwright mouse device](https://playwright.dev/docs/api/class-mouse) sequence of `down`, `move`, `up`, and `wheel`, while accepting vue-tui's existing cell point instead of browser x/y parameters. It deliberately omits Playwright's convenience `click`: application tests should prove vue-tui's own down/up synthesis rather than ask the test host to manufacture the final event.

The driver validates zero-based safe-integer points inside the current modeled terminal surface, defaults absent modifier flags to false, and waits for the same application and emulator flush as `stdin.write()`. `reporting.history` starts empty and records each committed level change, including `"none"` when the final owner releases. `down`, `up`, and `wheel` require current button or button-motion reporting; `move` additionally requires button-motion reporting and an unmatched left-button down. Calls reject after disposal or when the modeled terminal could not have emitted that fact. A miss inside the terminal is still a valid physical fact and simply finds no target.

Each method injects one parser-normalized physical mouse fact at the shared application ingress. It deliberately does not inject `click`, drag phases, a target, or a receiver-local coordinate, so production click synthesis, successful-frame hit testing, propagation, capture, cancellation, and demand all run unchanged. Focused parser tests and real PTYs still supply actual SGR bytes; the semantic driver is not evidence that byte framing or a real terminal profile works.

## Rejected public alternatives

- **Common listener props or interactive component variants:** they make mode-dependent behavior look universally available and multiply visual component combinations. The selected ref composables keep `Box`, `Text`, and `ScrollBox` passive.
- **`Pointer` terminology:** browser pointer APIs promise identity, device type, pressure, contact geometry, tilt, and multi-device capture that SGR mouse reports do not contain. Pinned terminal peers consistently use `mouse`.
- **An aggregate `useMouse(target, handlers)` bag:** independent features would replace or coordinate one shared object, handler inference would be weaker, and changing one field would obscure exact reporting demand. VueUse supplies the stronger keyed-listener precedent.
- **One composable per stateless event:** `useClick()` and `useWheel()` would proliferate names for one route without adding ownership. A keyed event map keeps exact payload inference and leaves evidence-backed additions possible.
- **Separate drag-phase registrations or one registration per host:** capture is one lifecycle, so phase subscriptions can disagree about ownership; banning a second full-lifecycle hook would prevent ordinary Vue composition. One host-owned gesture with a frozen registration cohort preserves both facts.
- **Public `mousedown` and `mouseup`:** current journeys need click and captured drag, whose private down/up state machines already own the wire reports. Publishing raw phases would add pressed-state, suppression, routing, and demand rules without a consumer.
- **Mutable DOM-like events, `target`/`currentTarget` identities, or F3's complete route result:** F6 has no renderer-node authoring model, default recipient, or external pointer receiver. `delivery`, the bound ref, exact coordinates, and the two truthful propagation results cover the selected journeys without fake methods or no-op axes.
- **A combined mouse-availability query:** no current journey branches on terminal mouse support alone, and F6 has no truthful cross-terminal handshake that could distinguish a silently ignored mode from no user activity. Existing render-session and input-availability facts cover planned presentation choices; known input and local acquisition failures remain exact.
- **Blanket Fullscreen capture or a mount-level mouse switch:** a pointer-free monitor must emit no mouse mode. Visible live behavior selects the minimum level and its removal restores terminal-native behavior.
- **Retaining the former terminal-wide stream:** the v1 hook exposed only vertical wheel with one-based coordinates. The real pane-forwarding scenario needs target-bound protocol translation, not that incomplete global surface.

## Implemented API dispositions

- `onMousedown`, `onMouseup`, `onClick`, and `onWheel` are removed from common `Box` and `Text` props. Recognizable listener names are rejected types and throw for JavaScript/`any` values rather than using Vue fallthrough.
- `ScrollBox` rejects the same listener names and prevents them from falling through to its internal viewport `Box`.
- Root `useDraggable()` and its option/result types are removed. `useMouseDrag()` supplies a captured gesture; the application owns position, clamping, axis, and layout state.
- Root `useMouseInput()` and its vertical-wheel, one-based event type are removed without replacement. No representative F6 journey needs a terminal-wide stream, and Herdr-like terminal-pane forwarding requires a different target-bound, pane-local, complete button/motion/four-direction-wheel adapter.
- The v1 root `MouseTarget`, clipped rectangle, handler-prop, mutable event, and wheel types are removed. Only the selected Fullscreen types are published from the new subpath.
- `useStdin().stdin` remains the vouched actual-stream escape hatch. Direct bytes have no framework event semantics, do not safely compose with managed routing, and do not acquire a terminal mouse mode.
- Only `TestMouseReportingLevel`, `TestMouseReportingState`, `TestMouseModifiers`, `TestMouseButtonOptions`, and `TestMouse` are added to the `@vue-tui/testing` root, plus `RenderResult.mouse`; the runtime's internal injection seam remains private.

The project is experimental, so none of these removals receives an alias, deprecation period, warning shim, or compatibility precedence rule.

## Validation journeys and closure gates

F6 closure must prove three vertical journeys in addition to focused mechanics.

### Fullscreen coding-agent journey

- A passive dashboard baseline emits no mouse mode.
- Composer and approval clicks call the same F4 focus handles; the approval's trapped scope still isolates input and restoration.
- A transcript wheel handler drives the existing input-free `ScrollBox`.
- Passive Text, clipping, overlapping paint, coordinated Static output or Static nodes, removal, and ref retargeting cannot create stale or accidental targets.
- Click and wheel alone use `1000`, and removing the last target restores the terminal.

### Fullscreen workbench journey

- A registered row and nested action prove target versus bubble delivery and `"consume"` behavior.
- Sibling list/detail wheels route only through the hit region.
- Two independently composed handlers on one divider prove one rendered-host capture cohort; the drag continues outside its bounds, updates application-owned state, suppresses click, and each live member receives end or cancel exactly once.
- Removing or retargeting the divider during capture cancels the old owner; the replacement requires a new down.
- Removing the final drag owner downgrades `1002` to `1000` while click/wheel remain, then to none.

### Mode, host, lifecycle, and selection boundary

- Effective visual Inline rejects an active hook immediately at type-independent runtime without waiting for a target or writing a mouse sequence; inactive registration remains inert.
- Common-component listener misuse fails in SFC, TSX, ordinary TypeScript, and JavaScript/`any`.
- Expected final-stream, string, and screen-reader presentations remain inert and quiet; an effective visual Fullscreen target with unavailable managed input or a local mode-acquisition failure fails exactly; deterministic Fullscreen exposes the selected parsed-physical-fact driver and reporting state; the supported live profile and its silent-terminal limit are explicit.
- Failed writes preserve the old hit generation; split input and re-entrant removal use fact-start identities.
- HMR, suspension, continuation, normal exit, fatal exit, signals, acquisition failure, and cleanup failure restore exact raw, SGR, cursor, screen, listener, ref, and termios ownership.
- The direct native macOS Terminal observation records that native drag-selection is suppressed and wheel input reaches the application while reporting is active, then native selection and Terminal scrollback return after the final target disappears and after shell restoration; the PTY evidence separately proves control-sequence and termios balance.

Closure required exact root and `/fullscreen` export guards, declaration inspection, Vue 3.4 SFC/TSX consumption under TypeScript 6 with `skipLibCheck: false`, focused unit/integration tests, relevant real PTYs, the repository visual-review loop, `vp run ready`, fresh `CI=true vp run ci`, updated PCR/vault trackers, independent review, and the direct GUI observation above. All gates pass. The GUI run used the built runtime and components and launched the fixture from `packages/runtime-tests/integration/pty/fixtures`, where the workspace-local `tsx` loader resolves. Screenshots were inspected directly for each transition rather than inferring visible behavior from mouse control sequences. F6 did not itself select the later F7 scroll contract; F7 now closes that dependency separately. F8 still owns selection and copy.

## Deliberately deferred

- targeted Inline origin discovery and invalidation;
- public raw `mousedown` and `mouseup` delivery until a pressed-state or hold-interaction journey needs them;
- hover, move-without-button, enter, and leave (`1003`);
- multi-click count and double-click policy;
- a terminal-wide parsed mouse stream or embedded-PTY mouse adapter;
- application selection, copy, OSC 52, and terminal fallback until F8.
