# Renderer performance

> **Status:** parked architecture research, not a current optimization plan. The implementation observations and proposed mechanisms below are unstamped and must be rechecked against the code and representative workloads before they drive a change.

## Current decision

Performance optimization is not a current product priority. [VOUCHED @hyf0 2026-07-10]

Do not start a renderer rewrite, replace the layout engine, add a native runtime requirement, or schedule speculative optimization from this record alone. Current product work should first establish representative journeys, public APIs, components, composables, and correctness across the [active application scenarios](./product-scenarios.md#active-application-scenarios).

Revisit performance when a representative journey exposes a measurable limit. At that point this record supplies hypotheses, candidate mechanisms, and a benchmark plan; it does not predetermine the implementation.

The active [Runtime foundation closure](./runtime-foundation-closure.md) now supplies the first finite representative workload set. Measuring those fixed journeys is required closure evidence, not a decision to optimize: if they meet their predeclared correctness, responsiveness, resource, ordering, and restoration bounds, accept the current full-render architecture and keep the mechanisms below parked.

## First-principles cost model

An interactive terminal renderer operates across three domains that must remain consistent:

- Vue-driven state and a retained component and host tree;
- a visible grid of terminal cells, plus main-screen scrollback that cannot be edited arbitrarily once it has scrolled away;
- an ordered, backpressured byte stream of cursor moves, style changes, text, and terminal control sequences.

In this record, `dirty` means invalidated state that must be reconsidered, and `damage` means visible cell spans whose previous content may need to be reconstructed.

For a small state change, necessary work should tend to scale with the affected reactive state, the affected layout dependency paths, the damaged visible cells, and the terminal runs that must actually be emitted. It should not scale with every mounted node or every cell in the viewport unless the change really invalidates them.

| Stage                  | Desired incremental behavior                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Vue update             | Coalesce related mutations into one desired frame.                                                                             |
| Layout                 | Recalculate only dirty nodes and dependent ancestors or descendants; distinguish paint-only changes from geometry changes.     |
| Composition            | Repaint the old and new bounds of changed content and any overlapping content needed to reconstruct those cells.               |
| Diff and ANSI encoding | Compare only damaged row spans, merge adjacent changed cells into runs, and avoid redundant cursor and style sequences.        |
| Output                 | Preserve byte order, perform as few writes as practical, and coalesce future desired frames while the stream is backpressured. |

This is a mechanism goal, not a promise that every update can be proportional to one changed cell. Text reflow, flex redistribution, resizing, overlap, transparency, and terminal restoration can legitimately enlarge the affected region or require a full-frame fallback.

## Current vue-tui pipeline

The current runtime already has a retained Vue host tree and a scheduler that coalesces host mutations before calling the [render commit](../../packages/runtime/src/render.ts). Within each commit it then:

1. searches the host tree for pending `Static` output;
2. asks Yoga to calculate layout through the content guard;
3. emits layout listeners;
4. walks the dynamic host tree to generate paint operations;
5. creates a new object-based cell grid for the full output dimensions, applies the operations, and converts every row back into an ANSI string;
6. compares or rewrites that frame through the selected terminal writer.

The main implementation consequences are:

- [`paint()` and `Output.get()`](../../packages/runtime/src/paint/paint.ts) still perform full-tree paint and full-grid allocation and stringification for each dynamic frame. The tokenization and width caches belong to that newly created `Output`, so they do not survive across frames.
- [`incrementalRendering`](../../packages/runtime/src/render.ts) defaults to `false` and controls the relative Inline writer. Fullscreen automatically replaces changed rows through absolute addressing after a valid baseline, independently of this option. Both writers receive the already completed frame string, so neither reduces layout or paint work.
- [`paintDirty`](../../packages/runtime/src/host/nodes.ts) exists on box nodes but is not consumed by the painter. The Yoga binding writes `measuredCache` in [`bindTextMeasure`](../../packages/runtime/src/host/yoga.ts), but current code does not read it as a cross-frame text measurement cache.
- The [zero-content guard](../../packages/runtime/src/host/layout-guards.ts) and [`Static` discovery](../../packages/runtime/src/paint/static-channel.ts) traverse the host tree on every commit.
- [`ScrollBox`](../../packages/components/src/scroll-box/scroll-box.vue) mounts its complete content and scrolls by applying a negative top margin. It clips paint but does not virtualize layout or mounted nodes.
- Runtime-owned output now uses one ordered transaction gate. After Node `Writable.write()` returns `false`, no later segment is handed before `drain`; future render work keeps only the latest desired replaceable frame, while a public coordinated call made during the blocked epoch reports non-acceptance instead of entering a byte queue. Full layout and paint can still run before the gate rejects a frame attempt, so sustained slow-output CPU remains measurable even though output memory is bounded.
- `onRender.renderTime` is sampled before interactive frame diff and output. It is useful for part of the pipeline, but it is not an end-to-end frame or input-latency metric.

Yoga may still skip internal layout work through its own dirty and cache mechanisms even though `calculateLayout()` is called. The present architecture concern is that vue-tui performs the later tree walk, grid construction, and string generation regardless of how little geometry or visible output changed.

## Research evidence boundary

A one-time local probe informed the hypotheses in this record, but its harness was not committed and `onRender.renderTime` excludes interactive frame diff and output. Its exact values are intentionally omitted because they are not durable benchmark evidence and cannot support an implementation decision.

The source establishes that line diff can reduce emitted output only after the full frame has been built, while full paint and cell allocation still happen for an unchanged visible result. It does not establish which phase dominates on supported machines or real applications. Recreate the measurements through the committed scenario benchmarks below before comparing costs or setting a budget.

## Implications by product scenario

| Scenario                               | Current shape                                                                                                    | Limit worth watching                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline conversational application      | `Static` can move completed transcript items out of the changing region, keeping the live tail relatively small. | Long changing Markdown, code, tool output, or an application that retains its whole transcript in the dynamic tree.                                                                |
| Full-screen conversational application | A fixed viewport makes cell diff useful.                                                                         | Long transcripts remain fully mounted in `ScrollBox`; search, selection, reflow, and streaming can still layout and paint far more than is visible.                                |
| Real-time monitor                      | Ordinary dashboards with tens of rows can be inexpensive enough, and line diff avoids much output.               | A sparse metric update still produces a full paint; high update rates, large tables, or slow output streams amplify the cost.                                                      |
| Multi-region workbench                 | Vue and Yoga are a good fit for independently composed panes.                                                    | Several large or frequently changing panes compound full-tree paint and allocation. Measured failures may require application/component windowing.                                 |
| Terminal workspace pane                | vue-tui can own pane bounds, focus, input routing, and surrounding UI.                                           | An externally emulated terminal must enter as a coarse styled-cell surface with dirty rows; representing every terminal cell as a Vue/Yoga node would create the wrong cost model. |

These implications do not choose inline or full-screen as the primary rendering mode. They expose different terminal constraints that should share a core renderer where honest and use different rendering-mode behavior where necessary.

## Layout-engine assessment

Yoga is a sound current choice for vue-tui's flexbox-oriented public layout model. Its [incremental layout contract](https://github.com/facebook/yoga/blob/b58c0463281d000725d7fb595210a53762582b2e/website/docs/advanced/incremental-layout.mdx#L8-L83) includes dirty propagation, cached layout and measurement results, and `HasNewLayout`/`MarkLayoutSeen` traversal guidance. The current vue-tui integration should be profiled and made to use those signals before a replacement is considered.

Keep Yoga behind a layout adapter so its integration can evolve without making its node API part of vue-tui's product contract. A future layout change should start from required layout semantics or measured cost:

- Replacing Yoga with [Taffy](https://github.com/DioxusLabs/taffy/blob/c4c7d09fe4ca2bd5109e976ed31a3d4e763b979d/README.md#L13-L17) could be justified by a product need for Grid or Block layout, but Taffy's own [comparison notes](https://github.com/DioxusLabs/taffy/blob/c4c7d09fe4ca2bd5109e976ed31a3d4e763b979d/README.md#L103-L120) do not establish it as a universal speed upgrade and its cross-language bindings are less mature.
- Moving layout alone to Rust, Zig, or another native core would leave the current full-tree paint, object-grid allocation, string generation, and output behavior intact.
- OpenTUI is useful prior art for retained renderables and native cell diff; it is not a proposed migration target.

The current research therefore supports keeping Yoga and investigating the rest of the frame pipeline first if performance work is eventually triggered.

## What the linked Claude Code reconstruction demonstrates

The inspected [`tanbiralam/claude-code` tree at `6f6f12b`](https://github.com/tanbiralam/claude-code/tree/6f6f12b37f529488b10e53928dd5508bb93535c7) is useful mechanism prior art, not authoritative Claude Code documentation. Its [README describes recovery from source-map leaks](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/README.md#L1-L15), [documents no-op stubs for missing modules](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/README.md#L62-L66), and attributes the original code to Anthropic rather than authenticating this repository as official. The pinned tree provides no trustworthy benchmark harness and no license that would authorize copying its implementation. Use it to form hypotheses only.

Compared with the current vue-tui pipeline, that tree combines several stronger mechanisms:

- [dirty state propagates](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/src/ink/dom.ts#L389-L413) through a retained render tree;
- [clean subtrees can be copied](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/src/ink/render-node-to-output.ts#L452-L481) from the previous screen instead of repainted;
- front and back frames use [reusable packed cell arrays](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/src/ink/screen.ts#L332-L383) and [interned character and style data](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/src/ink/screen.ts#L15-L162) rather than allocating a fresh object per cell;
- [viewport culling](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/src/ink/render-node-to-output.ts#L1371-L1447) and [scroll-specific screen reuse](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/src/ink/render-node-to-output.ts#L885-L955) reduce work for long content;
- [cell comparison is bounded by recorded damage](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/src/ink/screen.ts#L1149-L1206).

It still uses Yoga semantics through a limited TypeScript implementation, so it is not evidence that removing Yoga is the source of its advantage. Its rendering is also not strictly proportional to changed cells: for example, [a screen-copy operation expands one bounding-box damage region](https://github.com/tanbiralam/claude-code/blob/6f6f12b37f529488b10e53928dd5508bb93535c7/src/ink/screen.ts#L849-L923), while subtree copies and resets have their own costs. The defensible conclusion is that its retained cell and damage mechanisms are more appropriate for demanding TUI workloads, not that its exact renderer should be copied.

## Prior-art mechanisms that matter

- [Ratatui](https://github.com/ratatui/ratatui/blob/de5168de6ba2f4b310565c287764f213f249a61f/ratatui-core/src/terminal/buffers.rs#L97-L123) demonstrates the simple reliable baseline: build a next cell buffer, compare it with the previous buffer, and emit changed cells. It still scans the full buffer.
- [Textual](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/src/textual/_compositor.py#L1096-L1185) merges dirty rectangles into horizontal spans and renders those spans, with additional row-level caches. This is closer to the desired behavior for large documents, tables, and local updates.
- [Notcurses](https://github.com/dankamongmen/notcurses/blob/b26048eebc74d5d254717d3332fa484718f9efe6/doc/HACKING.md#L86-L224) shows why overlapping planes, transparency, last-frame state, damage, and strictly ordered output belong to one compositor design.
- [OpenTUI's retained tree](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/Renderable.ts#L1768-L1849) and [native cell diff](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/zig/renderer.zig#L1323-L1585) reduce JavaScript allocation and ANSI-encoding cost, but native code does not by itself remove broad paint or scan work.
- [Ghostty's terminal render state](https://github.com/ghostty-org/ghostty/blob/3f2b7946d7362419186fa87d4f7c3aa80cfdeba8/src/terminal/render.zig#L25-L35) exposes full or dirty-row updates. That is the appropriate boundary for a terminal-emulator surface inside a workbench.

## Candidate architecture if evidence triggers performance work

```text
Vue retained host tree
        │
        ├── layoutDirty ──> incremental Yoga ──> old/new bounds
        ├── paintDirty ───> damage collection
        └── hitDirty ─────> hit-map update
                                      │
                                      ▼
                   text / primitive / cell surfaces
                                      │
                                      ▼
                     reusable packed next-cell buffer
                                      │
                       diff damaged row spans only
                                      │
                                      ▼
                 cursor/style-aware ANSI run encoder
                                      │
                                      ▼
                   one ordered backpressure-aware write
```

The candidate mechanisms are:

1. Mark `layoutDirty`, `paintDirty`, and `hitDirty` separately at host mutations and propagate only the invalidation each ancestor needs.
2. Run Yoga only for geometry changes or terminal resize, use its dirty and new-layout signals, and record both old and new integer cell bounds.
3. Turn text and primitives into paint runs or surfaces. Keep styled text as graphemes plus interned style and link identifiers until the final ANSI encoder instead of using ANSI strings as the intermediate scene representation.
4. Reuse packed front and next cell buffers. A cell needs a grapheme identifier, foreground and background identifiers, attributes, hyperlink identifier, width or continuation state, and any compositor metadata required by real features.
5. Represent damage as one or more `[x1, x2)` spans per terminal row. Repaint old and new bounds; when overlap, transparency, or clipping makes reconstruction uncertain, recompose every intersecting layer or fall back to a larger safe region.
6. Compare front and next cells inside damage even when a node is dirty, then group adjacent changed cells into output runs. Choose between printing cells and moving the cursor based on actual encoded cost while tracking current cursor, colors, attributes, and hyperlink state.
7. Generate at most one frame per Vue flush or frame interval. If stdout is backpressured, preserve the ordered committed baseline and coalesce not-yet-rendered state into the latest desired frame rather than queueing every obsolete frame.
8. Virtualize long lists, tables, logs, and transcript views so layout and paint see the visible range plus a small bounded buffer of nearby items instead of every item.
9. Add a coarse styled-cell surface only when a real consumer establishes the API. An external terminal emulator should submit changed rows or rectangles in batches; it should never cross the Vue or native boundary once per cell.

### Inline and full-screen rendering modes

Both modes can share host nodes, incremental layout, primitives, cell buffers, damage tracking, and ANSI encoding, but they cannot share every output assumption:

- **Inline:** treat completed transcript output as append-only main-screen content and manage only the live region that remains addressable. When resize makes the old physical row mapping untrustworthy, leave that snapshot untouched, establish a fresh bounded region at the terminal bottom, and only erase rows owned by the new region.
- **Full-screen:** treat the alternate screen as a fixed addressable viewport. Ordinary consecutive frames currently replace changed absolute rows, while lifecycle and uncertain-output boundaries repaint the complete viewport. A later implementation may use terminal scrolling regions for large vertical shifts when capability detection and correctness evidence justify it.

The mode-specific writer is an internal architecture boundary, not evidence that either mode should become the product default.

## Native upper bound

Only introduce a native core after profiling shows that JavaScript cell composition, diff, ANSI encoding, or output coordination remains a bottleneck after the incremental mechanisms above are correct.

The useful boundary would be coarse-grained: Vue submits a batch of host mutations or paint commands once per frame, while the native core owns layout or measurement only if needed, persistent cell buffers, composition, damage, diff, ANSI encoding, and output state. Avoid crossing the JavaScript/native boundary once per node or cell. Vue should continue to own component authoring, reactivity, lifecycle, public components and composables, and application state.

A native implementation can reduce constants and garbage collection; it cannot repair a full-work algorithm merely by moving that work to another language.

## When to reopen this work

Reopen the performance architecture when at least one of these is true:

- a deterministic journey from an active scenario misses a defined frame-time or input-latency budget;
- profiling shows material CPU time, allocation or garbage collection, output bytes or write count, event-loop delay, or sustained stream backpressure;
- a small visible update scales with total mounted nodes or viewport area enough to block a real application;
- a required scenario cannot be made correct with the current full-paint or non-virtualized model.

Before changing architecture, preserve deterministic harnesses for the fixed J1 through J6 workloads in [Runtime foundation closure](./runtime-foundation-closure.md#fixed-journeys-and-workloads): an Inline conversational transcript and finder, a Fullscreen long document, a sparse monitor, a multi-pane workbench, and deliberately slow Inline and Fullscreen writers. Those workloads supersede the earlier speculative requirement for a pre-virtualized collection or public styled-cell surface; neither mechanism is a prerequisite to measuring or accepting the current architecture.

Measure end-to-end frame work, input latency, event-loop delay, retained memory, output order, write pressure, final visibility, and restoration. Add counters for layout nodes, measured text, painted or diffed cells, row spans, allocations, or emitted bytes only when a failed external bound needs diagnosis. The closure question is whether every fixed journey meets its declared product-level bounds. Work proportional to the affected area remains a useful optimization hypothesis and future reopen trigger, not a current acceptance requirement.

If the benchmarks establish a problem, implement in this order and measure after each step:

1. add phase instrumentation and preserve the scenario benchmarks;
2. improve output line diff defaults, write aggregation, and backpressure handling where evidence supports it;
3. introduce reusable packed cell buffers, full cell diff, and changed-run ANSI encoding;
4. add dirty row spans, old/new-bounds damage, and stable-subtree paint reuse;
5. add virtualization, a coarse cell-surface primitive, and safe hardware-scroll paths as required by scenarios;
6. consider a native core only if the remaining measured cost justifies the portability and maintenance burden.

## Explicit non-decisions

This research does not decide to:

- optimize performance now;
- replace Yoga or add Grid layout;
- migrate vue-tui to OpenTUI or another renderer;
- copy the linked Claude Code reconstruction;
- add a native runtime dependency;
- publish a terminal-cell-surface API;
- choose inline or full-screen as the primary product mode;
- promise a benchmark threshold or performance roadmap before representative journeys exist.
