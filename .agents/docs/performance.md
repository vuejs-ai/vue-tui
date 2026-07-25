# Renderer performance

> **Status:** parked. Performance work reopens only on a recorded representative failure, and the trigger conditions below are the whole current contract. The earlier cost model, pipeline walkthrough, candidate dirty-span architecture, native-core upper bound, and per-scenario implications were speculation about a failure that has not happened; they remain in git history rather than reading as a plan.

## Current decision

Performance optimization is not a current product priority. [VOUCHED @hyfdev 2026-07-10]

Do not start a renderer rewrite, replace the layout engine, add a native runtime requirement, or schedule speculative optimization from this record alone.

The in-repository [`capacity`](../../packages/runtime-tests/capacity) harness defines the J1-J6 workload set and its acceptance policy: an Inline conversational transcript and finder, a Fullscreen long document, a sparse monitor, a multi-pane workbench, and deliberately slow Inline and Fullscreen writers. A passing run establishes acceptance only for those declared workloads, host, and bounds; it does not prove which phase dominates any other application or machine. Historical machine-local measurements are not a general performance SLA.

Yoga stays the layout engine. It is already a dependency, handles the flex semantics the public `Box` contract promises, and no measured workload has shown its cost dominating. Replacing it would need a representative failure that profiling attributes to layout specifically.

## When to reopen this work

Reopen the performance architecture when at least one of these is true:

- a deterministic journey from an active scenario misses a defined frame-time or input-latency budget;
- profiling shows material CPU time, allocation or garbage collection, output bytes or write count, event-loop delay, or sustained stream backpressure;
- a small visible update scales with total mounted nodes or viewport area enough to block a real application;
- a required scenario cannot be made correct with the current full-paint or non-virtualized model.

Preserve and rerun the committed J1–J6 harnesses before changing architecture. Record the journey metrics, host, repetitions, estimator, raw artifact, and ownership-release evidence from that rerun rather than copying a historical number. Then change only the phase the measurement actually blames, and remeasure after each step.
