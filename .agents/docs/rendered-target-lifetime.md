# Rendered-target lifetime

> **Status:** unstamped completed F2 implementation contract. The internal mechanism, two original adapters, focused regressions, HMR, Vue 3.4 consumer, package declarations, full repository gates, fresh CI, real-PTY and visual-controller journeys, exact terminal restoration, and independent reviews are complete. F5 later replaced the measurement adapter with public paint-derived semantic geometry while retaining this lifetime mechanism. This record does not publish a generic target API or settle input, focus, caret, or pointer semantics.

## The problem

A Vue ref and a rendered terminal element do not have the same lifetime. A template ref on a component points to its public component instance, and that instance may stay identical while its rendered root changes from `null` to a host element, from one keyed host element to another, or back to `null`. Vue 3.4 can also leave a non-null component ref whose host element has already been detached during a same-tick update and unmount ([vuejs/core#12639](https://github.com/vuejs/core/issues/12639), fixed upstream by [vuejs/core#12642](https://github.com/vuejs/core/pull/12642)). Watching only the author ref therefore cannot answer whether a behavior still has a live renderer target.

The user-visible failure is a behavior outliving what is on screen. In a coding-agent application, a conditionally rendered composer or approval target could keep a registration after the visible branch disappeared. In a finder or workbench, a stable wrapper could replace its inner row or pane while measurement or targeted interaction remained attached to the old host. The result can be stale metrics, input delivered to a removed cell, duplicate callbacks, a drag that never ends, or raw/mouse terminal modes that remain acquired without a live owner.

## Internal contract

Every ref-bound renderer behavior registers a resolver and an attach function with the render root that owns it. The registration identity is the resolved renderer host node, not the raw Vue ref or component proxy.

The contract is:

- `null`, a Vue comment anchor, an empty fragment text anchor, a detached node, and a node owned by another render root are unavailable targets;
- the first available target attaches once;
- an unchanged resolved host does not attach again;
- a changed resolved host detaches the old adapter completely before attaching the new one;
- removal invalidates the target synchronously before its parent link and Yoga resources are cleared, so a stale non-null Vue ref cannot reattach it;
- scope disposal, component unmount, app teardown, string-render teardown, and HMR replacement release the current adapter exactly once;
- cleanup and attach callbacks may synchronously change reactive state: the controller resolves again after detach, validates again after attach, and converges on the latest host instead of attaching a cached intermediate target;
- subtree invalidation selects and logically detaches every affected registration before invoking any cleanup callback, so one cleanup cannot move another node or registration out of the cleanup batch;
- cleanup failure does not prevent other registrations, mouse/raw leases, host nodes, or Yoga resources from receiving their cleanup turn. The first error remains observable on ordinary controller operations, while host removal treats adapter cleanup as a best-effort backstop and still completes structural removal.

Each live or deterministic renderer owns one controller for one `TuiRoot`. Vue-ref changes request reconciliation, and the renderer also reconciles after every authoritative commit. The second path is essential: a component proxy can remain stable while its `$el` changes, so no watcher of the proxy itself fires. A target is accepted only when walking its current parent chain reaches the controller's owning root.

The controller now also accepts one private owner transaction host for F4 integration. It distinguishes authoritative `reconcile` transactions from `cleanup` transactions. A complete reconcile derives one focus generation only after all detach/attach callbacks settle, so atomic host swaps never publish transient duplicate or unavailable states. Registration disposal, subtree invalidation, and controller disposal remain cleanup-only: during subtree removal the host is notified after every matching registration is logically detached and before any cleanup callback runs, so focus can make removed targets ineligible and invalidate their route without publishing a fallback before the renderer commit. Nested reconciliation reuses the outer transaction kind and cannot turn cleanup into an authoritative publication; hook or cleanup failure still gives every selected cleanup its turn.

`renderToString()` creates the same per-root controller, reconciles the one mounted tree before layout, and disposes it during the string-render transaction. The controller and renderer-node types remain internal and are not exported from the root package or `/internal`.

## First adapters

At the F2 checkpoint, `useDraggable()` and the then-public `useBoxMetrics()` used the same internal registration seam.

`useDraggable()` registers with the mouse controller only while its resolved host exists. Losing or replacing the target unregisters the old host, clears active capture, resets `isDragging`, and releases raw/SGR mouse ownership when no other consumer remains. Mouse acquisition and release are transactions: a failed first acquisition cannot leave an ownerless registration or SGR token, and a failing SGR release cannot skip raw-mode release.

The original measurement adapter subscribed to layout for the current resolved host and reset its scalar Yoga metrics synchronously when that host disappeared. F5 removed that API and the imperative Yoga read, then published `useElementGeometry()` on the same F2 attachment identity. Its atomic snapshot comes only from authoritative paint, reports a standalone `unavailable` state, and never exposes renderer nodes or private caret slots.

The private resolver recognizes direct renderer-owned host refs by nominal identity recorded when the runtime constructs each node, not by checking for a string `type` field. Public component resolution still walks the Vue instance's rendered subtree. This distinction lets internal adapters accept their real host refs without mistaking an ordinary Vue component with a `type` prop for a renderer node.

The F2 migrations did not freeze either public API. F5 directly replaced `useBoxMetrics()` with `useElementGeometry()` and removed `measureElement()` without aliases. `useDraggable()`, current element listeners, and terminal-wide raw mouse receive their target disposition in F6. F2 proves only the shared lifetime mechanism they can consume.

## Environment behavior

| Environment or transition                                               | F2 behavior                                                                                                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template or TSX ref to a host component                                 | Resolve the current real host below the public component instance; never expose that host to the author.                                             |
| Stable component proxy, inner root insertion or replacement             | Reconcile on the renderer commit and detach-before-attach by host identity.                                                                          |
| `v-if`, keyed removal, component unmount, or Vue 3.4 stale non-null ref | Invalidate during host removal; the detached host is unavailable even if the author ref still points to its component.                               |
| HMR template rerender                                                   | Preserve the component instance and follow its replacement host.                                                                                     |
| HMR script/component reload                                             | Release the old instance's host and attach the replacement instance's host.                                                                          |
| Deterministic testing                                                   | Use the same live renderer controller and modeled session; lifecycle behavior is not a testing-only simulation.                                      |
| Visual or screen-reader string rendering                                | Reconcile the fixed mounted tree and dispose before returning; no terminal capability is acquired.                                                   |
| Outside a render tree                                                   | `useElementGeometry()` reports `unavailable`; terminal-bound composables such as `useDraggable()` keep their existing fail-fast context requirement. |
| `v-show` or another mounted-but-hidden policy                           | Still a mounted target. F2 defines attachment and removal, not visibility, enabled state, clipping eligibility, or focusability.                     |

## Evidence

The implementation has focused coverage for null-to-host insertion, ordinary host refs, stable component refs, keyed inner-root replacement, `v-if` removal, target reassignment without a renderer commit, component unmount, nested effect-scope disposal, active-drag removal, no duplicate attach, subtree cleanup failure, cleanup and attach re-entrancy, foreign-root rejection, stale hit-map removal before a throttled repaint, string rendering, and standalone metrics.

The Vite fixture separately covers a template-only HMR rerender that preserves the component instance and a script edit that reloads it. The test lives in its own worker because Vue's SFC HMR registry is process-global; starting several independent dev-server lifetimes with the same SFC ids in one worker would make the test environments share component records.

A clean packed consumer using Vue 3.4.38, TypeScript 6, `skipLibCheck: false`, SFC template refs, and TSX refs proved both adapters without exposing `RenderedTargetController`, `useRenderedTargetRegistration`, or `TuiNode`. The same consumer reproduced vuejs/core#12639: the author ref remained non-null after detach while metrics reset and mouse ownership released, then recovered after insertion.

The `target-lifetime` real-PTY journey keeps one component ref stable while its inner host moves through absent → `7x2` target → keyed `11x1` target at a new origin → removed during an active drag. It proves that SGR drag reporting changes from none → drag → none, the old cell does not start a drag, the new cell has exactly one live registration, metrics follow replacement and reset on final removal, active capture ends on removal, the alternate screen restores, the app exits zero, and terminal attributes before and after are identical. The visual-controller artifacts are intentionally ignored local review evidence; the fixture and PTY assertions are the durable repository evidence.

## Deliberate limits

F2 itself did not define normalized input or routing, hidden/disabled eligibility, logical focus, semantic rectangles, terminal caret placement, public pointer events, selection, or copy, and it did not migrate the input, focus, or cursor composables early. F3 later replaced `useInput`, removed `usePaste`, and established the shared event and route result. Issue [#250](https://github.com/vuejs-ai/vue-tui/issues/250) remains evidence that setup-scope input lifetime is insufficient; F4 still owns focus and target attachment onto this mechanism.

No generic public `useRenderedTarget()` or target-ref type is justified yet. F3 through F6 should consume the internal lifetime rule and publish only the semantic authoring types their own journeys require.
