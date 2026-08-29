# Product priorities and evidence

The [product intent](./intent.md) defines vue-tui's purpose, workload priority, rendering-mode direction, and boundaries. This record defines what counts as product evidence and how competing framework work is prioritized.

## Qualifying evidence

A representative journey from a complex interactive terminal application or a real consumer can supply product evidence. Useful evidence identifies the user action, visible result, failure, terminal host or rendering mode, and the framework responsibility that is missing or incorrect. Before accepting work, establish that:

1. the problem belongs to a terminal UI framework rather than application-domain logic;
2. the public contract can remain generic;
3. the proposed package owns the behavior; and
4. the result can be verified at the appropriate layer, including a real PTY when the claim concerns the visible terminal or terminal lifecycle.

Product intent applies across all vue-tui packages and official tooling. Once a problem qualifies as product work, package placement and package-specific admission remain separate: behavior that requires Runtime ownership follows the [reusable Runtime direction](./intent.md#reusable-runtime-behavior), higher-level visual components follow the [`@vue-tui/components` inclusion bar](./components-api-design.md#inclusion-bar--product-driven-and-evidence-backed), and independent headless behavior and official tooling follow the ownership test in [package architecture](./package-architecture.md).

## How product work is prioritized

[VOUCHED @hyfdev 2026-08-29]

Product work must address a reproducible problem that belongs to the framework. Among such problems, prioritize work that severely blocks complex interactive terminal applications or benefits multiple applications. Real consumers, representative workloads, repeated implementations, and test failures are all valid evidence; evidence sources have no fixed ranking. Work that affects only simple workloads has lower priority unless it exposes a correctness failure in shared foundations.
