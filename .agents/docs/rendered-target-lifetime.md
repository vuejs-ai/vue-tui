# Rendered-target lifetime

Runtime internally reconciles a public Vue component ref with the real host boundary currently rendered by that component. This mechanism exists only for public APIs whose correctness depends on rendered availability: `useFocus(target)` and direct-Box `useBoxMetrics()`.

It is not a generic public target, geometry, pointer, or renderer-node API.

## Why component refs are insufficient

A Vue component instance can remain stable while its rendered root is inserted, removed, hidden, or replaced. Vue may also leave an author-facing ref non-null after the underlying host has detached. Reading the component proxy or `$el` once therefore cannot establish current Runtime ownership.

Runtime must bind validity to the renderer's actual host lifetime while leaving the public ref and component instance owned by the caller.

## Internal invariant

- Public callers pass ordinary readonly Vue refs.
- Runtime resolves only the host forms accepted by the consuming API.
- Reconciliation happens on renderer commits and compares host identity.
- A removed host becomes unavailable synchronously even if the public component ref remains non-null.
- Replacement detaches the old host before attaching the new one.
- Target reassignment, subtree removal, scope disposal, and application teardown release prior registration.
- No public value exposes a Runtime host node, VNode, Yoga node, or registration controller.

## Current consumers

### `useBoxMetrics()`

The ref must bind directly to the exported current-app `Box`. Runtime follows that Box through host replacement and publishes only its last accepted parent-relative `width`, `height`, `left`, `top`, and `hasMeasured` values. Text, arbitrary component, foreign-app, and raw-host targets are rejected.

### `useFocus(target)`

The target is a Vue component-boundary availability constraint, not the focus identity. Runtime follows supported single-root component chains and hidden or detached rendered ancestry. Losing availability clears ownership; later availability does not restore focus. True Fragments remain one boundary rather than becoming a first-descendant search.

## Lifecycle behavior

| Transition                                  | Required result                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Target starts null, then renders            | Attach when the accepted host appears.                                                              |
| Stable component replaces its root host     | Detach the old host, then attach the replacement.                                                   |
| `v-if`, keyed removal, or component unmount | Invalidate even if the author ref is stale.                                                         |
| `v-show` hides relevant ancestry            | Box metrics become unavailable and targeted focus clears while component lifecycle remains mounted. |
| HMR template rerender                       | Follow the replacement host without inventing component-state restoration.                          |
| HMR script/component reload                 | Release the old component boundary and attach the replacement if valid.                             |
| String rendering                            | Reconcile only during the temporary tree and dispose before return.                                 |
| Deterministic testing                       | Use the same production controller and modeled Runtime session.                                     |

## Deliberate limits

There is no public `useRenderedTarget()`. Rendered-target lifetime does not define focus traversal, disabled state, input routing, pointer hit testing, caret placement, surface coordinates, clipping geometry, selection, or clipboard behavior.

The public types remain specific to their consumers: `FocusTarget` for `useFocus(target)` and a direct `Box` ref for `useBoxMetrics()`. A future capability must justify its own semantic contract rather than exposing this internal mechanism.

## Evidence

Focus coverage under [`tests/runtime/integration/composables/use-focus`](../../tests/runtime/integration/composables/use-focus) proves stable refs, replacement, removal, visibility, suspension, rollback, and HMR-compatible lifetime. Box-metrics integration tests prove direct-target validation, accepted measurement, replacement, hidden state, and teardown. [`script-edit-recreates-instance.test.ts`](../../tests/vite/e2e/script-edit-recreates-instance.test.ts) proves that Vite/Vue lifetime transitions reach the same Runtime invariants.
