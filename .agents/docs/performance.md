# Renderer performance

> **Status:** parked. Performance work reopens only on a recorded representative failure, and the trigger conditions below are the whole current contract. The earlier cost model, pipeline walkthrough, candidate dirty-span architecture, native-core upper bound, and per-scenario implications were speculation about a failure that has not happened; they remain in git history rather than reading as a plan.

## Current decision

Performance optimization is not a current product priority. [VOUCHED @hyfdev 2026-07-10]

Do not start a renderer rewrite, replace the layout engine, add a native runtime requirement, or schedule speculative optimization from this record alone.

The in-repository [Runtime benchmark workspace](../../benchmarks/runtime) contains representative stable-size Inline transcript, Fullscreen table, and nested-pane updates. Vitest owns warmup, sampling, statistics, filtering, and failure reporting; the fixtures only mount and update those workloads through the official testing host. Results compare those declared workloads on the measured host; they are not an acceptance gate, a general performance SLA, or evidence that any one renderer phase dominates another application or machine.

Yoga stays the layout engine. It is already a dependency, handles the flex semantics the public `Box` contract promises, and no measured workload has shown its cost dominating. Replacing it would need a representative failure that profiling attributes to layout specifically.

## When to reopen this work

Reopen the performance architecture when at least one of these is true:

- a deterministic journey from an active scenario misses a defined frame-time or input-latency budget;
- profiling shows material CPU time, allocation or garbage collection, output bytes or write count, event-loop delay, or sustained stream backpressure;
- a small visible update scales with total mounted nodes or viewport area enough to block a real application;
- a required scenario cannot be made correct with the current full-paint or non-virtualized model.

Preserve and rerun the committed benchmarks before changing architecture. Record the workload, host, Vitest version, and raw benchmark report from that rerun rather than copying a historical number. Then change only the phase the measurement actually blames, and remeasure after each step.
