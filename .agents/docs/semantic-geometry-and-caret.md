# Semantic geometry and caret

> **Status:** completed unstamped F5 contract and implementation. Paint produces frozen atomic geometry generations with exact complete-grapheme ownership, wrapped fragments, sparse caret slots, F2 lifetime, both-mode surface coordinates, clear/suspend invalidation, resize recovery, and honest unavailable states. Geometry tracing remains demand-driven. `useElementGeometry()` publishes only the public projection, while `useCaret(target, { focus, position })` joins an element-local rendered cell to one exact F4 focus owner and publishes frozen semantic state. The selected surface point reaches the private mode writer only inside the corresponding frame transaction; failed writes retain the last successful frame and caret baselines for retry. The former scalar/Yoga measurement APIs, targetless `useCursor()`, and their named legacy types are removed. Public/type, lifecycle, package, HMR, both-mode PTY/visual, restoration, full-repository, fresh-CI, and independent-review gates pass. No VOUCHED stamp is implied.

## User capability

A coding-agent composer, finder query, monitor filter, workbench form, or terminal-workspace command field needs the same basic behavior: application state owns the text and insertion point; logical focus selects the active editor; renderer geometry locates what was actually painted; and the physical terminal cursor displays that caret at the editor's visible insertion cell. Moving, clipping, hiding, replacing, resizing, or unmounting the rendered element must update or remove the caret without the component accumulating parent offsets or guessing a physical terminal row.

This record uses **caret** for the editor-level insertion marker and **terminal cursor** for the physical terminal state that can display it. `useCaret()` owns the former semantic request and observation; the mode writer owns the latter transport. Cursor movement produced for ordinary frame rewriting is not itself a caret declaration.

This is not an editor-state foundation. Logical focus, collection active item, text insertion point, selection, focus-bound caret request, physical terminal cursor, and pointer target remain separate states. An editor component may coordinate them, but the runtime must not infer one from another or create a second owner for any of them.

## First-principles coordinate model

The word “position” hid several different coordinate spaces in the pre-F5 surface. The selected public contract names and preserves these distinctions instead of collapsing them into one pair of coordinates.

| Space                            | Meaning                                                                                                                                                                                       | Producer or consumer at the audit boundary                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Element-local point              | A rendered insertion cell relative to one element. It is not a logical string index.                                                                                                          | The editor derives it from its insertion state and rendered text, then supplies it to `useCaret()`. |
| Parent-relative layout rectangle | The element's unclipped layout box relative to its layout parent.                                                                                                                             | Former `useBoxMetrics().left/top/width/height`; now `ElementGeometry.parent`.                       |
| Render-root-relative rectangle   | The full element box accumulated from the current dynamic render root. In Fullscreen this root begins at terminal cell `(0,0)`; in Inline its physical terminal row is intentionally unknown. | Paint already accumulated ancestor layout offsets; `ElementGeometry.surface` now projects them.     |
| Visible rectangle                | The intersection of the full render-root rectangle with ancestor overflow clips and the active paint viewport. It may be absent while the full layout rectangle still exists.                 | Formerly Fullscreen mouse hit-map only; geometry fragments now expose the clipped projection.       |
| Physical terminal cell           | The cell addressed by terminal control output. Fullscreen maps render-root coordinates directly; Inline maps them through its current managed-region writer.                                  | Private mode-writer result; it is not part of the public caret API.                                 |

The shared cross-mode coordinate is render-root-relative, not a stable physical terminal-screen row. Inline cannot honestly expose the latter because Static output, coordinated output, resize, suspension, and terminal scrollback can move the managed region. It can still place an element-relative caret: the runtime resolves the element and local insertion point inside the current frame, then the existing Inline writer performs the final physical translation. Fullscreen performs that final translation against its fixed `(0,0)` viewport.

Geometry must be a single immutable per-commit snapshot. Publishing width, height, left, top, clipping, and availability as independently updated values lets a synchronous observer combine different layout generations. A zero-size layout, a fully clipped element, a hidden element, an element not laid out yet, and a removed target are different facts; `{0,0,0,0}` cannot represent all of them.

## Pre-cutover public and internal inventory

This table records the evidence that selected the replacement. The two measurement rows are historical: the public cutover below removed them directly.

| Surface                                                                | Contract at the audit boundary                                                                                                                                | F5 problem                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Former `useCursor()`                                                   | Each call wrote one app-global persistent output-origin `{x,y}` declaration; every scope disposal cleared the same global slot.                               | No element, focus, visible-cell, host-availability, or F2 lifetime. Two live owners overwrote and cleared each other.                                                                      |
| Former `useBoxMetrics()`                                               | F2-bound reactive Yoga width, height, and parent-relative left/top plus `hasMeasured`. It accepted both Vue component and host refs and reset on target loss. | No render-root or visible rectangle; scalar publication was not atomic; Yoga-only measurement excluded nested virtual Text spans; zero remained overloaded.                                |
| Former `measureElement()`                                              | Timing-sensitive imperative `unknown -> {width,height}` Yoga duck read. Detached, pre-layout, invalid, and legitimate zero-size inputs could all return zero. | It bypassed F2 root/lifetime validation, could read a retained stale `.yoga`, exposed no coordinate or availability semantics, and had no repository product consumer.                     |
| [`useFocus()`](../../packages/runtime/src/composables/useFocus.ts)     | Opaque F2-bound logical target with one runtime focus owner, scopes, restoration, and exact input routing.                                                    | Correctly contains no geometry or caret state. F5 may coordinate with it but must not expand it into an element-layout object.                                                             |
| Former `useDraggable()`                                                | F2-bound Fullscreen behavior whose `x/y` were caller state plus pointer displacement.                                                                         | Its values were not element geometry. F6 directly replaced it with the rendered-host-owned `useMouseDrag()` lifecycle.                                                                     |
| Former `MouseTarget.rect`                                              | The latest clipped Fullscreen hit rectangle; event offsets were rebased from that visible origin.                                                             | It was not the full element rectangle, existed only through pointer delivery, and exposed a mutable shared runtime object. F6 now consumes exact accepted F5 fragments instead.            |
| [`ScrollBox`](../../packages/components/src/scroll-box/scroll-box.vue) | Uses two public `useElementGeometry()` projections and caches each last resolved full parent height.                                                          | It proves semantic geometry has a real common-component consumer; completed F7 uses the wrapper height for page movement and returns boolean top-line-change results for boundary routing. |

A top-level `Text` is a Yoga node, while a nested `Text` is a non-Yoga `tui-virtual-text`. Focus and pointer targeting could already resolve the nested span, and the painter could derive its visible cell span, but the former `useBoxMetrics()` and `measureElement()` could not measure it. A semantic element contract therefore cannot mean “anything with a Yoga node.” The renderer's post-layout paint traversal, not a public Yoga read, is the authority for accumulated and clipped geometry.

Repository-wide search found no product example using the physical terminal cursor to display a semantic caret. The coding-agent example keeps a normal component ref and opaque focus handle, then paints `█` as content. `ScrollBox`, one Vite fixture, and the mouse example are the only non-test geometry or drag consumers. A GitHub code search on 2026-07-13 found no external repository importing vue-tui's `useCursor`, `useBoxMetrics`, or `measureElement`; this is supporting evidence for experimental replacement, not a compatibility promise.

## Pre-cutover executable findings and implemented dispositions

The audit ran the pre-cutover runtime rather than inferring terminal behavior from types. The findings below remain the reason for the replacement; each item now states the implemented disposition.

1. A forced-live non-TTY stream with an active targetless declaration previously received movement, show, hide, and restoration bytes. [`cursor-non-tty.test.tsx`](../../packages/runtime-tests/integration/lifecycle/cursor-non-tty.test.tsx) now exercises `useCaret()` through mount, suspension, continuation, and teardown with both writers: state remains `unavailable`, and no targeted cursor control is emitted.
2. Two old owners shared one global slot, so disposing either could hide the survivor. The per-app registry now reserves one owner per F4 focus handle, selects only the effective handle, and disposes one registration without mutating another. The temporary expected-failure test was removed after production controller and integration coverage replaced it.
3. A hidden or fully clipped target previously remained independent from the targetless declaration. The caret now consumes the accepted paint generation and reports explicit hidden reasons without passing a point to either writer.
4. A wide glyph dropped at an edge previously left an apparently addressable blank cell. Sparse slots now inherit complete-glyph paint visibility, exclude continuation cells, and hide a caret whose glyph did not survive clipping.
5. Resize previously clamped a stale output coordinate onto an unrelated visible cell. The semantic path never clamps: a missing local slot is `outside`, a clipped slot is `clipped`, and a later accepted paint generation can recover the request.
6. Screen-reader presentation still leaves the natural transcript cursor alone, while `useCaret()` now reports targeted transport as `unavailable` and emits no positioning controls.
7. Initial invalid coordinates now fail synchronously before registry mutation. A later invalid reactive coordinate publishes `hidden: invalid-position`, emits no malformed ANSI, and can recover on a later valid frame.
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
2. A per-root geometry service publishes one immutable snapshot after authoritative layout and paint. It contains parent-relative and render-surface-relative bounds plus exact fragments that map element-local, parent, surface, and clipped visible rectangles. Nested Text spans use their rendered spans rather than require Yoga. A frame freezes the set of bound targets and their ancestor paths before paint; unrelated subtrees do not derive geometry, and publishing one Box observation does not make every Text pay for grapheme provenance.
3. Geometry attachment follows F2 exactly: removal clears the old snapshot synchronously; retargeting detaches before attach; a replacement publishes only after its own layout/paint; resize publishes one new coherent generation.
4. Caret requests have individual owner lifetimes. One runtime arbiter selects at most one request, using logical focus as eligibility while keeping the editor insertion point separate. Removing or hiding one owner cannot clear another live eligible owner.
5. The selected request supplies an element identity plus a local rendered insertion point. After each paint the runtime translates it through exact private caret slots derived beside public paint geometry. Each slot maps one legal local insertion cell to one render-surface cell and records whether that cell survived clipping. Sparse slots represent wrapped nested Text, exclude continuation cells inside wide glyphs, and include a valid trailing insertion slot or empty Text origin without making logical text offsets public. The writer receives either one validated physical cell for this frame or no targeted caret.
6. A hidden, removed, not-yet-laid-out, fully clipped, Static, or otherwise non-addressable insertion point produces no targeted caret. The runtime does not clamp it to the nearest unrelated visible cell. Resume and resize recompute from the new rendered generation before showing it again.
7. Inline and Fullscreen share steps one through five. Their existing writers differ only in the final render-root-to-terminal movement. Neither mode is reduced to the other's fallback.
8. Geometry observations can remain deterministic on a visual modeled or final-output host even when physical caret transport is unavailable. Suspending terminal input preserves final-output geometry because that host releases no live output surface; a live terminal surface instead becomes unavailable until continuation repaints it. Screen-reader output exposes no 2D visual element geometry or targeted caret; string rendering has no reactive post-commit caret; Static content ceases to be addressable after transfer to history.

The former per-commit reassertion remains a private writer mechanism once the runtime supplies the selected validated cell. Its app-global public setter and unconditional owner cleanup were removed rather than retained as a second caret owner model.

## Host and transition requirements

| Host or transition                        | Geometry requirement                                                                                                                                                                     | Caret transport requirement                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Visual Inline TTY, live                   | Parent, render-root, and visible snapshots for the current bounded frame. Physical root row remains private and unstable.                                                                | Available through the relative writer when the selected focused insertion cell is visible.                                            |
| Visual Fullscreen TTY, live               | Same snapshots; render-root and terminal viewport share `(0,0)`.                                                                                                                         | Available through fixed-viewport repaint.                                                                                             |
| Visual final-output or at-teardown stream | Deterministic document geometry may support layout-driven components; rows are unbounded.                                                                                                | Unavailable; no cursor-control bytes.                                                                                                 |
| Forced-live non-TTY stream                | Deterministic live frame geometry remains observable.                                                                                                                                    | Unavailable; the completed regression guarantees no cursor-control bytes.                                                             |
| Screen-reader presentation                | Linear transcript semantics replace 2D visual geometry.                                                                                                                                  | Targeted positioning unavailable; do not disturb the natural transcript cursor.                                                       |
| String rendering                          | Synchronous document output remains deterministic, with no reactive post-commit target contract.                                                                                         | Inert and byte-free.                                                                                                                  |
| Static item                               | A transient paint generation may report unavailable geometry while producing bytes. After transfer to history, its component ref detaches and the retained geometry state is `detached`. | The active caret ends `hidden: detached`, and the physical terminal cursor stays hidden; terminal-owned history is never addressable. |
| Hidden or fully clipped                   | Full layout may still exist; visible rectangle is absent.                                                                                                                                | Hidden/unavailable, never edge-clamped.                                                                                               |
| Removed or null target                    | Geometry becomes unavailable synchronously through F2.                                                                                                                                   | Owner is ineligible immediately.                                                                                                      |
| Stable ref retarget                       | Old generation clears before the new generation is laid out and painted.                                                                                                                 | No stale cell during the gap; reappears from the replacement generation only.                                                         |
| Resize or continuation                    | Layout, clipping, geometry, and caret resolve from one refreshed generation.                                                                                                             | Recomputed after repaint and before input modes return.                                                                               |
| Deterministic testing host                | Mirrors the matching production row above.                                                                                                                                               | Emulator observation must include position and visibility so hidden and stale are distinguishable.                                    |

## Acceptance journeys

The public proposal and implementation must close these behavioral journeys. They may use separate focused tests; no single fixture must combine the entire matrix.

1. **Nested focused editor:** a header plus bordered/padded editor and prompt prefix runs in both modes. ASCII, CJK, a ZWJ emoji sequence, combining text, paste, movement, and deletion preserve logical insertion and exact caret placement without the editor adding ancestor or terminal offsets.
2. **Arbitration and restoration:** two editors, Tab focus, unrelated spinner repaint, and a trapped approval modal prove that only the focused editor's caret request controls the physical terminal cursor and closing the modal restores the prior insertion point.
3. **Rendered lifetime:** `v-if` host removal while setup survives, stable component-ref root replacement at a different offset, a null root, and component unmount prove synchronous stale-caret removal and post-layout replacement.
4. **Visibility:** display none, viewport exclusion, ancestor overflow, every edge, and a wide glyph straddling an edge prove separate full and visible rectangles and no caret on a dropped or half-visible glyph.
5. **Resize and reflow:** wide-to-narrow wrapping, narrow-to-wide recovery, and rapid coalesced resize recompute the insertion cell. Inline starts a safe new region; Fullscreen stays on its fixed viewport.
6. **Output and lifecycle:** Static, coordinated stdout/stderr, unrelated repaints, suspension, continuation, normal exit, and fatal cleanup preserve only the current dynamic eligible caret and restore the terminal exactly.
7. **Host matrix:** visual TTY, requested Fullscreen screen-reader fallback, forced-live stream, at-teardown stream, and string rendering prove truthful availability and zero targeted-caret ANSI outside visual TTY output.
8. **Validation:** invalid or transient geometry can neither produce malformed ANSI nor move a caret onto an unrelated cell.

Most semantic assertions belong in `@vue-tui/testing`. `ScreenSnapshot.cursor` now exposes readonly row, column, and DECTCEM visibility from the xterm emulator, so hidden and stale physical cursor states are distinguishable from position alone. Focused runtime and PTY tests cover Unicode, clipping, resize, restoration, side channels, suspend/resume, errors, and cleanup independently. The remaining visual-controller journey only needs to show representative focus-bound caret placement and cleanup in both modes; it does not duplicate that entire matrix.

## Dispositions selected before the cutover

The audit narrowed the old surfaces before the proposal selected replacement names. These bullets record that decision history; the geometry removals below are now implemented:

- `useCursor()` cannot remain the ordinary editor contract. Preserve its selected-caret per-frame writer behavior; replace the targetless public ownership model. Retain a low-level output-origin escape hatch only if a real non-editor consumer appears during the proposal, otherwise remove it under the experimental clean-slate policy.
- `useBoxMetrics()` had useful reactive and Vue-ref behavior but could not remain the final parent-only scalar shape. The cutover replaced it with the atomic semantic geometry projection and migrated `ScrollBox`.
- `measureElement()` in its former `unknown`/Yoga/timing/ambiguous-zero form had no imperative journey that could not consume the coherent snapshot. No current product consumer supplied contrary evidence, so the cutover removed it.
- Keep focus handles logical and opaque. Do not add rectangles, insertion state, or terminal cursor setters to them.
- Defer the public disposition of `useDraggable`, `MouseTarget`, listener props, and raw mouse to F6. F5 may make their later coordinate implementation possible but may not publish pointer behavior early.

No low-level output-origin escape hatch survived the proposal: repository and external search found no non-editor consumer, while retaining it would preserve a second owner model whose cleanup can invalidate the semantic arbiter. The implemented cutovers directly remove `useBoxMetrics()`, `BoxMetrics`, `UseBoxMetricsReturn`, `measureElement()`, `useCursor()`, and `CursorPosition`, and migrate `ScrollBox`. No alias, warning period, or compatibility branch is added.

## Naming review

The public name follows the operation's semantics rather than diverging from Ink for stylistic reasons. Ink 7.0.4 has two professionally named but narrower APIs: [`measureElement()`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/measure-element.ts#L22-L25) performs an imperative Yoga size read, while [`useBoxMetrics()`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-box-metrics.ts#L85-L133) subscribes to parent-relative Yoga width, height, left, and top for a Box. Those names accurately describe Ink's operations. Reusing either name for vue-tui's replacement would instead create a false expectation: calling the composable does not perform a measurement, its target is not restricted to a Box, and its result includes paint-derived fragments, multiple coordinate spaces, clipping, and lifecycle availability rather than only layout metrics.

The broader peer vocabulary supports keeping the concepts separate. VueUse names a reactive single DOM rectangle [`useElementBounding()`](https://vueuse.org/core/useelementbounding/) and a size-only query `useElementSize()`. The Web platform calls exact rectangle queries [`getBoundingClientRect()` and `getClientRects()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getClientRects), while [Geometry Interfaces](https://developer.mozilla.org/en-US/docs/Web/API/Geometry_interfaces) is the umbrella for points, rectangles, and coordinate transformations. Textual's [`MapGeometry`](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/src/textual/map_geometry.py#L8-L34) likewise groups a full region, clip, virtual region, and visible region. OpenTUI exposes coordinates and dimensions directly on retained renderables, and Ratatui passes a `Rect` area into rendering; neither supplies an analogous ref-bound reactive observation API whose name vue-tui should copy.

The rejected names are therefore semantic mismatches rather than merely different tastes:

| Candidate                                     | Disposition | Reason                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `measureElement()` / `useMeasureElement()`    | Reject      | A verb promises an imperative measurement at call time; the selected API observes accepted paint generations.                                                                                                                                          |
| `useBoxMetrics()`                             | Reject      | Nested and top-level Text are valid targets, and fragments, clipping, coordinate mappings, and availability are not just Box layout metrics.                                                                                                           |
| `useElementBounds()` / `useElementBounding()` | Reject      | The result contains exact disjoint fragments and state in addition to two full bounding rectangles.                                                                                                                                                    |
| `useElementLayout()`                          | Reject      | `layout` implies the pre-paint Yoga result and would hide that paint and clipping are authoritative.                                                                                                                                                   |
| `useRenderedElementGeometry()`                | Reject      | Accurate but needlessly long; the contract already defines `ElementGeometry` as rendered terminal-cell geometry.                                                                                                                                       |
| `useElementGeometry()`                        | Select      | `use` communicates reactive observation, `Element` matches a normal Vue component ref without restricting the host kind, and `Geometry` covers bounds, fragments, coordinate mappings, clipping, and availability without claiming an imperative read. |

The related nouns follow the same rule: `CellPoint` and `CellRect` name terminal-cell primitives; `ElementGeometryFragment` names one exact mapped rendered extent; and `ElementGeometry` names the complete atomic result, including the states in which no trustworthy rectangle exists. `visibleSurface` is deliberately a coordinate-qualified rectangle rather than the ambiguous noun `visible`, and `fully-clipped` is deliberately exact: a partially clipped element still has status `visible` while an individual fragment may have a smaller `visibleSurface`. The public documentation must say “paint-derived” near first use so `Geometry` is not mistaken for a Yoga-only layout query.

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
  /** Clipped rectangle in surface coordinates, or null when this fragment is not visible. */
  readonly visibleSurface: CellRect | null;
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
      readonly status: "zero-size" | "fully-clipped" | "visible";
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

Every published snapshot, rectangle, fragment array, point, state, and return object is frozen. One `geometry` or `state` ref is replaced only with a complete accepted generation; consumers never combine independently updated coordinates. Coordinates are finite integer cells. `parent` and `surface` are full bounding boxes and may contain holes for wrapped inline text. Each fragment maps one exact rendered extent across local, parent, and surface coordinates; its `visibleSurface` field is the clipped surface-coordinate intersection or `null`. A transparent box may therefore have a rendered extent even where no glyph is emitted. Inline `surface.y` is relative to the current managed render region, never the terminal's physical row.

A top-level Yoga Text is one layout element and therefore publishes its layout extent as a fragment, like a Box. When actual paint escapes an undersized Yoga width, exact non-overlapping overflow fragments expand the parent and surface bounding boxes without filling the holes between wrapped rows; sparse caret slots preserve the real rows and legal grapheme boundaries. A nested virtual Text has no independent Yoga extent, so its fragments follow only the exact complete graphemes it owns.

Rendered fragments are not insertion slots. A caret may sit after the final rendered cell or at an empty editor's origin, and each row of a wrapped nested Text can have a different surface origin. A row expressed only as `minX`, `maxX`, and an affine surface offset is insufficient: it would accept a continuation cell inside a wide glyph, and clipping can make the surviving local-to-surface mapping non-contiguous. The private geometry service therefore derives an exact sparse set of slots. Each slot contains one legal element-local point, its actual render-surface point, and whether that point is visible after ancestor and viewport clipping. `useElementGeometry()` does not expose these private slots: its public runtime object is projected field-by-field and contains only `status`, plus `parent`, `surface`, and `fragments` for resolved states. Public geometry answers where the element rendered, while `useCaret()` consumes the extra mapping needed to address a valid empty or trailing slot. The renderer creates an origin slot for an empty rendered Text row; an arbitrary zero-size Box has no slot. A trailing slot at the surface's right edge is clipped unless the editor supplies a next-row point backed by a rendered row; it is never passed to the writer for clamping.

An arbitrary `Transform` receives a flattened string and may delete, duplicate, or move any descendant Text content. The renderer therefore cannot claim exact descendant Text fragments or caret slots across that boundary unless transforms later preserve structured provenance. Until then, a descendant Text target affected by an arbitrary `Transform` publishes `unavailable` geometry and its active caret is hidden with reason `unavailable`; the runtime must not publish an approximate mapping. The public signatures do not change for this limitation.

Two other boundaries follow the same rule. A truncation mode can synthesize an ellipsis without identifying which nested Text owns that new cell, so the top-level Text retains exact slots derived from its final rendered row while nested Text geometry is `unavailable` for that generation. A nested Text boundary may also fall inside one complete terminal grapheme, such as a combining mark, variation selector, regional-indicator pair, or ZWJ emoji split across nodes. That nested target owns no independent terminal cell and publishes `unavailable`; the enclosing Text maps the complete grapheme once. Ordinary wrap and hard-wrap generations retain exact nested ownership, including explicit empty lines, word movement, wide glyphs, combining sequences, and empty targets at legal grapheme boundaries.

Geometry status has one fixed precedence:

1. `unavailable` — the current host, presentation, suspended surface, or a Static target during its transient paint generation has no observable live 2D geometry;
2. `detached` — no current F2 host resolves from the target;
3. `pending` — a new host resolves but has no authoritative post-layout paint generation yet;
4. `hidden` — `display:none` on the target or an ancestor excluded it from paint, so no resolved rectangles are published;
5. `zero-size` — layout is valid but its full bounds contain no cell;
6. `fully-clipped` — positive full geometry exists but every fragment's `visibleSurface` field is `null`;
7. `visible` — at least one fragment has a non-null `visibleSurface` field; individual fragments may still be partially or fully clipped.

Visual live and at-teardown streams may still expose deterministic geometry while mounted; targeted caret transport remains unavailable on every non-TTY output. A modeled visual TTY exposes the matching production geometry and caret state. Screen-reader and string presentation expose `unavailable`, including before a target attaches; when a visual surface becomes available again, an attached target returns to `pending` and an unattached target returns to `detached`. Calling the geometry composable outside a render tree also returns a stable `unavailable` projection rather than throwing. A Static item can be unavailable during its transient paint, then its component ref detaches after transfer to terminal history; the retained active caret therefore ends `hidden: detached` and emits no physical cursor. Suspension publishes `unavailable`, and continuation repaints a new generation before geometry or caret becomes visible again.

`useCaret()` accepts one local rendered cell, not a string index and not a physical terminal coordinate. The target may be the focus host or one of its rendered descendants, allowing a bordered editor to focus its outer box and anchor its caret to an inner Text. A cross-application or already disposed focus handle and a second live caret registration for the same handle fail synchronously before registry mutation. Target-to-focus ancestry is knowable only after both refs attach: a pending relation stays hidden; an unrelated host generation publishes hidden reason `unrelated` without entering the application's fatal error path, and the registration remains so a later valid retarget can recover. If the focus handle is disposed after successful registration, its F4 disposal notification atomically unregisters that owner, releases the registry entry, and publishes `inactive` through the retained `UseCaretReturn`; another focus handle and its caret remain untouched. Different editors retain independent registrations, while the single F4 effective target makes at most one eligible. Removing any other owner cannot clear it.

Initial cell validation precedes registration, then an accepted owner's state precedence is reactive-position validity → output capability → focus/position activity → current geometry/visibility → target relationship → insertion-slot translation. Resolving geometry before the relationship makes a removed target `detached`, while a resolved target whose host is outside the focus subtree becomes `unrelated`. `unavailable` means the output cannot transport the requested caret through the physical terminal cursor. A geometry status of `unavailable` on an otherwise capable visual TTY, including a Static target during its transient paint, produces hidden reason `unavailable`; after that Static item transfers to history and its ref detaches, the retained state becomes hidden reason `detached`. `inactive` means the focus is not effective or the position is nullish. A valid active request whose target is detached, pending, hidden, fully clipped, unrelated, or locally outside becomes `hidden` and emits no caret. The caret state's shorter reason remains `clipped` because a particular insertion slot may be clipped even while another element fragment is visible. A renderer-established empty Text row can expose its origin as a valid insertion slot; another zero-size target is `outside`. The runtime never clamps. Negative, fractional, non-finite, or unsafe-integer initial cells fail synchronously before registry mutation. A later invalid reactive value first clears the accepted point, publishes hidden reason `invalid-position`, and remains recoverable without entering the fatal app error path; a later valid value restores the same owner.

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

`useElement(target) -> handle`, followed by `useFocus(handle)`, `useElementGeometry(handle)`, and `useCaret(handle)`, would centralize an internal F2 registration. It would also reopen the completed F4 signature, make every template ref acquire a second public identity, and add author ceremony without a new capability. Vue's normal component-ref authoring model, completed F2 lifetime, and F4 direct-ref API support a normal target source. Internal geometry may deduplicate work without making that mechanism public. This F5 choice is unstamped.

### An arbitrary reactive active condition

`useCaret(target, { active, position })` would make every editor reconnect `focus.isFocused`, reintroduce a second selection model, and require priority or conflict rules for simultaneous `true` values. The required `UseFocusReturn` instead reuses modal isolation, restoration, removal, and one effective owner while leaving insertion state separate. Reopen an arbitrary active condition only if a real non-focus caret consumer appears.

### A rendered marker

A marker is convenient for a text editor because paint can derive Unicode width and wrapping. It is not a general runtime foundation here. Text is flattened to an ANSI string before wrap, transform, and clipping; an escape-string marker is sanitized or measured as visible width, while a structured marker would need a new host node carried through every text, style, wrap, transform, and output path. An arbitrary string `Transform` can delete, duplicate, or move it. A first-party editor may later use a private structured marker or helper on top of `useCaret`; F5 does not make every geometry or grid consumer depend on that representation.

### A logical text offset

`useTextCaret(target, { offset, affinity })` would require runtime ownership of UTF-16 or grapheme boundaries, nested Text concatenation, style and sanitization, soft-wrap affinity, truncation, transforms, masking, ghost text, and editor-specific presentation. It would still not serve grid or canvas-like editors. Logical-to-local conversion therefore belongs to an editor/text-layout layer, while F5 owns local-to-surface-to-terminal conversion.

### One visible rectangle

A wrapped nested Text can start after a prefix, fill the first line, and continue at column zero. A rectangle rooted at the first fragment misses the continuation; its bounding rectangle includes unrelated cells. Surface-only fragments also cannot translate an element-local point because each wrapped row can start at a different surface column. `fragments` is therefore an array of exact local/parent/surface/visible-surface mappings even though boxes normally contain one entry. F6 now consumes this richer paint geometry without changing F5's public target or having published pointer behavior during F5.

## Retired proposal prototype

Before production implementation, an API-shaped private policy prototype used eighteen tests to demonstrate that the selected types and rules could represent:

- one nested bordered/padded editor with prompt prefix, CJK, a ZWJ emoji, combining text, and wrap;
- identical element-local declarations and render-surface results under Inline and Fullscreen labels, with final physical mapping left to their writers;
- focus and null insertion as independent inactive states;
- two independent owners, focus switching, exact disposal, and transactional rejection of duplicate, cross-app, and disposed focus handles;
- pending, unrelated, and recovered target-to-focus ancestry without a fatal reactive error, while detached geometry retains its own result;
- later focus-handle disposal unregistering its owner, publishing inactive, releasing the entry, and preserving another owner;
- clipping and resize hiding rather than clamping, plus explicit unavailable, detached, pending, hidden, and outside results;
- validation before output/focus state, initial invalid rollback, and visible invalid-position state through valid-to-invalid-to-valid recovery;
- an addressable empty-Text origin, no arbitrary zero-size Box slot, both visible and right-edge-clipped trailing insertion slots, and no slot inside a CJK continuation cell;
- exact wrapped nested-Text fragments whose bounding box contains unrelated cells and whose local rows map to different surface origins;
- unavailable descendant Text geometry and caret placement across an arbitrary string `Transform` until that boundary preserves provenance.

The prototype settled representational sufficiency and was removed after the production geometry service, caret controller, and integration tests covered the same policy against authoritative paint and real writers. Focused implementation tests cover Box and nested Text mappings, exact Unicode ownership, explicit and soft wrapping, clipping, hidden and zero-content guards, Static and Transform boundaries, truncation, resize, failed-paint and failed-write discard, retargeting, frozen generations, both rendering modes, screen-reader and non-TTY unavailability, suspension/continuation, HMR, and package consumption. The bounded both-mode visual focus/caret journey and full-repository gates also pass.

## Implementation progress after the proposal

1. **Done:** build one private per-root geometry service that receives exact mapped full/clipped fragments and sparse caret slots from paint, publishes atomic frozen generations, follows F2 transactions, and remains unavailable in non-visual target contexts.
2. **Done:** publish `useElementGeometry()` as one frozen, runtime-readonly projection; migrate ScrollBox to full parent bounds with batched last-resolved height retention; directly remove `useBoxMetrics()`, `measureElement()`, their scalar types, layout-listener/Yoga-read support, docs, tests, exports, and package surface. Public teardown remains observable after Vue stops setup watchers because the service binding drives the projection directly. Runtime, template, TSX, JavaScript, HMR, ScrollBox, PTY fixture, package-output, and clean Vue 3.4/TypeScript 6 runtime/testing/components consumer evidence cover the cutover.
3. **Done:** build one per-app caret registry joined to F4 target identity and the accepted geometry generation. Resolve one focused owner after paint, feed its surface point or `undefined` into the existing mode writer, publish `useCaret()`, and directly remove targetless `useCursor()` and `CursorPosition`. Candidate semantic state and writer baselines advance only after successful output; standard and incremental writes can retry an identical failed frame.
4. **Done:** add terminal cursor visibility to `@vue-tui/testing`; cover exact public/type/JavaScript guards, template and TSX consumption, HMR, string, screen-reader, stream, Static, suspension, resize, retarget, errors, package output, and a clean consumer. Runtime 656/656, the focused integration suite, relevant PTY 33/33, Vite HMR 1/1, testing 72/72, and the clean Vue 3.4.38/TypeScript 6.0.3 tarball consumer pass.
5. **Done:** reuse the focused runtime and PTY evidence with a bounded visual-controller journey that shows focus-bound caret placement and cleanup in Inline and Fullscreen without repeating every lower-level case. Focus transfer, modal hiding, restoration, normal/alternate buffer ownership, exact terminal and termios cleanup, and post-exit shell input pass together with fresh `vp run ready`, `CI=true vp run ci`, and final independent review.

The proposal uniquely supports the audited ownership and host requirements, so no unresolved public-shape alternative requires a maintainer stop. It remains unstamped and does not imply a VOUCHED decision.
