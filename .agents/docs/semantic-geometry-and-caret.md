# Semantic geometry and caret

> **Status:** unstamped completed F5.1 audit and F5.2 public proposal. The current source, repository consumers, host behavior, executable failures, pinned peers, exact Vue signatures, and nested-editor policy prototype were reverified on 2026-07-13. One independent output-safety defect is fixed: a forced-live non-TTY stream no longer receives targeted-caret controls from an active `useCursor()` declaration. The selected proposal uses a normal Vue target, one atomic snapshot with mapped paint fragments, an element-local cell request, an explicit F4 focus handle, and private insertion-slot mappings; implementation and public cutover remain active.

## User capability

A coding-agent composer, finder query, monitor filter, workbench form, or terminal-workspace command field needs the same basic behavior: application state owns the text and insertion point; logical focus selects the active editor; renderer geometry locates what was actually painted; and the terminal caret appears at that editor's visible insertion cell. Moving, clipping, hiding, replacing, resizing, or unmounting the rendered element must update or remove the caret without the component accumulating parent offsets or guessing a physical terminal row.

This is not an editor-state foundation. Logical focus, collection active item, text insertion point, selection, terminal caret, and pointer target remain separate states. An editor component may coordinate them, but the runtime must not infer one from another or create a second owner for any of them.

## First-principles coordinate model

The word “position” currently hides several different coordinate spaces. F5 needs to name and preserve these distinctions internally before it chooses public names.

| Space                            | Meaning                                                                                                                                                                                       | Current producer or consumer                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Element-local point              | A rendered insertion cell relative to one element. It is not a logical string index.                                                                                                          | Missing public path; future editor behavior derives it from its insertion state and rendered text. |
| Parent-relative layout rectangle | The element's unclipped layout box relative to its layout parent.                                                                                                                             | `useBoxMetrics().left/top/width/height`.                                                           |
| Render-root-relative rectangle   | The full element box accumulated from the current dynamic render root. In Fullscreen this root begins at terminal cell `(0,0)`; in Inline its physical terminal row is intentionally unknown. | Paint already accumulates ancestor layout offsets; no general public projection exists.            |
| Visible rectangle                | The intersection of the full render-root rectangle with ancestor overflow clips and the active paint viewport. It may be absent while the full layout rectangle still exists.                 | Fullscreen mouse hit-map only.                                                                     |
| Physical terminal cell           | The cell addressed by terminal control output. Fullscreen maps render-root coordinates directly; Inline maps them through its current managed-region writer.                                  | `useCursor()` currently asks the author to supply this as an output-origin coordinate.             |

The shared cross-mode coordinate is render-root-relative, not a stable physical terminal-screen row. Inline cannot honestly expose the latter because Static output, coordinated output, resize, suspension, and terminal scrollback can move the managed region. It can still place an element-relative caret: the runtime resolves the element and local insertion point inside the current frame, then the existing Inline writer performs the final physical translation. Fullscreen performs that final translation against its fixed `(0,0)` viewport.

Geometry must be a single immutable per-commit snapshot. Publishing width, height, left, top, clipping, and availability as independently updated values lets a synchronous observer combine different layout generations. A zero-size layout, a fully clipped element, a hidden element, an element not laid out yet, and a removed target are different facts; `{0,0,0,0}` cannot represent all of them.

## Current public and internal inventory

| Surface                                                                       | Actual contract today                                                                                                                                         | F5 problem                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`useCursor()`](../../packages/runtime/src/composables/useCursor.ts)          | Each call writes one app-global persistent output-origin `{x,y}` declaration; every scope disposal clears the same global slot.                               | No element, focus, visible-cell, host-availability, or F2 lifetime. Two live owners overwrite and clear each other.                                                                     |
| [`useBoxMetrics()`](../../packages/runtime/src/composables/useBoxMetrics.ts)  | F2-bound reactive Yoga width, height, and parent-relative left/top plus `hasMeasured`. It accepts both Vue component and host refs and resets on target loss. | No render-root or visible rectangle; scalar publication is not atomic; Yoga-only measurement excludes nested virtual Text spans; zero remains overloaded.                               |
| [`measureElement()`](../../packages/runtime/src/composables/useBoxMetrics.ts) | Timing-sensitive imperative `unknown -> {width,height}` Yoga duck read. Detached, pre-layout, invalid, and legitimate zero-size inputs can all return zero.   | It bypasses F2 root/lifetime validation, can read a retained stale `.yoga`, exposes no coordinate or availability semantics, and has no repository product consumer.                    |
| [`useFocus()`](../../packages/runtime/src/composables/useFocus.ts)            | Opaque F2-bound logical target with one runtime focus owner, scopes, restoration, and exact input routing.                                                    | Correctly contains no geometry or caret state. F5 may coordinate with it but must not expand it into an element-layout object.                                                          |
| [`useDraggable()`](../../packages/runtime/src/composables/useDraggable.ts)    | F2-bound Fullscreen behavior whose `x/y` are caller state plus pointer displacement.                                                                          | Its values are not element geometry. Final public disposition remains F6.                                                                                                               |
| [`MouseTarget.rect`](../../packages/runtime/src/mouse/events.ts)              | The latest clipped Fullscreen hit rectangle; event offsets are rebased from that visible origin.                                                              | It is not the full element rectangle, exists only through pointer delivery, and its shared runtime object is mutable through JavaScript or `any`. Final pointer disposition remains F6. |
| [`ScrollBox`](../../packages/components/src/scroll-box/scroll-box.vue)        | Uses two `useBoxMetrics()` registrations only for viewport and content height.                                                                                | It proves reactive geometry has a real common-component consumer; F7 still owns movement and boundary routing.                                                                          |

A top-level `Text` is a Yoga node, while a nested `Text` is a non-Yoga `tui-virtual-text`. Focus and pointer targeting can already resolve the nested span, and the painter can derive its visible cell span, but `useBoxMetrics()` and `measureElement()` cannot measure it. A semantic element contract therefore cannot mean “anything with a Yoga node.” The renderer's post-layout paint traversal, not a public Yoga read, is the authority for accumulated and clipped geometry.

Repository-wide search found no product example using a real terminal caret. The coding-agent example keeps a normal component ref and opaque focus handle, then paints `█` as content. `ScrollBox`, one Vite fixture, and the mouse example are the only non-test geometry or drag consumers. A GitHub code search on 2026-07-13 found no external repository importing vue-tui's `useCursor`, `useBoxMetrics`, or `measureElement`; this is supporting evidence for experimental replacement, not a compatibility promise.

## Executable current-state findings

The audit ran the current runtime rather than inferring terminal behavior from types.

1. A forced-live non-TTY stream with an active `useCursor()` declaration at `{x:2,y:0}` previously received `CSI 1 A`, `CSI 3 G`, show-cursor, and later hide/return bytes. The pre-existing test did not call `useCursor()` and therefore proved only the no-declaration case. [`cursor-non-tty.test.tsx`](../../packages/runtime-tests/integration/lifecycle/cursor-non-tty.test.tsx) now covers active declarations through both standard and incremental writers, and the writer treats terminal caret transport as unavailable on every non-TTY stream.
2. Two mounted `useCursor()` owners initially select the last declaration. Removing the other owner runs an unconditional global `undefined` cleanup and hides the surviving owner's caret. A durable expected-failure specification in [`use-cursor.test.tsx`](../../packages/runtime-tests/integration/composables/use-cursor.test.tsx) tracks this F5 ownership gap without treating the broken result as a contract.
3. A `display:none` subtree paints no cells but a targetless global declaration still shows a caret in both modes. A fully paint-clipped element remains `hasMeasured:true` with its complete Yoga rectangle. Layout availability and visible availability are demonstrably different.
4. A width-four surface containing `abc` plus a wide glyph beginning at the last cell correctly drops that glyph, while the same global cursor coordinate remains visible on the blank last cell. The painter and caret do not share clipping or wide-glyph validity.
5. Shrinking width from ten to five turns a stale declaration at x=8 into x=4 through the writer clamp, even when the content insertion point is elsewhere. Clamp prevents out-of-range ANSI; it does not preserve semantic location.
6. Screen-reader presentation ignores the requested position and leaves the natural transcript cursor visible after the text. This output is reasonable, but the current API cannot report that targeted caret placement was unavailable.
7. Non-finite and fractional coordinates can reach malformed cursor movement because the current setter has no semantic validation. The final contract must make transient missing geometry and invalid author input explicit before a byte is emitted.
8. Existing editor tests and the sibling-repaint PTY fixture use JavaScript `text.length`. CJK, emoji sequences, and combining text prove that a logical insertion index is not a terminal column. The editor/text-layout layer owns logical-to-local-visual conversion; F5 owns local-visual-to-render-root-to-terminal translation.

## Peer evidence

All rows below were rechecked at the pinned commits in [terminal UI prior art](./terminal-ui-prior-art.md#source-snapshots). Passing peer suites prove their own mechanisms, not vue-tui's policy.

| System                                                                                                                                                                      | Verified mechanism                                                                                                                                                                                                                            | Constraint for vue-tui                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Ink 7.0.4](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-box-metrics.ts#L85-L133)                                        | Metrics are parent-relative Yoga values; [`useCursor`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-cursor.ts#L5-L35) accepts output-origin cells. Paint separately accumulates and clips. | This is the disconnected baseline, not the target.                                                                                                                                                                   |
| [OpenTUI](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/renderables/EditBufferRenderable.ts#L956-L987)               | A retained editor converts its visual cursor to screen cells by adding cached renderable origin; the renderer applies its mode-specific surface offset.                                                                                       | Strong evidence for separating editor-local and surface translation. A pinned probe showed ancestor clipping or hiding can still leave its hardware cursor visible, so its caret visibility rule must not be copied. |
| [Textual](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/src/textual/map_geometry.py#L8-L34)                                           | Geometry stores full screen region, inherited clip, virtual region, and visible intersection separately. Input and TextArea convert logical cursor through cell width, scroll, gutter, and screen origin.                                     | Best rectangle precedent. A pinned clipped-TextArea probe retained the app cursor despite an empty visible region, so clipped-caret policy remains a vue-tui decision.                                               |
| [prompt_toolkit](https://github.com/prompt-toolkit/python-prompt-toolkit/blob/236bfb7c15c62e921dc81bac5aefcabb16450f0c/src/prompt_toolkit/layout/containers.py#L1954-L2134) | Window render builds logical row/column to absolute cell mappings with wrapping, wide glyphs, scroll, and margins. Scrollable panes copy only in-range cursor coordinates.                                                                    | Strong mapping precedent, but its separate show-cursor propagation and `(0,0)` fallback do not prove a universal clipped-caret rule.                                                                                 |
| [pi-tui](https://github.com/badlogic/pi-mono/blob/4c1861033b63a04563547ccdb5ed2bf31d4fdcd3/packages/tui/src/tui.ts#L1226-L1252)                                             | A focused component emits a zero-width marker in rendered lines; the renderer derives its visual column with Unicode-aware width and finds it only inside the visible viewport. Missing marker hides the hardware cursor.                     | Clean render-derived alternative that avoids accumulated coordinates, but its line-array marker is not automatically the right Vue API or retained-element mechanism.                                                |
| [Ratatui](https://github.com/ratatui/ratatui/blob/de5168de6ba2f4b310565c287764f213f249a61f/ratatui-core/src/terminal/frame.rs#L150-L182)                                    | A frame owns one optional physical cursor position applied after the buffer diff; applications add widget rectangles themselves.                                                                                                              | Confirms one per-frame terminal result, but deliberately leaves semantic element and editor mapping to the application.                                                                                              |

Two real Ink consumers independently demonstrate the missing abstraction. [Linghun](https://github.com/linghungegeg/Linghun/blob/266be98a79c6e05515519bb16355b37fc0c71bb7/packages/tui/src/shell/components/useAnchoredCursor.ts) walks every parent Yoga node to turn `useBoxMetrics()` into a root origin before calling `useCursor()`. [deepcode-cli](https://github.com/lessweb/deepcode-cli/blob/82a3754c1957195889dd5393ab2f30a6451981d9/packages/cli/src/ui/hooks/cursor.ts) implements the same parent walk plus its own character-width and wrap algorithm. These are direct consumer costs: a framework that already owns layout and paint should not make each editor rebuild them.

## Derived internal contract

The evidence supports the following mechanism independently of public naming:

1. A normal Vue-authored ref resolves through F2's current-host identity. The same author reference must be usable by focus, geometry, caret, and later pointer composition without exposing `TuiNode`, Yoga, paint cells, or the component proxy as semantic state.
2. A per-root geometry service publishes one immutable snapshot after authoritative layout and paint. It contains parent-relative and render-surface-relative bounds plus exact fragments that map element-local, parent, surface, and clipped visible rectangles. Nested Text spans use their rendered spans rather than require Yoga.
3. Geometry attachment follows F2 exactly: removal clears the old snapshot synchronously; retargeting detaches before attach; a replacement publishes only after its own layout/paint; resize publishes one new coherent generation.
4. Caret requests have individual owner lifetimes. One runtime arbiter selects at most one request, using logical focus as eligibility while keeping the editor insertion point separate. Removing or hiding one owner cannot clear another live eligible owner.
5. The selected request supplies an element identity plus a local rendered insertion point. After each paint the runtime translates it through a private row-and-slot mapping derived beside public paint geometry. That mapping represents wrapped nested Text, a trailing insertion slot after the last painted cell, and an empty target's origin without making logical text offsets public. The writer receives either one validated physical cell for this frame or no targeted caret.
6. A hidden, removed, not-yet-laid-out, fully clipped, Static, or otherwise non-addressable insertion point produces no targeted caret. The runtime does not clamp it to the nearest unrelated visible cell. Resume and resize recompute from the new rendered generation before showing it again.
7. Inline and Fullscreen share steps one through five. Their existing writers differ only in the final render-root-to-terminal movement. Neither mode is reduced to the other's fallback.
8. Geometry observations can remain deterministic on a visual modeled or final-output host even when physical caret transport is unavailable. Screen-reader output exposes no 2D visual element geometry or targeted caret; string rendering has no reactive post-commit caret; Static content ceases to be addressable after transfer to history.

The current `useCursor()` per-commit reassertion remains a correct writer mechanism once the runtime supplies the selected validated cell. Its app-global public setter and unconditional owner cleanup are not a sufficient semantic editor API.

## Host and transition requirements

| Host or transition                        | Geometry requirement                                                                                                               | Targeted terminal caret requirement                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Visual Inline TTY, live                   | Parent, render-root, and visible snapshots for the current bounded frame. Physical root row remains private and unstable.          | Available through the relative writer when the selected focused insertion cell is visible.         |
| Visual Fullscreen TTY, live               | Same snapshots; render-root and terminal viewport share `(0,0)`.                                                                   | Available through fixed-viewport repaint.                                                          |
| Visual final-output or at-teardown stream | Deterministic document geometry may support layout-driven components; rows are unbounded.                                          | Unavailable; no cursor-control bytes.                                                              |
| Forced-live non-TTY stream                | Deterministic live frame geometry remains observable.                                                                              | Unavailable; the completed regression guarantees no cursor-control bytes.                          |
| Screen-reader presentation                | Linear transcript semantics replace 2D visual geometry.                                                                            | Targeted positioning unavailable; do not disturb the natural transcript cursor.                    |
| String rendering                          | Synchronous document output remains deterministic, with no reactive post-commit target contract.                                   | Inert and byte-free.                                                                               |
| Static item                               | A transient layout may exist while producing bytes, but it is not a durable live target after the item is committed and unmounted. | Never addresses terminal-owned history.                                                            |
| Hidden or fully clipped                   | Full layout may still exist; visible rectangle is absent.                                                                          | Hidden/unavailable, never edge-clamped.                                                            |
| Removed or null target                    | Geometry becomes unavailable synchronously through F2.                                                                             | Owner is ineligible immediately.                                                                   |
| Stable ref retarget                       | Old generation clears before the new generation is laid out and painted.                                                           | No stale cell during the gap; reappears from the replacement generation only.                      |
| Resize or continuation                    | Layout, clipping, geometry, and caret resolve from one refreshed generation.                                                       | Recomputed after repaint and before input modes return.                                            |
| Deterministic testing host                | Mirrors the matching production row above.                                                                                         | Emulator observation must include position and visibility so hidden and stale are distinguishable. |

## Acceptance journeys

The public proposal and implementation must close these journeys in order:

1. **Nested focused editor:** a header plus bordered/padded editor and prompt prefix runs in both modes. ASCII, CJK, a ZWJ emoji sequence, combining text, paste, movement, and deletion preserve logical insertion and exact terminal caret without the editor adding ancestor or terminal offsets.
2. **Arbitration and restoration:** two editors, Tab focus, unrelated spinner repaint, and a trapped approval modal prove that exactly the focused editor owns the terminal caret and closing the modal restores the prior insertion point.
3. **Rendered lifetime:** `v-if` host removal while setup survives, stable component-ref root replacement at a different offset, a null root, and component unmount prove synchronous stale-caret removal and post-layout replacement.
4. **Visibility:** display none, viewport exclusion, ancestor overflow, every edge, and a wide glyph straddling an edge prove separate full and visible rectangles and no caret on a dropped or half-visible glyph.
5. **Resize and reflow:** wide-to-narrow wrapping, narrow-to-wide recovery, and rapid coalesced resize recompute the insertion cell. Inline starts a safe new region; Fullscreen stays on its fixed viewport.
6. **Output and lifecycle:** Static, coordinated stdout/stderr, unrelated repaints, suspension, continuation, normal exit, and fatal cleanup preserve only the current dynamic eligible caret and restore the terminal exactly.
7. **Host matrix:** visual TTY, requested Fullscreen screen-reader fallback, forced-live stream, at-teardown stream, and string rendering prove truthful availability and zero targeted-caret ANSI outside visual TTY output.
8. **Validation:** invalid or transient geometry can neither produce malformed ANSI nor move a caret onto an unrelated cell.

Most semantic assertions belong in `@vue-tui/testing`, but its current `ScreenSnapshot` exposes cursor row and column without visibility. F5 should add modeled cursor visibility before relying on it. One shared real-PTY fixture and visual-controller target then cover both modes, Unicode, resize, modal restoration, side channels, suspend/resume, and exact terminal cleanup.

## Current dispositions

The audit narrows the old surfaces without freezing new names:

- `useCursor()` cannot remain the ordinary editor contract. Preserve its selected-caret per-frame writer behavior; replace the targetless public ownership model. Retain a low-level output-origin escape hatch only if a real non-editor consumer appears during the proposal, otherwise remove it under the experimental clean-slate policy.
- `useBoxMetrics()` has useful reactive and Vue-ref behavior but cannot remain the final parent-only scalar shape. Replace it with the atomic semantic geometry projection and migrate `ScrollBox`.
- `measureElement()` in its current `unknown`/Yoga/timing/ambiguous-zero form should be removed unless the public proposal finds an imperative journey that cannot consume the coherent snapshot. No current product consumer supplies that evidence.
- Keep focus handles logical and opaque. Do not add rectangles, insertion state, or terminal cursor setters to them.
- Defer the public disposition of `useDraggable`, `MouseTarget`, listener props, and raw mouse to F6. F5 may make their later coordinate implementation possible but may not publish pointer behavior early.

No low-level output-origin escape hatch survived the proposal: repository and external search found no non-editor consumer, while retaining it would preserve a second owner model whose cleanup can invalidate the semantic arbiter. `useCursor()`, `CursorPosition`, `useBoxMetrics()`, `BoxMetrics`, `UseBoxMetricsReturn`, and `measureElement()` are therefore direct removals when the replacement is implemented. `ScrollBox` migrates to the new atomic geometry. No alias, warning period, or compatibility branch is added.

## Selected public authoring surface

The proposal keeps the target source Vue-native and gives each state one owner. A normal Vue ref remains the rendered-element source. `UseFocusReturn` remains only logical focus identity and eligibility. The editor owns logical text, insertion, selection, and logical-to-local visual layout. Geometry and caret remain separate composables over the same rendered lifetime.

```ts
import type { ComponentPublicInstance, MaybeRefOrGetter, ShallowRef } from "vue";

export type ElementTarget = MaybeRefOrGetter<ComponentPublicInstance | null | undefined>;

export interface CellPoint {
  readonly x: number;
  readonly y: number;
}

export interface CellRect extends CellPoint {
  readonly width: number;
  readonly height: number;
}

export interface ElementGeometryFragment {
  /** Exact rendered extent in the target's local cells. */
  readonly local: CellRect;
  /** The same region relative to the nearest rendered parent. */
  readonly parent: CellRect;
  /** The same region relative to the current dynamic render surface. */
  readonly surface: CellRect;
  /** Clipped surface region, or null when this fragment is not visible. */
  readonly visible: CellRect | null;
}

interface ResolvedElementGeometry {
  /** Bounding box relative to the nearest rendered parent. */
  readonly parent: CellRect;
  /** Full bounding box relative to the current dynamic render surface. */
  readonly surface: CellRect;
  /** Exact local-to-parent-to-surface rendered mapping; one entry for a box. */
  readonly fragments: readonly ElementGeometryFragment[];
}

export type ElementGeometry =
  | { readonly status: "unavailable" }
  | { readonly status: "detached" }
  | { readonly status: "pending" }
  | { readonly status: "hidden" }
  | (ResolvedElementGeometry & {
      readonly status: "zero-size" | "clipped" | "visible";
    });

export interface UseElementGeometryReturn {
  readonly geometry: Readonly<ShallowRef<ElementGeometry>>;
}

export function useElementGeometry(target: ElementTarget): UseElementGeometryReturn;

export type CaretState =
  | { readonly status: "unavailable" }
  | { readonly status: "inactive" }
  | {
      readonly status: "hidden";
      readonly reason:
        | "unavailable"
        | "detached"
        | "pending"
        | "hidden"
        | "clipped"
        | "outside"
        | "invalid-position"
        | "unrelated";
    }
  | {
      readonly status: "visible";
      /** Render-surface-relative; never Inline's private physical row. */
      readonly surface: CellPoint;
    };

export interface UseCaretOptions {
  /** The request is eligible only while this exact F4 target is focused. */
  readonly focus: UseFocusReturn;
  /** Zero-based rendered cell local to `target`; null/undefined is inactive. */
  readonly position: MaybeRefOrGetter<CellPoint | null | undefined>;
}

export interface UseCaretReturn {
  readonly state: Readonly<ShallowRef<CaretState>>;
}

export function useCaret(target: ElementTarget, options: UseCaretOptions): UseCaretReturn;
```

Every published snapshot, rectangle, fragment array, point, state, and return object is frozen. One `geometry` or `state` ref is replaced only with a complete accepted generation; consumers never combine independently updated coordinates. Coordinates are finite integer cells. `parent` and `surface` are full bounding boxes and may contain holes for wrapped inline text. Each fragment maps one exact rendered extent across local, parent, and surface coordinates; its `visible` field is the clipped surface intersection or `null`. A transparent box may therefore have a rendered extent even where no glyph is emitted. Inline `surface.y` is relative to the current managed render region, never the terminal's physical row.

Rendered fragments are not insertion slots. A caret may sit after the final rendered cell or at an empty editor's origin, and each row of a wrapped nested Text can have a different surface origin. The private geometry service therefore also derives row mappings with an inclusive local insertion range, the surface coordinate corresponding to local `x=0`, and the ancestor/viewport clip. `useElementGeometry()` does not expose these private rows: public geometry answers where the element rendered, while `useCaret()` consumes the extra mapping needed to address a valid empty or trailing slot. The renderer creates an origin slot for an empty rendered Text row; an arbitrary zero-size Box has no slot. A trailing slot at the surface's right edge is clipped unless the editor supplies a next-row point backed by a rendered row; it is never passed to the writer for clamping.

Geometry status has one fixed precedence:

1. `unavailable` — the current host, presentation, suspended surface, or Static target has no observable live 2D geometry;
2. `detached` — no current F2 host resolves from the target;
3. `pending` — a new host resolves but has no authoritative post-layout paint generation yet;
4. `hidden` — `display:none` on the target or an ancestor excluded it from paint, so no resolved rectangles are published;
5. `zero-size` — layout is valid but its full bounds contain no cell;
6. `clipped` — positive full geometry exists but every fragment's `visible` field is `null`;
7. `visible` — at least one fragment has a non-null `visible` field.

Visual live and at-teardown streams may still expose deterministic geometry while mounted; targeted caret transport remains unavailable on every non-TTY output. A modeled visual TTY exposes the matching production geometry and caret state. Screen-reader and string presentation expose `unavailable`. Static content never becomes a durable target. Suspension publishes `unavailable`, continuation repaints a new generation before geometry or caret becomes visible again.

`useCaret()` accepts one local rendered cell, not a string index and not a physical terminal coordinate. The target may be the focus host or one of its rendered descendants, allowing a bordered editor to focus its outer box and anchor its caret to an inner Text. A cross-application or already disposed focus handle and a second live caret registration for the same handle fail synchronously before registry mutation. Target-to-focus ancestry is knowable only after both refs attach: a pending relation stays hidden; an unrelated host generation publishes hidden reason `unrelated` without entering the application's fatal error path, and the registration remains so a later valid retarget can recover. If the focus handle is disposed after successful registration, its F4 disposal notification atomically unregisters that owner, releases the registry entry, and publishes `inactive` through the retained `UseCaretReturn`; another focus handle and its caret remain untouched. Different editors retain independent registrations, while the single F4 effective target makes at most one eligible. Removing any other owner cannot clear it.

Initial cell validation precedes registration, then an accepted owner's state precedence is reactive-position validity → output capability → focus/position activity → current geometry/visibility → target relationship → insertion-slot translation. Resolving geometry before the relationship makes a removed target `detached`, while a resolved target whose host is outside the focus subtree becomes `unrelated`. `unavailable` means the output cannot transport a targeted terminal caret. A geometry status of `unavailable` on an otherwise capable visual TTY, such as a Static target, produces hidden reason `unavailable`. `inactive` means the focus is not effective or the position is nullish. A valid active request whose target is detached, pending, hidden, clipped, unrelated, or locally outside becomes `hidden` and emits no caret. A renderer-established empty Text row can expose its origin as a valid insertion slot; another zero-size target is `outside`. The runtime never clamps. Negative, fractional, non-finite, or unsafe-integer initial cells fail synchronously before registry mutation. A later invalid reactive value first clears the accepted point, publishes hidden reason `invalid-position`, and remains recoverable without entering the fatal app error path; a later valid value restores the same owner.

A representative composition is:

```ts
const editorBox = shallowRef<ComponentPublicInstance | null>(null);
const editorText = shallowRef<ComponentPublicInstance | null>(null);

const focus = useFocus(editorBox, { autoFocus: true });
const { geometry } = useElementGeometry(editorBox);
const { state: caret } = useCaret(editorText, {
  focus,
  position: () => insertionCell.value,
});
```

The editor converts its own logical insertion point to `insertionCell` using the same text-layout implementation as its rendered content. The renderer adds the inner target's current ancestor, surface, and clipping translation. Neither component code nor the geometry API discovers Inline's physical terminal row.

## Why the alternatives are rejected

### A generic semantic element handle

`useElement(target) -> handle`, followed by `useFocus(handle)`, `useElementGeometry(handle)`, and `useCaret(handle)`, would centralize an internal F2 registration. It would also reopen the completed F4 signature, make every template ref acquire a second public identity, and add author ceremony without a new capability. The existing vouched Vue-component-ref direction, completed F2 lifetime, and F4 direct-ref API support a normal target source. Internal geometry may deduplicate work without making that mechanism public.

### An arbitrary reactive active condition

`useCaret(target, { active, position })` would make every editor reconnect `focus.isFocused`, reintroduce a second selection model, and require priority or conflict rules for simultaneous `true` values. The required `UseFocusReturn` instead reuses modal isolation, restoration, removal, and one effective owner while leaving insertion state separate. Reopen an arbitrary active condition only if a real non-focus terminal-caret consumer appears.

### A rendered marker

A marker is convenient for a text editor because paint can derive Unicode width and wrapping. It is not a general runtime foundation here. Text is flattened to an ANSI string before wrap, transform, and clipping; an escape-string marker is sanitized or measured as visible width, while a structured marker would need a new host node carried through every text, style, wrap, transform, and output path. An arbitrary string `Transform` can delete, duplicate, or move it. A first-party editor may later use a private structured marker or helper on top of `useCaret`; F5 does not make every geometry or grid consumer depend on that representation.

### A logical text offset

`useTextCaret(target, { offset, affinity })` would require runtime ownership of UTF-16 or grapheme boundaries, nested Text concatenation, style and sanitization, soft-wrap affinity, truncation, transforms, masking, ghost text, and editor-specific presentation. It would still not serve grid or canvas-like editors. Logical-to-local conversion therefore belongs to an editor/text-layout layer, while F5 owns local-to-surface-to-terminal conversion.

### One visible rectangle

A wrapped nested Text can start after a prefix, fill the first line, and continue at column zero. A rectangle rooted at the first fragment misses the continuation; its bounding rectangle includes unrelated cells. Surface-only fragments also cannot translate an element-local point because each wrapped row can start at a different surface column. `fragments` is therefore an array of exact local/parent/surface/visible mappings even though boxes normally contain one entry. This is the same richer paint geometry F6 will later consume without changing F5's public target or publishing pointer behavior early.

## Executable proposal prototype

[`semantic-geometry-caret-prototype.test.ts`](../../packages/runtime/src/geometry/semantic-geometry-caret-prototype.test.ts) is an API-shaped private policy prototype, not the production controller. Sixteen tests demonstrate that the selected types and rules can represent:

- one nested bordered/padded editor with prompt prefix, CJK, a ZWJ emoji, combining text, and wrap;
- identical element-local declarations and render-surface results under Inline and Fullscreen labels, with final physical mapping left to their writers;
- focus and null insertion as independent inactive states;
- two independent owners, focus switching, exact disposal, and transactional rejection of duplicate, cross-app, and disposed focus handles;
- pending, unrelated, and recovered target-to-focus ancestry without a fatal reactive error, while detached geometry retains its own result;
- later focus-handle disposal unregistering its owner, publishing inactive, releasing the entry, and preserving another owner;
- clipping and resize hiding rather than clamping, plus explicit unavailable, detached, pending, hidden, and outside results;
- validation before output/focus state, initial invalid rollback, and visible invalid-position state through valid-to-invalid-to-valid recovery;
- an addressable empty-Text origin, no arbitrary zero-size Box slot, and both visible and right-edge-clipped trailing insertion slots;
- exact wrapped nested-Text fragments whose bounding box contains unrelated cells and whose local rows map to different surface origins.

The prototype intentionally does not claim renderer integration or real-terminal behavior. It settles representational sufficiency and removes the public-shape ambiguity. Production work still must derive the fragments from authoritative paint, join F2 and F4 lifetimes, update the writer after every relevant generation, and pass the complete acceptance journeys above.

## Implementation order after the proposal

1. Build one private per-root geometry service that receives exact mapped full/clipped fragments and caret row/slot mappings from paint, publishes atomic frozen generations, follows F2 transactions, and remains unavailable in non-visual or non-live target contexts.
2. Implement `useElementGeometry()`, migrate `ScrollBox`, then directly remove `useBoxMetrics()` and `measureElement()` plus their exports, types, docs, examples, and package guards.
3. Build one per-app caret registry joined to F4 target identity and the geometry generation. Resolve one focused owner after paint and feed its surface point or `undefined` into the existing mode writer; directly remove targetless `useCursor()`.
4. Add terminal cursor visibility to `@vue-tui/testing` snapshots, exact public/type/JavaScript guards, template and TSX journeys, HMR, string, screen-reader, stream, Static, suspension, resize, retarget, error, package, and clean-consumer evidence.
5. Run the shared nested-editor journey with two owners, modal restoration, unrelated repaint, Unicode, wrap, clipping, resize, side-channel output, suspend/resume, normal/fatal cleanup, both real terminal modes, and visual inspection before marking F5 Done or activating F6.

The proposal uniquely supports the audited ownership and host requirements, so no unresolved public-shape alternative requires a maintainer stop. It remains unstamped and does not imply a VOUCHED decision.
