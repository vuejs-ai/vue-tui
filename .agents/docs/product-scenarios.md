# Product work priority

The [product intent](./intent.md) defines vue-tui's purpose, workload priority, rendering-mode direction, and boundaries. This record defines what counts as product evidence and how competing framework work is prioritized.

## Active application scenarios

For product-evidence purposes, an active application scenario is a reproducible journey from a complex interactive terminal application or a real consumer. Scenario names are not product verticals, a permanent ranking, or a component roadmap. What matters is the generic framework responsibility exposed by the journey.

## Qualifying evidence

Useful evidence identifies the user action, visible result, failure, terminal host or rendering mode, and the framework responsibility that is missing or incorrect. Before accepting work, establish that:

1. the problem belongs to a terminal UI framework rather than application-domain logic;
2. the public contract can remain generic;
3. the proposed package owns the behavior; and
4. the result can be verified at the appropriate layer, including a real PTY when the claim concerns the visible terminal or terminal lifecycle.

Package admission is deliberately separate. Runtime candidates follow the [reusable Runtime rule](./intent.md#reusable-runtime-behavior). Higher-level visual components follow the [`@vue-tui/components` inclusion bar](./components-design-principles.md#inclusion-bar--product-driven-and-evidence-backed). Independent headless behavior and official tooling follow the ownership test in [package layers](./package-layers.md).

## How product work is prioritized

[VOUCHED @hyfdev 2026-08-29]

Product work must address a reproducible problem that belongs to the framework. Among such problems, prioritize work that severely blocks complex interactive terminal applications or benefits multiple applications. Real consumers, representative workloads, repeated implementations, and test failures are all valid evidence; evidence sources have no fixed ranking. Work that affects only simple workloads has lower priority unless it exposes a correctness failure in shared foundations.

## Current evidence

The first-party [coding-agent example](https://github.com/vuejs-ai/vue-tui/tree/3e44c9a266e52ebeba2db669b4bb96521b9e2f3a/examples/coding-agent) exercises streaming, tool execution, approval, and Inline `Static` output. It is one demanding representative workload; its application-specific agent behavior does not define vue-tui's product scope. Future examples and real consumers may supply stronger evidence without becoming new product categories.
