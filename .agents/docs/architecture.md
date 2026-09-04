# Runtime architecture

This record owns the **internal** structure of `@vue-tui/runtime`: which units exist, what data crosses each boundary, which entity owns which responsibility, and why the lines are where they are. It describes the target structure; where the code still diverges from it, [TODOs — architecture](./todos-architecture.md) lists the concrete work that closes the gap. Judgments Yunfei expressed about this structure live in the [architecture decision ledger](./architecture-decisions.md).

Neighbouring records own their own subjects and are not restated here:

| Subject                                                     | Record                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Boundaries **between** packages and the placement test      | [Package architecture](./package-architecture.md)                                      |
| Inline / Fullscreen / document host contracts               | [Rendering modes](./rendering-modes.md)                                                |
| The public `@vue-tui/runtime` contract and accepted rulings | [Runtime API design](./runtime-api-design.md), [decisions](./runtime-api-decisions.md) |
| Dev-server process model and HMR                            | [HMR architecture](./hmr-architecture.md)                                              |

## Vocabulary

Terms this record uses that are not self-evident.

| Term                           | Meaning                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lease**                      | A paired acquire/release. Raw mode, the alternate screen, cursor visibility, synchronized output, bracketed paste and the Kitty protocol are switches on the **whole terminal window**, so every acquisition needs a defined release. |
| **InputSequence / InputEvent** | The former is one complete but unparsed piece of input (an escape sequence, a run of text, a paste); the latter is the structured fact after normalization.                                                                           |

## The shape of the system

A terminal UI framework is a rendering engine whose device unit is a character cell rather than a pixel. It has a browser engine's shape — tree, layout, paint, composite, device — and two paths run through it in opposite directions.

### The render path

One commit runs top to bottom. Each arrow is labelled with what crosses it; nothing else does.

```text
  Vue component tree
    │   node creation, insertion, prop updates
    ▼
  host/       the node tree
    │   tree + available size
    ▼
  layout/     ComputedLayout — every node's rectangle, plus the wrapped
    │         lines measurement produced
    │   tree + ComputedLayout + viewport
    ▼
  paint/      Frame — one screen's worth of cells
    │   Frame
    ▼
  surface/    compared against this surface's own previous frame,
    │         then encoded
    │   bytes
    ▼
  terminal/   the device
```

`Session` drives this loop: one commit is layout, then paint, then present. It is the only thing that touches every stage, which is what assembling means.

`Static` runs the same path on its own roots. The layout transaction lays out each open `Static` block as an independent root, the painter paints it to its own `Frame`, and the surface writes it as history before the dynamic frame; Inline and Document accept it, Fullscreen rejects it. A block is accepted once its write returned normally and is irreversible from then on. A block whose transaction was refused before it wrote stays open for a later commit; a block whose write failed after it began is abandoned and never retried, because the terminal may already hold part of it.

### The input path

The same layers in the opposite direction. Each stage names its output.

```text
  terminal/   the device
    │   bytes
    ▼
  input/      SharedInputIngress → decoded text with partial UTF-8 retained
    │         InputParser       → InputSequence, one complete sequence
    │         normalization     → InputEvent, the structured fact
    │         InputDispatcher   → delivery to active subscriptions
    │   (Session joins the backend, ingress and dispatcher; vue/ subscribes)
    ▼
  vue/        useInput         → TuiInputEvent
```

Two facts fall out of the shape rather than out of policy. The render path never reads input, so a frame cannot depend on an event mid-commit. `InputDispatcher` holds no reference to the node tree, so anything that has to resolve an event against the tree sits in `Session` rather than in the dispatcher. Focus is one such responsibility.

### Units and what they may import

Each directory may import only what its row lists, and the direction is strictly downward. In the **May import** column `vue` always means the npm package; a directory is written with its slash.

The render and input stages, in pipeline order:

| Directory   | Owns                                                                                                                                               | May import                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `host/`     | Node types. No engine handle on the node, no Vue import                                                                                            | —                                              |
| `layout/`   | `LayoutEngine`, `ComputedLayout`, `Rect`                                                                                                           | `host/`, `text/`, `frame/`                     |
| `paint/`    | `Painter`: tree + `ComputedLayout` + viewport → `Frame`                                                                                            | `host/`, `layout/`, `text/`, `frame/`          |
| `surface/`  | `InlineSurface`, `FullscreenSurface`, `DocumentSurface`, each holding its own previous frame; the Frame → ANSI encoder                             | `terminal/`, `frame/`                          |
| `input/`    | Shared byte ingress, `InputParser`, `InputSequence`, `InputEvent`, `InputDispatcher`                                                               | `terminal/`                                    |
| `terminal/` | The `TerminalBackend` interface plus its node and test implementations, mode leases, capabilities, size, backpressure, the output transaction gate | nothing (`terminal/node/` may import `node:*`) |

Shared data and utilities, on no stage of their own:

| Directory | Owns                                                                                                                  | May import |
| --------- | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| `frame/`  | `Cell`, `Style`, `Frame`, `diff`, and the resolved colour capability. **No encoding**                                 | —          |
| `text/`   | Measurement, wrapping, and parsing user strings (including ANSI) into styled runs, produced once per content revision | `frame/`   |

Above both paths:

| Directory  | Owns                                                                                                                                             | May import                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `api/`     | Package entries: `createApp`, `MountOptions`, `renderToString`, the two `internal/*` seams                                                       | everything, plus `node:stream` as types only                                              |
| `dev/`     | `DevSession`, the HMR bridge, the development error overlay, the in-process session-ownership registry                                           | `session/`, `vue/`, `vue`                                                                 |
| `session/` | `Session`: assembly, commit scheduling, the lifecycle state machine, focus ownership, geometry registration                                      | everything below, plus `vue/` and `vue`                                                   |
| `vue/`     | `Box` / `Text` / `Static`, composables, the injection keys, the Vue custom-renderer node operations, and leaf helpers that `session/` also needs | `host/`, `layout/`, `frame/`, `input/`, `vue`, `session/` and `node:stream` as types only |

`paint/` may not import `terminal/` or `surface/`, so painting has no route by which to emit an escape sequence. `surface/` may not import `host/`, so a surface has no route by which to read node props. The colour capability each host resolves lives in `frame/` because the encoder degrades to it and `surface/` may import `frame/`; `terminal/` cannot hold it, since that row may import nothing and the capability is derived from the public `ColorProfile`.

`session/` sits above `vue/` because it builds the Vue renderer out of `vue/`'s node operations. The composables need what the session provides, but they reach it through injection keys rather than by importing it, so `vue/` owns the keys and needs `session/` for types alone. Both directions as values would be a cycle.

A leaf both of them need lives in the lower one. Coercing an unknown thrown value into a message is wanted by the composables that catch application handlers and by the session that catches mount and teardown failures, so it sits in `vue/`. This applies to a chain, not to the tree at large: `layout/` and `paint/` are incomparable, and what they share is why `text/` and `frame/` exist as units of their own.

## Scheduling

A commit is synchronous and runs after Vue's flush, as a post-flush callback, so it sees the tree settled; input arrives on the stream's data path between commits and is never delivered inside one. Commits are throttled to a frame budget with leading, trailing and maximum-wait edges: the first change commits at once, later changes re-arm one trailing commit, and sustained change commits at the budget's cadence rather than waiting for quiet. Not every commit comes through the throttle: a resize or continuation cancels the pending commit, lets Vue consumers see the new size, then runs one authoritative commit, and teardown runs a final one. Input that arrives before mount has activated delivery is held and delivered in order at activation, and dropped instead if no subscription is listening by then; input that arrives while the terminal is suspended is not delivered, because the input resources are released. What each surface does on resize, suspension and console output is the subject of [Rendering modes](./rendering-modes.md).

## Data structures

These are plain data: they hold no resources, perform no I/O, and can be tested without a terminal.

### `Cell` — one character cell

A grapheme, its display width, and its style. **Style is stored inline**, not in a dedup table: a per-frame table makes indices incomparable across frames, which breaks integer `diff`; a per-session table has an unbounded key space once truecolor and arbitrary OSC 8 links are in play, so a log viewer that hyperlinks every row grows it forever. Ratatui's `Cell` stores `fg`, `bg` and `modifier` inline for the same reason.

| Field       | Content                                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fg` / `bg` | Structured colour (default / 16 / 256 / truecolor). Degradation to the resolved colour level is a pure function in the encoder; the painter does not know the level.                                                                        |
| `attrs`     | Bitmask over the structured SGR attributes, including 1–9 and 53: bold, dim, italic, underline, blink, rapid blink, inverse, conceal, strikethrough and overline. Room for further attributes at one bit each.                              |
| `extraSgr`  | Ordered active SGR pairs that have no structured field. This exact fallback preserves authored terminal attributes until a product decision promotes one into `attrs` or deliberately stops supporting it.                                  |
| `link`      | The OSC 8 hyperlink target, nullable. **Required**: `text/sanitize-ansi.ts` preserves OSC 8 end to end, the hyperlink cases in `tests/text/sanitize-ansi.test.ts` pin that, and `text/text-measure.ts` accounts for its zero visible width. |

`@alcalzone/ansi-tokenize` 0.3.0 pairs SGR 1–4, 7–9 and 53 with their dedicated off codes and carries other numeric SGR with the generic reset. Runtime assigns family-specific terminators to 5, 6, 21, underline colours and complete colon forms. Numeric and colon-form attributes without a structured field remain ordered in `extraSgr`, including framed text, superscript, alternate fonts and styled underlines.

### `Frame` — one rendered picture

Plain data holding one picture's worth of cells, plus its size. Four properties matter; the memory layout that satisfies them belongs to the change that writes it, measured with `benchmarks/runtime/renderer.bench.ts`.

- Two frames are alive at once, the current one and the previous one. The shared `blankCell` in `paint/paint.ts` exists to avoid one object per cell per frame at that scale, and a naive object grid reintroduces exactly what it avoids.
- `diff` is **the only place in the system that answers "what changed"**. Inline uses the answer only to skip an unchanged frame and otherwise rewrites its whole region; Fullscreen is the only surface that replaces rows; Document never asks, because it appends history and writes one final frame.
- Clipping a region is index arithmetic, not ANSI-aware string slicing.
- A `Frame` does **not** turn itself into bytes. The encoder belongs to `surface/`, which is what makes the encoding boundary below enforceable: `frame/` is importable by everyone, so an encoder living there would have no boundary to guard.

### `ComputedLayout` — the complete product of one layout pass

Every node's rectangle and its resolved border and padding insets, whether the node is laid out at all, **and the wrapped lines measurement already produced**. `paint/paint.ts` reads all four from `ComputedLayout`; nothing outside `layout/` holds a Yoga node.

The [layout transaction boundary](./rendering-modes.md#layout-transaction-boundary) is vouched direction and already requires that "the layout system must return final geometry for every output region", with intermediate geometry forbidden from escaping into renderer control flow. Wrapped lines are part of that geometry: `layout/yoga.ts`'s measure callback already produces them and caches per `(revision, available width, width mode, wrap)`, and `60e96fd` (fixing #283) exists to make measurement and painting share one conservative whole-cell budget. A `ComputedLayout` of rectangles alone forces the painter to wrap a second time, so the two budgets diverge again — which is what #283 was. `tests/layout/layout-transaction/single-pass-text-measurement.test.ts` asserts `layoutCalls === 1`.

Wrapping and measurement therefore live in `text/`, which both `layout/` and `paint/` may import. They cannot live in the painter: the dependency direction forbids `layout/` from importing `paint/`, so a painter-owned wrapper could never serve the layout pass.

Visibility is the one fact read live rather than from the snapshot. `layout/` exports `isHiddenByApplication`, which walks up from a node for an authored `display: none` and skips nodes a zero-content guard collapsed for the current pass. Focus asks it because a boundary can be hidden before the first layout pass has run and while the surface is suspended, when no pass runs to refresh a snapshot.

### `InputEvent` — one input fact

The input path has four distinct things, and each has its own name.

| Stage                            | Name            | What it is                                                                                                                                                |
| -------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decoded text → complete sequence | `InputParser`   | Holds a half-received escape sequence and emits complete ones. A character-classifying state machine with a `"pending"` state and no regular expressions. |
| One complete sequence            | `InputSequence` | `string \| { paste: string }` — a piece of text, not an event.                                                                                            |
| The normalized fact              | `InputEvent`    | `{ kind: "key" \| "text" \| "paste", … }`.                                                                                                                |
| The public projection            | `TuiInputEvent` | What `useInput` delivers. Accepted contract; unchanged.                                                                                                   |

## Entities

Every entity works within one layer, with one deliberate exception: `Session` is the assembly point, and spanning layers is what assembling means.

| Entity               | Owns                                                                                                                                                                            | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TerminalBackend`    | The byte channel, raw mode, alternate screen, cursor, synchronized output, bracketed paste, Kitty protocol, size, capabilities, backpressure                                    | Sends and receives bytes and lends terminal modes. `write` / `onData` / `size` / `onResize` / `capabilities` plus mode leases. **It knows nothing about cells, Inline, or Fullscreen**; Node streams are one implementation's construction detail.                                                                                                                                                                                                                                                                                                                                          |
| `OutputCoordinator`  | The output gate: coordinated writes to stdout and stderr, one transaction at a time                                                                                             | A transaction is a group of writes handed to the stream in order with no other transaction's writes between them; a failure drops the unhanded remainder and reports the transaction failed. A presented frame, a console line and a coordinated mode change are each one transaction. Synchronous restoration on the signal and failure paths writes directly and aborts the owning transaction first; direct writes by the application to its own streams are outside coordination. This is the structural form of the [one-writer invariant](./hmr-architecture.md#governing-invariant). |
| `Surface`            | The previous frame, the comparison strategy, the region, history handoff, external-output interleaving                                                                          | Takes a new `Frame` and decides which operations to issue. Three implementations, not three sets of conditionals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `LayoutEngine`       | The layout engine and its memory                                                                                                                                                | Tree plus available size produces `ComputedLayout`. **The only place that imports the engine.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Painter`            | Nothing                                                                                                                                                                         | Tree + `ComputedLayout` + viewport → `Frame`. No I/O, no strings. It reads each text node's parsed runs and the wrapped lines in `ComputedLayout`, and holds no cache.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `SharedInputIngress` | Partial UTF-8 bytes, terminal-response framing and parser coordination                                                                                                          | Backend bytes → decoded text → `InputSequence` → `InputEvent`; captures each session's route when a fact begins, then hands the complete fact and that capture back to the session.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `InputParser`        | A half-received escape sequence                                                                                                                                                 | Decoded text → `InputSequence`. Normalization then produces `InputEvent`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `InputDispatcher`    | The subscription set and delivery                                                                                                                                               | Hands each `InputEvent` to active subscriptions, and translates "is anyone listening" into terminal demand. Focus ownership is not here: that requires reading the tree and layout order, which is `Session`'s.                                                                                                                                                                                                                                                                                                                                                                             |
| `Session`            | The Vue app, the node tree, `LayoutEngine`, `Painter`, `Surface`, terminal leases, the scheduler, `InputDispatcher`, focus ownership, geometry registration and exit settlement | One commit is layout → paint → `surface.present(frame)`. The session supplies the available size: the terminal's columns, and the height constraint the surface's kind returns for the rows: `exact` for Fullscreen, `at-most` for Inline and Document, `unbounded` when the rows are unknown. Its lifecycle is a union type — `"mounting" \| "running" \| "suspended" \| "tearing-down" \| "torn-down"` — and it is a **session** state rather than a process state: `SIGTSTP`, signal exit and exit codes belong to the node backend.                                                     |
| `DevSession`         | The HMR bridge, the error overlay, the in-process record of which session owns the terminal                                                                                     | Replaces a whole `Session` during development: dispose the old one, build a new one. Not a development branch inside `Session`.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

`LayoutEngine` and `Painter` name roles rather than exported types: the engine is the `layout/` module, whose node-to-engine map and allocation ledger are module-private, and the painter is `paint()`, which holds nothing between calls.

### The commit

One commit is one function in `session/`, with no state between calls: run the layout transaction for the dynamic root and the open `Static` roots, paint the dynamic frame and each `Static` frame from `ComputedLayout`, and return them with the transaction to dispose. The mounted host calls it from the scheduler, and directly on resize, continuation and teardown, and hands the result to `Surface.present` and `Surface.encodeHistory`. `renderToString` calls it once, synchronously, and encodes the frame with the same encoder. Nothing else runs layout or paint.

### The three surfaces

[Rendering modes](./rendering-modes.md) is the contract these implement — which surface a host resolves to, what each owes the screen, and what happens on resize, suspension and teardown. It is not restated here. What the structure adds is that the three are three implementations rather than three sets of conditionals, and that each holds its own state:

| Implementation      | Holds                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `InlineSurface`     | Its own previous frame, its own region, and the handling for consecutive frames that differ in height |
| `FullscreenSurface` | Its own previous frame, and the alternate-screen and cursor-hidden leases                             |
| `DocumentSurface`   | Its own pending frame; it compares nothing                                                            |

`DocumentSurface` is not a degenerate case of `renderToString`: it has a mounted lifetime, accepts history writes while running, and releases input on suspension, none of which the synchronous string renderer does.

`InlineSurface` is the only one with real design difficulty, because its height is decided by content rather than by the viewport, so the previous frame and the next one may differ in height. That is precisely why it is a separate implementation: folded into a set of conditionals with `FullscreenSurface`, each one's hard case contaminates the other.

## Boundaries

An architecture has to stop bad changes rather than rely on memory. The first three are import rules; the last two are type rules. One test checks every import beneath `src/` against the tables above and the first two import rules below.

| Rule                                                            | What it stops                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Only `terminal/node/` imports `node:*` and `process` for values | Confines "this rendering engine needs Node" to one directory, which is also what a non-Node backend would require. Type-only imports of `node:stream` are exempt: `MountOptions` and `UseStdinReturn` are accepted public contracts that name Node stream types, so `api/` and `vue/` must be able to spell them.                                                                                                                                                                                                                                                                                                                                                                    |
| Only `layout/` imports the layout engine                        | The manual engine-memory apparatus — the allocation ledger, the layout guards, the disposed-host set — leaves shared code. Whether to change engines becomes a question that can be decided on its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Only `surface/` encodes a `Frame` into bytes                    | The encoder lives in `surface/`, which only `session/` and `api/` may import, and `paint/` may import neither `terminal/` nor `surface/`. Painting has no exit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Terminal modes are only operated through `terminal/`            | "One terminal action has three write sites that must stay in agreement." Import rules alone cannot carry this one, because the stream arrives as a value through `MountOptions.stdout` and a module graph cannot see who calls `.write()` on it. The raw stream is wrapped in an opaque type on entry to `terminal/`, so what leaves that directory is a `TerminalBackend`. The rule governs operating the device — emitting bytes, changing modes — not the identity of the borrowed streams: `useStdin` is an accepted escape hatch that hands the caller the exact `Readable` passed to `MountOptions.stdin`, so the backend surrenders the streams it borrowed for that purpose. |
| Lifecycle state is a union type                                 | A set of booleans can express states that should not exist. TypeScript's exhaustiveness checking rejects the combinations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Design patterns and the bug each removes

Chosen by the class of bug the code keeps producing, not by the pattern's name.

| Pattern                              | Where                                                                                                       | Bug class removed                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Strategy                             | The `TerminalBackend` implementations; the three `Surface` implementations                                  | "One action has several write sites that must agree", and "a new case was handled at twenty of the branch sites out of forty".   |
| Double buffer with a cell comparison | `Frame` and `Surface`                                                                                       | Several copies of "the previous frame" kept in agreement by hand; Inline and Fullscreen each carrying their own comparison code. |
| Lease                                | Every terminal mode                                                                                         | "Restored on a clean exit, not restored on suspension, HMR reload or a runtime failure."                                         |
| State machine                        | Raw-mode physical/logical reconciliation, the output transaction, suspend and resume, the session lifecycle | "A group of booleans can express a state that should not exist."                                                                 |
| Object instead of a closure          | `Session`                                                                                                   | Mirror variables that exist only so teardown can reach what mount created, and their null checks.                                |

## Mode leases

`TerminalBackend` keys acquire/release leases by a mode identifier. Raw mode, the alternate screen, cursor visibility, synchronized output, bracketed paste and the Kitty protocol are six modes in the current Runtime, so one reference-counted mechanism replaces six separate ownership protocols. Future terminal modes use the same mechanism only after their product behavior is accepted.

## Deliberately not done

Vue already supplies three things a terminal framework otherwise has to build: component instances with lifetimes and state, props and components as the carrier of style, and reactivity as the carrier of state propagation. Runtime therefore does not add an immediate-mode widget model, a selector language, an abstract component base class, or a message-and-command loop. It does not implement flexbox either — Yoga is a mature implementation, and the work is confining it to one directory rather than replacing it.

## Evidence

- [`sanitize-ansi.test.ts`](../../packages/runtime/tests/text/sanitize-ansi.test.ts) pins the OSC 8 hyperlink and SGR preservation that `Cell` must not narrow.
- [`single-pass-text-measurement.test.ts`](../../packages/runtime/tests/layout/layout-transaction/single-pass-text-measurement.test.ts) asserts `layoutCalls === 1`, which a `ComputedLayout` without wrapped lines would break.
- [`render-session.test.ts`](../../packages/runtime/tests/session/render-session.test.ts) pins the three-variant surface resolution the three `Surface` implementations take over.
- The [Runtime benchmark workspace](../../benchmarks/runtime) is where `Frame`'s memory layout is decided.

The peer sources cited inline are read at the snapshots [`peer-frameworks.md`](./peer-frameworks.md) retains.
