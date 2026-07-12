# Logical focus and focus scopes

> **Status:** accepted, unstamped F4 target contract. The maintainer accepted all recommendations on 2026-07-13. The source, consumer, journey, and pinned-peer audit is complete, and a private API-neutral policy experiment makes the selected behavior executable. Public implementation is now the active work; this acceptance does not claim that the current runtime already has these APIs or add a VOUCHED stamp.

## Product problem

A terminal application needs one answer to “which logical control owns local input now?” The current answer is a flat string-ID registry created during component setup, while local input remains a separate application-global subscription. That makes every application manually connect visible state, focus state, and `useInput({ isActive })`. Issue [#250](https://github.com/vuejs-ai/vue-tui/issues/250) demonstrates the result: two `v-if` branches in one component keep both setup-time input hooks alive, so the author maintains an increasingly fragile set of booleans. The reported workaround wraps each input hook in a child component solely to borrow that child's mount lifetime.

F4 should let the runtime own one effective focus target, derive its route from the current rendered and logical scope trees, and restore or advance focus without asking each target to rebuild those mechanics. Application-global commands remain global. Collection active items, text insertion points, selections, terminal carets, and pointer targets remain separate state even when a component coordinates them.

## Audited baseline

The current `useFocus()` registers `{ id, isActive }` during setup, appends the registration to one application array, and independently acquires raw input. `useFocusManager()` exposes the same array through string lookup, global enable/disable, registration-order movement, and `activeId`. It has no rendered target, nested scope, trap, restoration, or local-input attachment.

Observable consequences are now reproduced rather than inferred:

- changing rendered order from `a,b,c` to `a,c,b` leaves Tab order at the old setup order;
- a focused target whose host disappears while its component stays mounted, or whose target/ancestor becomes `display:none`, stays focused;
- programmatic `focus(id)` can focus an `isActive:false` item;
- duplicate IDs are not identity: several components report focused together, and removing one ID removes every matching registry entry;
- hidden, disabled, or removed focus clears to `null` rather than advancing or restoring;
- focused key, text, and paste input still requires a separate global `useInput` plus manual `isFocused` wiring;
- each active registration owns a legacy raw lease even though F3's selected topology is the correct semantic-input owner.

The correctly configured current focus suite passes 48 tests. Those tests prove the shipped Ink-shaped baseline; they are not reasons to preserve it under the experimental API policy. The first-party examples and pinned `mo` and `machud` contain no production use of `useFocus` or `useFocusManager`, so replacing the exact surface does not conflict with a known real consumer.

## Evidence from the active scenarios

### Coding-agent workflow

The first-party coding-agent example uses one application-global handler and switches manually among `idle`, `streaming`, and `approving`. The approval `v-if` is not an input owner, the composer is not a focus target, and the painted block is not a terminal caret. The target journey is:

```text
composer focused
  -> submit: streaming has no local owner but remembers the composer
  -> approval scope opens: approval becomes the effective owner
  -> approve or cancel: the closing fact stays in the captured approval route
  -> approval closes: the outer scope restores its remembered owner when eligible
```

An unknown modal input must not reach the composer or an external terminal owner. Opening input must not reach the newly mounted approval owner, and closing input must not reach the restored composer. Application-global interruption still runs first.

### Finder

Pinned `mo` keeps query editing, enabled-item traversal, active item, scrolling, acceptance, and cancellation in one global handler. Its `cursorIndex` is a collection active item, not logical focus. F4 should let a query editor or nested editor own local input while leaving item identity, filtering, selection, and ensure-visible scrolling in their proper later/component layers.

### Independent regions and terminal workspace

Two active-region scopes demonstrate that the application still has one effective leaf owner while each region remembers its most recent valid descendant. Switching A → B → A restores A's remembered target without spreading every target into one setup-order list. A focused terminal-pane target may own an explicit external receiver; that receiver is absent whenever its target is not effective or a modal scope has replaced the route. Herdr supplies the same pressure at application scale: workspace, tab, and pane remember nested focus, while modal and navigator states prevent input from reaching the pane.

### Applications without focus

Pinned `machud` uses only application-global shortcuts. F4 must not require a fake focus target, and a non-interactive or static application without a focus registration must remain valid.

## Peer evidence

The pinned sources and executable checks are recorded in [terminal-ui-prior-art.md](./terminal-ui-prior-art.md#focus-and-scope-observations). The load-bearing conclusions are:

- Ink is the only inspected peer whose canonical focus identity is a flat string-ID registration list; it has no scopes, restoration, or target-bound input;
- OpenTUI, Textual, prompt_toolkit, and pi-tui use actual object identity for the effective target;
- Textual and prompt_toolkit rederive eligibility and traversal from the current rendered or visible tree rather than component setup order;
- Textual's screen stack, prompt_toolkit's focus history, and pi-tui's overlay stack centralize restoration in the runtime;
- a traversal-only trap is insufficient for a modal: Textual needs an active Screen boundary, prompt_toolkit cuts traversal and bindings at modal ancestry, and pi-tui's capturing overlays own a separate input boundary;
- no peer consensus chooses visual versus rendered-tree order, ordinary-removal fallback, root initial focus, or programmatic escape from a modal. Those remain vue-tui journey decisions.

The durable fixed-snapshot checks were: Ink `40b3a757` with `npx ava test/focus.tsx` (27 passing); OpenTUI `a0b90640` with its renderer-focus, renderable, and keymap layer/host suites under `bun test` (114 passing); Textual `1d99508b` with `tests/test_focus.py`, widget removal, and app focus/blur under `pytest` (26 passing); prompt_toolkit `236bfb7c` with `tests/test_layout.py` (2 passing); and pi-tui `4c186103` with `test/overlay-non-capturing.test.ts` under Node's test runner (44 passing). Additional mechanism statements above are source observations at the pinned links in the prior-art record; temporary custom probes were useful during research but are not claimed as durable project evidence.

## Accepted product contract

### One owner and opaque target identity

One focus controller per mounted application owns the effective target, active boundary, per-scope memory, traversal, and restoration. A focus target's identity is the opaque handle returned by its registration, never a global string. An optional application label may be added later for diagnostics, but it cannot become owner identity or traversal lookup.

The registration follows F2 rendered-target lifetime. It attaches to the resolved host below a Vue ref, survives an atomic retarget of the same logical handle, follows keyed replacement, becomes unavailable when the host is detached, and cannot remain selected after target cleanup. Two focus registrations resolving to the same host are a programming error.

### Eligibility and traversal

A target is effective only while all of these are true:

```text
rendered target exists
and neither target nor rendered ancestor has display:none
and the target is not disabled
and every containing logical focus scope is active
and the target lies inside the current trapped boundary
```

Clipping, zero geometry, collection selection, and off-viewport state do not silently change logical focus in F4; F5 and F7 own the geometry and scrolling needed to coordinate them. `v-if` removal and `v-show`/`display:none` are covered now.

Sequential traversal uses the current rendered-host preorder, not setup order or visual coordinates. This gives keyed reordering an immediate deterministic effect without pulling F5 geometry into F4. `tabIndex: 0` participates in Tab traversal; `tabIndex: -1` is programmatic-only. Tab and Shift+Tab wrap within the effective boundary. From no focus, Tab selects the first sequential target and Shift+Tab the last.

The root scope does not focus its first target implicitly. An explicit `autoFocus`, programmatic request, or traversal establishes initial root focus. When a trapped scope activates, it chooses its remembered eligible target, then its first explicit `autoFocus` target, then its first sequential target, because an active modal must remain keyboard-operable. Multiple eligible `autoFocus` requests choose the first rendered target and do not steal an already effective focus.

Programmatic focus succeeds only for an eligible target inside the current hard boundary and reports success as a boolean. It does not bypass disabled or hidden state and does not queue an outside-modal request for later. A handle retained after target or scope disposal is inert: `focus()` and `blur()` return `false` rather than reviving or throwing for the ended registration.

### Unavailability, removal, and restoration

The controller distinguishes a temporary unavailable target from permanent removal:

- when a hidden, disabled, or detached focused target has another sequential target after it, focus advances there; otherwise it tries the previous target;
- when no fallback exists, effective focus becomes `null` and remembers that temporary target; it restores only if the target becomes eligible while no later focus request has won;
- an ordinary removed target is forgotten permanently and falls back to the nearest still-rendered sequential successor from the prior authoritative preorder, then the nearest still-rendered predecessor, then `null`. A newly inserted handle does not inherit the removed handle's focus merely because it occupies the same array position;
- an atomic F2 retarget of one logical handle is not an unavailable interval and retains focus;
- inactive scopes remember their latest valid descendant. Reactivating a region restores that descendant, then an explicit autofocus target, without flattening sibling scopes; an application-side region switch made while a modal owns the effective route is retained and becomes the restoration branch after the modal closes;
- a trapped scope is a hard effective-focus and input boundary. Its activation preserves both outer scope memory and whether an outer owner actually existed. Deactivation or removal restores the containing scope's remembered eligible target; if that exact outer owner was removed, fallback uses its prior-order successor then predecessor inside the parent boundary; if the trap opened from no outer focus and no later background activation won, it closes back to `null` rather than inventing root focus;
- nested and sibling trapped scopes use activation order as a stack. The most recently activated usable trap is effective, and closing restores one level at a time.

These rules are implemented in the private [focus policy experiment](../../packages/runtime/src/focus/focus-policy.ts) and its [28 API-neutral journeys](../../packages/runtime/src/focus/focus-policy.test.ts). The model covers rendered reorder, explicit root initialization, hidden/disabled rejection, temporary restoration and explicit cancellation, prior-order removal fallback across detach-then-dispose batches, non-transfer to replacement identity, target-specific blur, one-shot autofocus, atomic retarget, independent and reactivated region memory, nested and sibling modal restoration, empty-parent and atomic-trap-reactivation restoration, stale restoration targets, boundary/ancestor non-duplication, read-only and imperative-operation batch publication, targetless modal handling, finder/editor separation, identical mode-independent policy traces, and fact-start opening and closing boundaries. This pure model proves semantic policy only; real Inline and Fullscreen hosts, Vue rendered ancestry, input-resource acquisition, package types, and terminal cleanup remain implementation gates.

### Local input and external fallthrough

F4 consumes F3; it does not create another parser, event type, or route result. The selected route for each fact is:

```text
all application-global useInput handlers
  -> handlers explicitly attached to the current active trapped boundary
  -> all handlers attached to the focused target
  -> handlers attached to logical scopes, nearest to farthest, stopping at the trap
  -> focused/component defaults
  -> framework defaults
  -> the focused target's optional external receiver
```

`useFocusedInput(target, handler)` contributes the focused-owner node only while that exact target is effective. `useFocusScopeInput(scope, handler)` contributes exactly one node. When that scope is the current trapped boundary, its handlers form the active-boundary layer before the focused owner and still run when the boundary has no eligible target; this lets a targetless modal close on Escape without exposing the background route. The same scope is then excluded from the later ancestor list. Otherwise, while the focused owner is a descendant, the scope contributes an ancestor node after the focused owner; ancestors run nearest to farthest and stop at the trap. The route position follows the scope's semantic role, but one registration never runs twice for one fact.

Handlers attached to the same target or scope form one all-run node layer and merge results monotonically, so composition does not turn registration time into hidden priority. `routing:"stop"` prevents later route nodes, not peers already captured at the same node. F3's fact-start snapshot keeps the complete route stable: if a handler opens or closes a modal or removes its target, the new/restored/replacement target waits for the next framed fact.

An external receiver belongs to one focus target and is considered only while that exact target is effective, every semantic layer continued, defaults allow it, and no result blocked it. It receives F3's normalized source, not original bytes. A modal target without that attachment cannot reveal a background PTY. Exactly one `useExternalInput` registration may own a target at a time; a second registration fails before replacing or broadcasting to the existing receiver. Direct `useStdin().stdin` remains the vouched raw escape hatch outside these guarantees.

Tab remains a preventable framework delayed default. A focused editor can prevent it for indentation or allow it for traversal. Ctrl+C remains the F3 preventable delayed default. The current automatic bare-Escape blur is removed: Escape is an ordinary normalized key unless a target, scope, application-global handler, or later component default gives it meaning. A generic focus runtime cannot know whether Escape clears a query, closes a modal, cancels a workflow, leaves an editor mode, reaches an external terminal, or should blur.

### Environment behavior

Logical focus semantics do not vary between Inline and Fullscreen. The same target identity, scope stack, route, traversal, and restoration fixtures must pass with identical semantic traces. Rendering mode can change overlay presentation, not ownership.

- F4 creates managed semantic-input demand only when it can perform work: the current boundary has an eligible `tabIndex:0` target for Tab traversal, the active boundary has a scope handler, or the current focused path has a target handler, scope handler, selected owner/component default, or external receiver. A targetless modal scope handler therefore owns input; an unfocused `tabIndex:-1` target with no attachment or component default does not. Application/framework delayed defaults do not create demand alone; they join a route that already has F3 or F4 demand. Existing application-global F3 demand remains independent.
- If that demand becomes live while stdin is not a controllable TTY, the transition fails before listener, raw/ref, paste, Kitty, route publication, or other terminal mutation, using the existing `useInputAvailability()` fact for preflight. Attachment or acquisition failure rolls back the new registration, focus generation, and F3 lease together, preserving the last accepted route.
- A focus registration whose target is not rendered or whose containing scope is inactive creates no target demand. A trapped scope can still create scope-handler demand with no target.
- Screen-reader presentation uses the same logical focus and routing when stdin is available; visual hit testing is unrelated.
- Final-output or non-TTY stdout can still use focus when the independent stdin is a controllable TTY.
- Public string rendering keeps focus, scope input, and external attachment inert: focus stays false, operations report failure, and no application callback runs.
- A deterministic host models the corresponding live stdin capability rather than manufacturing focus input.
- HMR template updates retain the logical handle while F2 follows the target. Script replacement ends the old handle and applies the same removal/restoration rules. Full reload disposes the controller and F3 route before the replacement app acquires input.
- Suspension keeps logical focus and scope memory, releases physical input through F3, repaints the resolved surface on continuation, then reacquires and republishes the same current route.

The focus controller publishes one fully reconciled route generation after each authoritative renderer commit. The F3 bridge now allows that generation to remain logically selected without physical input demand; F4 requests demand only for the effective work listed above, while independently driven facts still retain one fact-start focus topology. Reading the route or any public readonly ref has no side effects and cannot reorder a pending scope activation. Target and scope disposal invalidates their route before Vue cleanup can expose a later fact to a stale recipient.

The private focus policy now exposes an owner-bound checkpoint only to its app controller. Before a mutation that may acquire or replace an F3 generation, the controller can retain the last accepted focus, boundary, rendered order, memories, autofocus consumption, and fallback state. If lease validation or physical input acquisition fails, restoring that checkpoint removes transient handles and reinstates the exact previous policy generation before any public ref or route is published. Checkpoints from another application are rejected.

The private app-owned controller is executable and owned by every live or deterministic app plus every string-render document. Live and deterministic hosts join it to the real F3 runtime and pass it to F2 as the transaction owner; string rendering uses the same service in inert mode. It owns opaque target and scope records, one atomic public-state snapshot, observed versus accepted F2 host attachments, rendered preorder and inherited `display:none`, immutable same-node handler generations, exact boundary/owner/ancestor/external topology, generation-bound Tab, and exact F4 demand. A complete F2 reconcile validates duplicate hosts only after atomic swaps settle. Subtree cleanup immediately makes removed policy targets ineligible and ends the old F3 generation, while public refs wait for the authoritative rendered commit so a keyed replacement of the same handle never emits false focus. Reversible registration and reactive failures restore policy, records, refs, route, and physical demand; an actually ended target or scope lifetime instead remains disposed and fails closed. A controller with no target or scope lifetime owns no F3 selection, so applications without focus and private F3 topology fixtures are not displaced. String-host mode validates handles but never attaches hosts, selects routes, acquires input, or calls application handlers. Twenty-two controller tests plus the 30 policy journeys and real F3/F2 runtimes cover these mechanisms; the public composable cutover, package consumers, and host closure gates remain.

## Accepted public authoring surface

The recommendation uses composable handles rather than listener props, a focusable component variant, a directive, or one option object containing every handler. It keeps common visual components passive, follows Vue template refs, and lets behaviors compose without a component Cartesian product.

```ts
import type { ComponentPublicInstance, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";

declare const focusHandleBrand: unique symbol;
declare const focusScopeHandleBrand: unique symbol;

export interface UseFocusOptions {
  readonly scope?: UseFocusScopeReturn;
  readonly disabled?: MaybeRefOrGetter<boolean>;
  readonly tabIndex?: MaybeRefOrGetter<0 | -1>;
  readonly autoFocus?: MaybeRefOrGetter<boolean>;
}

export interface UseFocusReturn {
  readonly [focusHandleBrand]: true;
  readonly isFocused: Readonly<ShallowRef<boolean>>;
  focus(): boolean;
  blur(): boolean;
}

export function useFocus(
  target: MaybeRefOrGetter<ComponentPublicInstance | null | undefined>,
  options?: UseFocusOptions,
): UseFocusReturn;

export interface UseFocusScopeOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
  readonly trapped?: MaybeRefOrGetter<boolean>;
}

export interface UseFocusScopeReturn {
  readonly [focusScopeHandleBrand]: true;
  readonly containsFocus: Readonly<ShallowRef<boolean>>;
}

export function useFocusScope(options?: UseFocusScopeOptions): UseFocusScopeReturn;

export function useFocusedInput(target: UseFocusReturn, handler: MaybeRef<InputHandler>): void;

export function useFocusScopeInput(
  scope: UseFocusScopeReturn,
  handler: MaybeRef<InputHandler>,
): void;

export interface ExternalInputSource {
  readonly event: TuiInputEvent;
  readonly sequence: string;
  readonly fidelity: "normalized-utf8-sequence";
}

export type ExternalInputHandler = (source: ExternalInputSource) => void;

export function useExternalInput(
  target: UseFocusReturn,
  handler: MaybeRef<ExternalInputHandler>,
): void;

export interface UseFocusManagerReturn {
  readonly focusedTarget: Readonly<ShallowRef<UseFocusReturn | null>>;
  focusNext(): boolean;
  focusPrevious(): boolean;
  blur(): boolean;
}

export function useFocusManager(): UseFocusManagerReturn;
```

`useFocusScope()` provides its scope to descendant component setup through Vue injection. Passing its return through `UseFocusOptions.scope` explicitly covers a target created in the same setup or another deliberate scope assignment. `useFocusManager()` operates on the current effective boundary; direct target handles are the normal programmatic-focus path.

`UseFocusReturn.blur()` affects only that exact target: it returns `true` when it clears the effective target or that target's pending temporary restoration, and `false` when another target is focused or the handle is unavailable. `UseFocusManagerReturn.blur()` clears the current effective target, or its pending temporary restoration when focus is temporarily `null`. Neither operation blurs an unrelated target. A retained disposed target handle reports `isFocused:false`, and its methods return `false`.

`focusNext()` and `focusPrevious()` return `true` when the current boundary has at least one eligible sequential target and traversal successfully selects it. They return `false` when no sequential target is available. The boolean reports successful traversal handling, not movement distance: wrapping a one-target boundary returns `true` even though the same target remains focused. `UseFocusReturn.focus()` follows the same success meaning and returns `true` when its already-focused target is still eligible.

`containsFocus` is `true` only while the current effective target is a descendant of that scope; remembered focus in an inactive scope does not count. `focusedTarget` is the exact public `UseFocusReturn` for the current effective target, never a component proxy, renderer node, label, or remembered inactive target. Both readonly refs start as `false`/`null` and update atomically after focus reconciliation.

Defaults are `isActive:true`, `trapped:false`, `disabled:false`, `tabIndex:0`, and `autoFocus:false`. Reactive `isActive`, `trapped`, `disabled`, and `tabIndex` changes reconcile as one accepted state transition. `autoFocus` is a one-shot request: false-to-true creates a new request, an ineligible target retains it until its first eligible reconciliation, and an eligible request is consumed without stealing an already effective target. Holding `true`, an unrelated reconciliation, or an explicit blur does not recreate an already consumed request.

Recognizable invalid JavaScript/`any` option values fail synchronously at setup, or reject the reactive transition while preserving the last accepted generation. Passing a cross-application, unknown, or already disposed target/scope handle to another composable is a programming error and fails before host or terminal acquisition. Two focus handles resolving to one rendered host, or two external receivers resolving to one focus target, fail transactionally and preserve the previous route. After a valid registration later disposes, its handlers and receiver become inert without callbacks.

A representative template composition is:

```vue
<script setup lang="ts">
import { shallowRef, type ComponentPublicInstance } from "vue";
import {
  Box,
  useFocus,
  useFocusedInput,
  useFocusScope,
  useFocusScopeInput,
  type InputHandler,
} from "@vue-tui/runtime";

const approvalScope = useFocusScope({ trapped: true });
const approvalBox = shallowRef<ComponentPublicInstance | null>(null);
const approval = useFocus(approvalBox, {
  scope: approvalScope,
  autoFocus: true,
});

const handleApprovalInput: InputHandler = () => "continue";
const closeTargetlessApproval: InputHandler = () => "consume";
useFocusedInput(approval, handleApprovalInput);
useFocusScopeInput(approvalScope, closeTargetlessApproval);
</script>

<template>
  <Box ref="approvalBox">...</Box>
</template>
```

Reusable overlay components normally call `useFocusScope()` in the overlay component and let child controls inject it; the explicit `scope` option is for same-setup ownership, not a requirement on every target.

## Current API dispositions

vue-tui is experimental, so these are direct target replacements without aliases or deprecations:

| Current surface             | Recommended disposition                             | Reason                                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useFocus()` name           | Retain the name, replace the signature and result   | The name still accurately registers logical focus, but setup lifetime, string identity, no target, global `focus(id)`, writable `ShallowRef`, `isActive`, and per-registration raw ownership are not the target contract. |
| `UseFocusOptions.id`        | Remove                                              | An opaque handle is identity. String lookup created duplicate-owner ambiguity.                                                                                                                                            |
| `UseFocusOptions.isActive`  | Replace with target `disabled` and scope `isActive` | Target eligibility and active-region ownership are different states and should not share one boolean.                                                                                                                     |
| `UseFocusOptions.autoFocus` | Retain the concept with rendered/scope semantics    | It becomes an explicit request evaluated after target attachment and current-boundary selection.                                                                                                                          |
| `useFocusManager()` name    | Retain the name, replace the exact surface          | Keep boundary-level traversal and observation; remove global enable/disable, string `focus(id)`, and `activeId`.                                                                                                          |
| Automatic Escape blur       | Remove                                              | Escape meaning belongs to the current route; the generic default blocks valid cancel, editor, and external-terminal behavior.                                                                                             |
| Registration-order Tab      | Replace                                             | Current rendered preorder and active scope determine traversal.                                                                                                                                                           |
| Per-focus raw lease         | Remove                                              | The atomically selected F3 topology owns semantic input resources.                                                                                                                                                        |

The application-global `useInput`, `TuiInputEvent`, `InputHandler`, `InputHandlerResult`, `useInputAvailability`, and direct stdin contract remain unchanged.

## Alternatives considered

### Combined focus-and-input options

`useFocus(target, { onInput, onExternalInput, ... })` is smaller on paper but makes focus identity, local input, external transport, and future behavior additions one growing option object. Separate handle-based composables preserve one target identity and allow reusable behaviors to compose at one node layer.

### A `Focusable` or `FocusScope` component

A headless wrapper naturally follows Vue mount lifetime and resembles the issue #250 workaround, but it cannot by itself follow a stable component whose rendered host changes, and it forces extra component boundaries to compose behavior. A first-party wrapper can later be built from the accepted composables if repeated templates justify it.

### A directive

A directive has convenient host lifetime but provides a weaker typed return path for programmatic focus, local input, scope handles, and TSX. It may become additive syntax after the composable contract, not the owner model.

### Visual-coordinate traversal

Textual sorts by visual `y,x`, while prompt_toolkit uses rendered-tree preorder. Visual order depends on the semantic geometry F5 has not selected and may change on resize. F4 therefore recommends rendered preorder and leaves geometry-based traversal as a later evidence-backed extension rather than an implicit dependency.

### Traversal-only traps or queued outside focus

Traversal-only trapping cannot protect a modal's local route or external PTY. Allowing or queueing programmatic focus outside the trap adds a second hidden restoration channel and pi-tui-scale state complexity. The recommended hard boundary rejects the request synchronously; the application closes or deactivates the scope before focusing outside it.

## Executable evidence and implementation plan after acceptance

The private policy experiment is deliberately not the production focus controller. It proves the semantic choices without exposing API names. After acceptance, F4 implementation should proceed in dependency order:

1. replace the flat controller with one app-owned focus/scope service and adapt it to F2 target registration;
2. compute rendered preorder and inherited `display:none` eligibility after authoritative commits, with synchronous subtree invalidation before host removal;
3. aggregate target and scope handlers into F3 semantic leases and atomically select boundary, focused owner, ancestors, defaults, and optional external receiver;
4. remove per-focus raw ownership and the generic Escape default, while keeping Tab and Ctrl+C as preventable delayed defaults;
5. publish the accepted composables and named types, then replace current code, docs, examples, API guards, and focus tests directly;
6. migrate the coding-agent example to real composer/approval ownership and add a finder plus independent-region fixture without adding F5–F8 behavior;
7. cover template, TSX, JavaScript/`any`, duplicate-target, unavailable-host, string, deterministic, screen-reader, final-output, HMR, suspension, teardown, and clean tarball consumption;
8. run semantic fixtures under both modes, then a real PTY and visual-controller journey proving route order, modal isolation, removal, restoration, exact terminal cleanup, and identical focus traces.

F4 becomes Done only after implementation, public surface, declarations, package consumption, repository migration, full gates, real-terminal evidence, records, and independent review agree. F5 remains Queued until then.

## Maintainer decision

On 2026-07-13, the maintainer accepted all recommendations together without adding a VOUCHED stamp:

1. opaque ref-bound target handles replace string IDs and follow F2 lifetime;
2. rendered preorder, `tabIndex`, inherited hidden state, disabled state, and the stated next-then-previous fallback define eligibility and traversal;
3. root initial focus is explicit, while a trapped scope uses remembered → autofocus → first eligible;
4. active trapped scopes are hard focus/input/external boundaries and reject programmatic focus outside them;
5. per-scope memory plus temporary-target memory defines restoration, while permanent removal forgets the target;
6. the handle-composition signatures above are the target public API;
7. target/scope handlers reuse F3 all-run node layers, a trapped scope occupies the active-boundary layer exactly once, and exactly one external input receiver attaches only to an effective focus target;
8. Tab and Ctrl+C remain preventable defaults, while automatic Escape blur is removed;
9. active live focus fails fast on unavailable stdin, string focus remains inert, and both rendering modes share identical semantics;
10. current `useFocus` and `useFocusManager` names are retained with clean-slate replacement surfaces and no compatibility layer.

This decision removes the public-shape stop boundary. F4 implementation may proceed under the autonomous plan; F4 remains Active until the public runtime, repository migration, package consumption, real-host evidence, full gates, and independent review pass. No VOUCHED stamp is implied by acceptance or by the private experiment.
