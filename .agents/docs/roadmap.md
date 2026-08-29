# Product roadmap

This record orders current product work. [Product intent](./intent.md) owns what vue-tui is trying to become, [package architecture](./package-architecture.md) owns where reusable behavior belongs, and [TODOs](./todos.md) retain concrete follow-ups. This roadmap does not define release dates or a predetermined feature catalog; update it when the current work sequence changes.

## Now — make the current foundation dependable toward 1.0

The default near-term work is to fix reproducible correctness gaps in the current rendering, input, layout, live-update, and terminal-lifecycle contracts; complete the remaining public API documentation and component-template type verification in [TODOs](./todos.md); and keep the official HMR, testing, starter, and production-build paths reliable.

A problem that severely blocks a complex interactive terminal application can take priority over this sequence. Simpler and non-interactive uses remain supported, but they do not set the product order ahead of such a blocker.

## Continuing — learn from complex applications

Real consumers and representative complex applications supply the evidence for new product work. They should exercise layout, input, continuous updates, terminal lifecycle, development, testing, and production use together. They are evidence sources, not application categories or a component roadmap.

Candidates enter through the [product-work rule](./intent.md#product-work). Peer comparisons follow the [peer-framework policy](./peer-frameworks.md) after a local problem is established; they do not supply the work queue.

## Next — turn proven needs into reusable capabilities

When evidence establishes a reusable need, apply [package architecture](./package-architecture.md) and the owning package's admission rule. Prefer building through supported public Runtime APIs; add a Runtime capability only when correct behavior requires Runtime ownership. Package placement does not determine product priority.

## Outside the current roadmap

Performance work is not currently planned. If it becomes a product priority later, define the problem and plan again from the evidence available at that time.
