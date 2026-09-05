# Architecture decisions

Judgments Yunfei actually expressed about the internal structure of `@vue-tui/runtime`, and about how that structure is tested — selections, acceptances, and rejections. A finished implementation, a passed review, resemblance to a peer, or silence is not acceptance. Never invent a rationale; where no reason was given, the entry says so. Entries record the act of judgment, not the structure itself; [Runtime architecture](./architecture.md) records the structure. Edit entries in place; git keeps history.

Judgments about the **public** surface belong in the [Runtime API decision ledger](./runtime-api-decisions.md) and are not duplicated here. Boundaries between packages are settled in [Package architecture](./package-architecture.md).

## Decided

Entries without a stamp are drafts of judgments Yunfei expressed. A stamp alone on the first line below an entry heading covers that whole entry as current vouched direction.

### Mouse support is a Fullscreen capability

- **Ruling:** Mouse support is provided in Fullscreen and must not be provided in Inline, including the low-level event path; the Inline case may be reopened whenever a need appears.
- **Limits:** This settles scope, not the public shape or any internal representation. It does not authorize building mouse support now; it decides which mode any future work targets.
- **Why:** Yunfei judged that mouse support in Inline is genuinely painful and that there is no way around it, and that the Fullscreen capability is what matters. He accepted reopening Inline later if a need appears. He had earlier rejected declining mouse altogether over its cost to terminal text selection, saying that is the terminal's problem and not a reason to give up the capability.
- **Source:** Yunfei, 2026-08-30, architecture discussion; no durable session URL is available, so this entry is the durable record.

### Fullscreen provides its own text selection

- **Ruling:** Fullscreen should implement text selection itself so that users retain a way to select and copy.
- **Limits:** This does not fix the selection model, the key or pointer gestures, or which package owns the implementation; placement follows the [placement test](./package-architecture.md#placement-test) when the work is scheduled. Writing to the system clipboard depends on OSC 52, which is not universally supported and therefore requires capability detection. Selection extends by dragging, so it depends on pointer capture.
- **Why:** Yunfei judged that mouse in Fullscreen is the best case and that selection should be implemented there to make selecting convenient for users. Enabling mouse reporting hands the mouse to the application, so the terminal stops performing its own selection; in Fullscreen the affected content is the application's own, and no scrollback exists on the alternate screen.
- **Source:** Yunfei, 2026-08-30, architecture discussion; no durable session URL is available, so this entry is the durable record.

### Mouse reporting modes are acquired on demand, by tier

- **Ruling:** Mouse reporting must be acquired and released on demand by whatever needs it, per protocol tier, rather than held for the mounted lifetime.
- **Limits:** Tier separation follows the protocol: `1000` reports press and release, `1002` adds motion while a button is held, `1003` reports all motion. It does not decide which component or composable acquires which tier. The contingent requirement for a low-level public escape hatch is recorded with the other [Runtime API decisions](./runtime-api-decisions.md#pointer-support-includes-a-low-level-escape-hatch).
- **Why:** Yunfei chose on-demand acquisition over holding for the mounted lifetime, and accepted tier separation on the ground that `1003` sends bytes on every pointer movement and can trigger repaints, which is noticeable on a slow terminal or over ssh, so an application that does not need hover should not pay for it. He asked for the explicit low-level hook as an escape hatch and for capability completeness.
- **Source:** Yunfei, 2026-08-30, architecture discussion; no durable session URL is available, so this entry is the durable record.

### Browser support, if pursued, runs the application in the browser

- **Ruling:** If vue-tui is to run in a browser, the shape is the application itself running in the browser with a terminal emulator as its display; a DOM or canvas backend is not the direction.
- **Limits:** This does not schedule browser support or add a browser entry, and the public mount options are unchanged — an accepted decision already states that web streams are adapted outside Runtime rather than admitted into `MountOptions`. Serving a Node-hosted application to a browser over a socket needs nothing from this architecture and is unaffected either way.
- **Why:** Yunfei accepted this shape as sufficient after reviewing the four distinct paths and what each would cost. No further reason was given.
- **Source:** Yunfei, 2026-08-30, architecture discussion; no durable session URL is available, so this entry is the durable record.

### Core internal type names

- **Ruling:** The internal vocabulary is `Frame`, `Cell`, `ComputedLayout`, `InputSequence`, `InputEvent`, `TerminalBackend`, `Surface`, `LayoutEngine`, `Painter`, `InputParser`, `InputDispatcher`, `Session`; directories are named for what they own, with `frame/` and `host/` replacing the earlier `cell/` and `tree/` proposals.
- **Limits:** These are internal names. `TuiInputEvent` and every other public name are governed by the [Runtime API decisions](./runtime-api-decisions.md) and are unchanged. The vouched entry that governs the payload names the public types `TuiInputEvent`, `TuiKey` and `TuiKeyName` and keeps "protocol, raw sequence, parser names" private, so renaming an internal type does not touch it.
- **Why:** Yunfei accepted the proposed set with two changes of his own: `TerminalBackend` rather than `TerminalDevice`, and `InputDispatcher` rather than the alternatives. He kept `Surface` over `Display` on the ground that it is the more professional term, and rejected `Renderer` for it. He accepted swapping `InputEvent` onto the normalized fact and renaming the raw sequence to `InputSequence`.
- **Source:** Yunfei, 2026-08-30, architecture discussion; no durable session URL is available, so this entry is the durable record.

### Pointer events are delivered to the component under the pointer

- **Ruling:** When pointer input is built, Runtime must resolve the component under the pointer and deliver the event to it, rather than broadcasting every event to every subscription.
- **Limits:** This settles who receives an event, not how far the delivery model goes: bubbling, pointer capture, hover, and click chains are each undecided. It does not change `useInput`, whose accepted contract is broadcast and whose Limits already require that a future facility "must be a separate opt-in primitive rather than changing this default delivery contract". Scope remains Fullscreen only, per the first entry above. The implementation must respect clipping, but no hit-attribution representation is selected until the work qualifies under the product-work rule.
- **Why:** Yunfei chose targeted delivery after both models and their consequences were laid out, including that an application cannot perform the resolution itself — `useBoxMetrics` reports a parent-relative rectangle by accepted contract, explicitly excluding terminal coordinates and pointer facts, so an application receiving a coordinate has no way to map it to one of its own components. He gave no further reason.
- **Source:** Yunfei, 2026-08-30, explicit instruction to take targeted delivery, given after the two models were compared; no durable session URL is available, so this entry is the durable record.

### Runtime behavior is proved by end-to-end and integration tests

[VOUCHED @hyfdev 2026-09-04]

- **Ruling:** For `@vue-tui/runtime`, end-to-end and integration tests are the primary evidence for behavior and unit tests are supplementary. Internal code is never changed, and no code is added to it, for the sake of a unit test.
- **Limits:** The ruling does not enumerate forms; what it forbids is a change a unit test needs and production does not. This does not forbid unit tests of pure functions that already exist as units, and it does not remove tests already in the repository. It does not decide suite placement, file naming, or harness details, which the repository's testing rules in `AGENTS.md` already govern. It covers Runtime code; how the other packages are tested is not decided here.
- **Why:** Yunfei gave this ruling as a direct instruction and stated no reason for it, so none is recorded.
- **Source:** Yunfei, 2026-09-04, explicit instruction to adopt this principle and stamp it; no durable session URL is available, so this entry is the durable record.

### Content is parsed once per revision and the runs live on the node

- **Ruling:** A `Text` node's content is parsed into styled runs once per content revision, and the runs are kept on the node as plain data. The layout pass wraps them for its width and records the wrapped lines in `ComputedLayout`; paint reads the node's runs and those wrapped lines and keeps no cache of its own.
- **Limits:** This does not decide whether the parse runs when the content is set or on the first measurement after a change. It does not change the May-import tables, and it does not decide the memory layout of the runs.
- **Why:** Yunfei adopted the recommendation as it was given: the parse does not depend on width, so it need not repeat per measurement, and one set of runs on the node replaces the two caches. He gave no further reason.
- **Source:** Yunfei, 2026-09-05, adopted the recommendation by reference after the alternative was laid out; no durable session URL is available, so this entry is the durable record.

### Colour degrades in the encoder

- **Ruling:** The encoder in `surface/` degrades a cell's colour to the resolved colour level. The level is resolved once per host from the `color` option and the environment and handed to the encoder by the session and by `renderToString`; the painter and `Style` carry structured colour only and do not know the level.
- **Limits:** This does not decide the mapping from truecolor to 256 or 16 colours, and it does not change the public `color` option. Content ANSI colours and prop colours degrade through the same encoder.
- **Why:** Yunfei adopted the recommendation as it was given: the target painter produces no strings, so degradation needs one home both hosts reach, and the encoder is that place. He gave no further reason.
- **Source:** Yunfei, 2026-09-05, adopted the recommendation by reference after the alternative was laid out; no durable session URL is available, so this entry is the durable record.

### A reset inside content is undefined behaviour

- **Ruling:** Runtime parses a `Text`'s content into cells with the component's props as the base style and the content's own SGR layered on it; what an authored `\x1b[0m` inside content does beyond clearing the content's own styling is not a contract, is not pinned by a test, and Runtime carries no mechanism to reproduce any particular byte outcome for it.
- **Limits:** This does not change what content SGR with proper end codes produces, nor OSC 8, nor `extraSgr`.
- **Why:** Yunfei's meaning: emit what the author wrote, the behaviour is whatever falls out of that, and the behaviour itself is undefined.
- **Source:** Yunfei, 2026-09-05, ruling given when the two readings were laid out; no durable session URL is available, so this entry is the durable record.

## Open

### Which SGR attributes receive structured fields

- **Question:** Which authored SGR attributes beyond the common 1–9 and 53 set deserve their own `Cell.attrs` bits rather than the exact `extraSgr` fallback.
- **Stopgap:** `Cell.extraSgr` carries unmodelled numeric and colon-form attributes through the frame with their matching terminators.
- **What would settle it:** A demonstrated consumer or terminal behavior that benefits from structured inspection, followed by Yunfei's judgment on that attribute's admission.
