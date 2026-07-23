# vue-tui ↔ Ink — Relationship Record

vue-tui started as a Vue 3 port of [Ink](https://github.com/vadimdemedes/ink), and it
still tracks Ink closely. It is no longer only a port, though: it has its own design
decisions, additive features, and Vue-native choices.

This document is the single record point for **how vue-tui relates to Ink** — not only
where it differs. It records three kinds of relationship, each treated as a conscious
decision:

- **Deliberate alignments** — places vue-tui consciously _matches_ Ink (including where it
  could easily have diverged, or where it keeps an Ink quirk on purpose) because matching is
  the most reasonable behavior. A load-bearing alignment is worth recording so a later
  "improvement" knows the match was a choice, not an accident.
- **Intentional divergences** — places vue-tui deliberately _differs_ from Ink, each with a
  real reason; a kept (human-blessed) divergence also carries an explicit `[VOUCHED @handle]`
  stamp.
- **Non-behavioral notes** — Vue-facing conventions and internal mechanics that are not
  behavioral claims but are easy to mistake for parity gaps.

A behavioral difference that is **not** recorded here as a deliberate divergence is treated
as a bug, or as simply unverified behavior — never as an implicit design choice. An
alignment, conversely, earns an entry only when it is load-bearing or non-obvious; the vast,
unremarkable majority of parity needs no record.

Reference baseline: Ink **v7.0.4** (commit
`40b3a7578811fd616341ca4e31cc7748aeeff12f`). When bumping the target Ink version,
re-validate every entry below against the new source.

> **Current public-API review note (unstamped, 2026-07-22):** Yunfei explicitly reopened whether earlier public-API vouches still fit the minimum Runtime boundary because some assumptions changed. For API retention and exact signatures, the stamped sections below are evidence of the earlier decision, not an automatic answer; the [Runtime public API decision ledger](./runtime-public-api-decisions.md) carries the current result. Behavior decisions unrelated to a reviewed API boundary are not silently discarded by this note.

> **Current input/stdin implementation note (unstamped, 2026-07-24):** the current branch implements the vouched nested `TuiInputEvent`/`TuiKey` broadcast contract, ignores `useInput()` handler returns, defaults `exitOnCtrlC` to false, and implements the complete independently owned `useStdin()` raw-mode escape. Earlier F3 passages about `kind`, uninterpreted public facts, required route results, preventable delayed defaults, removed `exitOnCtrlC`, or stream-only stdin remain historical relationship evidence.

## The governing principle: correctness first, alignment is only a means

**Aligning to Ink is a means, never the goal.** The goal is the _most correct, most
Vue-idiomatic behavior_. Ink is a mature, battle-tested implementation, so wherever Ink is
already right, matching it is simply the **cheapest way to be correct** — vue-tui inherits years
of bug-fixes and edge-case handling for free. Reducing bugs by reusing proven behavior is the
_entire_ reason alignment has any value here.

It follows directly that **parity never outranks correctness.** When Ink's behavior is itself a
defect, is unreasonable, or is un-idiomatic for Vue, **the plain correctness/reasonableness of the
behavior and conformance to Vue's philosophy win — and vue-tui deliberately diverges.** "Ink does
it this way" is never, on its own, a justification; it is only shorthand for "Ink is already
correct here, so matching is the cheap path to correctness."

This priority ordering is _why this file records alignments too_. If alignment were the goal,
matching Ink would need no record — it would be "the right thing" by definition. Because alignment
is only a _means_, a deliberate match is a genuine decision ("Ink is correct here, so we match")
exactly as much as a deliberate divergence is — and a load-bearing one deserves the same written
rationale, so a future change that would break it knows it was chosen, not stumbled into.

The principle guards against two opposite failure modes:

- **Blind alignment** — copying Ink even where Ink is wrong, or where matching would force
  un-Vue machinery, merely to match. (Rejected e.g. in the `useCursor` corner-zombie, the
  resolve-on-throw exit, and the paint-time invalid-input crash — Ink behaviors vue-tui treats
  as defects, not contracts.)
- **Lazy divergence** — inventing a different behavior and rationalizing it as "Vue's way is
  better" with no genuine Vue-philosophy or correctness reason. Mere presence in this file is
  **not** a vouch; every kept divergence needs a real reason and an explicit `[VOUCHED @handle]` stamp.

So the test for any behavior is never "does it match Ink?" but: **"is this the most reasonable,
most Vue-idiomatic behavior?"** — and then, separately, "is the relationship to Ink (a match or a
divergence) a conscious, recorded decision?" Correctness and Vue idiom come first; alignment is
just the cheapest route to them whenever Ink is already right.

## How to Classify an Entry

Classify each entry by the first rule that applies; the order matters.

1. If it is **not a behavioral claim** — a Vue-facing naming convention or an internal
   mechanic that is only easy to mistake for a parity gap — put it in **Non-Behavioral
   Notes**.
2. If it is a **deliberate decision to _match_ Ink** that is worth recording — a load-bearing
   parity point, a place vue-tui could easily have diverged but consciously did not, or an
   Ink quirk kept on purpose — put it in **Deliberate Alignments**.
3. Otherwise it is a **deliberate _divergence_**. Classify it by the first sub-rule that
   applies (earlier sections are narrower, later ones broader fallbacks):
   1. If Ink's supported subset still behaves the same and vue-tui only accepts more inputs,
      supports more contexts, or exposes an extra capability → **Additive Supersets**.
   2. If the primary reason is alignment with Vue's API shape, framework model, mental model,
      or user expectations → **Vue API and Mental Model Divergences**.
      - **Model-Implied Differences** when the difference comes from the React/Vue
        framework-model boundary: matching Ink would require React-shaped machinery inside
        Vue, changing a core Vue-facing contract, or dealing with a React-only concept that
        has no Vue equivalent.
      - **Vue-Idiomatic Choices** when Ink could be copied, but vue-tui chooses the behavior
        or public surface that better fits Vue's reactivity, lifecycle, component boundaries,
        current-props model, or API conventions.
   3. If the divergence is intentional but is neither additive nor primarily Vue-aligned →
      **Intentional Divergence Choices**.

Each **divergence** entry states what Ink does, what vue-tui does, and why the difference is
deliberate; a kept divergence also carries an explicit `[VOUCHED @handle]` stamp. Each
**alignment** entry states what is shared, that the match is deliberate, and why matching is the
most reasonable behavior — not merely "because Ink does it". Some entries also record
consequences, costs, tests, or the reasoning behind a vouch where those details aid understanding.

---

## Deliberate Alignments

These are places vue-tui consciously **matches** Ink — recorded not because every parity point
needs an entry (the unremarkable majority does not), but because each is a _decision_: a behavior
vue-tui could plausibly have done differently, or an Ink quirk kept on purpose, where matching is
the most reasonable choice. Recording it means a later change that breaks the match knows it was
chosen, not accidental. Per the governing principle, the justification is always "this is the
correct/reasonable behavior and Ink already has it," never "because Ink does it." Alignment
carve-outs that are tightly bound to a specific divergence are noted inline within that divergence
entry instead.

### Commit timing (throttle cadence, FPS, synchronous resize)

Commit timing is deliberately Ink-aligned: leading+trailing throttle at
`Math.max(1, Math.ceil(1000/maxFps))` ms behind a `maxFps > 0` guard (34ms at the default
`maxFps=30` — both engines compute exactly this), synchronous resize. The scheduler mirrors the
observable timing of Ink's es-toolkit throttle (run-verified vs v7.0.4): the trailing timer
re-arms on every deferred call, so the trailing commit fires at `lastCall+wait` (not
`windowStart+wait`), and a call arriving a full window after the first deferral commits
synchronously (es-toolkit's `maxWait`), keeping a ~`wait` cadence under sustained updates. This
remains true even though re-renders come from Vue's fine-grained reactivity, not a React subtree
re-render. Matching Ink's well-tuned cadence buys the same perceived responsiveness and flush
guarantees without re-deriving them. One deliberate exception: resize cancels the pending trailing
commit — see the divergence "Resize unconditionally cancels the pending trailing commit".

### App exit settlement and flush during teardown

[VOUCHED @hyfdev 2026-07-23]

The accepted vue-tui lifecycle target deliberately matches the pinned Ink v7.0.4 behavior where the models overlap. The first mounted `exit()` call determines settlement and later calls are no-ops. `waitUntilExit()` settles only after final accepted output, rejects with the same `Error` supplied to an error exit, and is the authoritative exit-result channel. `waitUntilRenderFlush()` called during clean or error teardown waits for teardown output and resolves rather than duplicating the exit error.

This match is deliberate because one authoritative exit-result promise and one non-reporting output barrier give callers two operations with distinct purposes. It also keeps teardown re-entry from replacing an already-selected result. vue-tui's separate pre-mount state has no Ink equivalent: because Vue exposes `createApp()` before `mount()`, the accepted target resolves `waitUntilRenderFlush()` immediately when no renderer work exists and does not subscribe to a future mount.

The behavior was run-verified against the pinned commit with real `PassThrough` streams and identity-checked `Error` values: clean then error resolved normally, error then clean rejected with the first exact `Error`, and an error teardown made flush resolve while exit rejected with that exact `Error`. The upstream implementation guards first-call settlement in [`handleAppExit()`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/ink.tsx#L480-L492), settles after its output barrier in [`unmount()`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/ink.tsx#L829-L884), and suppresses the exit result only inside the flush path in [`waitUntilRenderFlush()` and `awaitExit()`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/ink.tsx#L887-L1011). Ink's pinned tests independently cover [flush after unmount and error exit](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/test/render.tsx#L1450-L1526) and [first-result settlement during teardown](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/test/render.tsx#L1565-L1613).

The current vue-tui implementation already has first-call exit and final `waitUntilExit()` settlement, but its pre-mount and teardown availability errors on `waitUntilRenderFlush()` do not yet implement the accepted target and remain tracked in [TODOs](./todos.md#runtime-public-api-review).

### Static history remains irreversible across ordinary mount lifecycle

[VOUCHED @hyfdev 2026-07-23]

The accepted vue-tui target matches the pinned Ink v7.0.4 lifecycle behavior where the component models overlap. Producing no Static output does not consume the producer, so later content may still commit. Once output is committed, conditional unmount cannot erase terminal history. Mounting again creates a fresh producer and may append the same content again. The slot or item subtree is released through the framework's normal unmount lifecycle after acceptance.

This match is deliberate because terminal history is an irreversible output side effect rather than reversible component visibility. Vue `v-if` and React conditional rendering therefore retain their ordinary create and destroy meaning; neither framework can reinterpret unmount as deleting bytes already written to a terminal.

The behavior was run-verified against the pinned commit with a real TTY-shaped `PassThrough`: an initially empty `items` array later appended `A`; mounting `Static(A)`, conditionally removing it, and mounting it again wrote `A` twice while the first output remained; and an item component's effect cleanup ran immediately after its block was accepted rather than waiting for app unmount. Ink implements the open empty producer and fresh per-mount cursor in [`Static.tsx`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/components/Static.tsx#L28-L58). The current vue-tui implementation already preserves committed history, releases accepted slot children, and treats remount as a new instance, but it incorrectly consumes an output-free eligible render; the accepted correction remains tracked in [TODOs](./todos.md#runtime-public-api-review).

### Static lifecycle implementation checkpoint

As of 2026-07-24, vue-tui implements the vouched lifecycle target above: an output-free eligible instance stays open, only a block represented by non-empty bytes in the current settlement transaction settles, acceptance releases the slot subtree through Vue lifecycle, ordinary unmount before output writes no history, and remount creates a fresh producer. This checkpoint updates implementation status without rewriting the vouched evidence and pre-implementation statement above.

### Non-TTY Inline output is a final document

[VOUCHED @hyfdev 2026-07-23]

The accepted vue-tui policy deliberately matches the useful core of Ink v7.0.4's default redirected-output behavior. Run-verification with a non-TTY `PassThrough` showed that dynamic `A → B` writes nothing before unmount and then writes exactly `B\n`, while newly accepted Static history writes immediately. vue-tui likewise keeps only the current dynamic document, writes it once on clean teardown, appends accepted Static history immediately, and emits no screen-management controls. Coordinated console output remains immediate. Error teardown does not replay a stale successful dynamic document.

vue-tui deliberately tightens two edges. Its public API has no live-update override for a non-TTY destination, so applications cannot opt a pipe into cursor-relative frame output through `MountOptions`. An empty final dynamic document writes no bytes, whereas pinned Ink writes a lone newline. Non-empty output receives a line ending only when it does not already have one. These rules make redirected output a document rather than either a terminal recording or an artificial blank line.

This policy is independent from input: a capable stdin may still serve an active `useInput()` subscription while stdout is redirected. Ink's `debug` output branch also remains separate evidence rather than a feature to copy; vue-tui's deterministic test observation does not change production output.

The pinned upstream behavior was run-verified with real `PassThrough` streams and cross-checked against Ink's [non-TTY and explicit-override tests](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/test/components.tsx#L1152-L1247), [alternate-screen tests](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/test/components.tsx#L1712-L1757), and Static tests. The accepted target and implementation gaps are recorded in the [mount host review](./runtime-public-api-review.md#mount-host-contract).

### Caller-supplied streams remain open

[VOUCHED @hyfdev 2026-07-23]

The accepted vue-tui ownership rule deliberately matches pinned Ink 7.0.4: custom stdin, stdout, and stderr are borrowed from the caller, not transferred to the framework. Run-verification showed that Ink leaves all three streams open after unmount while removing its listeners and restoring raw and ref state. vue-tui likewise never calls `end()` or `destroy()` on caller streams, restores only state it changed, and closes only resources Runtime created itself.

This is the practical ownership rule because surrounding code may share a stream or write to it after the terminal application ends. It does not turn stream failure into success or require Runtime to continue using a closed stream; those settlement details are covered by the intentional divergence below.

### Literal tabs in `<Text>` are not normalized (measure vs paint width)

Tabs in `<Text>` aren't normalized — measured width can disagree with painted width (shared with
Ink, KEEP). `string-width` counts `\t` as 0 columns, but paint expands it to the next 8-column tab
stop (`wrap-ansi` / terminal), so a `<Text>` with a literal tab reserves fewer columns than it
draws (`ab\tcd` measures 4, paints ~10). Ink v7.0.4 does the same, so vue-tui is aligned here;
KEEP — literal tabs in TUI text are vanishingly rare, so inheriting the quirk costs less than
re-deriving tab handling for input that essentially never occurs. If ever fixed, expand tabs to
spaces at the shared squash step (the only place with the column context an isolated tab lacks),
upstream of `string-width` — and that fix would then become a divergence entry. [VOUCHED @hyfdev]

## Additive Supersets

vue-tui supports more than Ink in these cases. Ink-supported inputs and common use cases
remain compatible; vue-tui only adds accepted inputs, contexts, or capabilities.

### Multiple `<Static>` regions

- **Ink:** keeps a single `staticNode`; only one `<Static>` is honored.
- **vue-tui:** `findStatics(root)` renders **every** `<Static>` in the tree.
- **Why:** a tree with two `<Static>` regions renders both. KEEP. [VOUCHED @hyfdev]

### The stdin ingress owns kitty query-responses

- **Ink:** its auto-detection lifecycle listens to stdin in parallel with application input, strips replies from a private buffer, and `unshift()`s the remaining bytes. Its ordinary key parser has no query-response branch. Pinned v7.0.4 runs prove that a complete reply can still reach `useInput`.
- **vue-tui:** one weakly registered ingress per physical stdin is the only framework listener for byte decoding, structural control-sequence and paste framing, detection, and ordered application multicast. It consumes complete `ESC[?Nu` replies outside bracketed-paste payloads before application delivery. Each accepted query owns a 200ms FIFO slot; cancellation leaves a callback-free tombstone that retains query-shaped partial replies, the same owner can revive that slot on continuation, and a rejected write aborts an unwritten slot. Structural events are sent once to app generations eligible when the event began. A semantic parser-level `ignore` remains the backstop for explicitly enabled mode and late or stray complete replies.
- **Why:** competing listeners cannot establish ownership, and per-app filters can classify the same physical bytes differently. The previous detector replayed ordinary bytes already handled by the application controller, a reply split after 35ms escaped as `"[?"` plus `"1u"`, and reply-shaped bytes inside a paste were deleted. Protocol input must be removed once before application routing, not repaired independently in every public listener. The finite 200ms query window and ordinary 20ms Escape ambiguity boundary are explicit. Real-stream tests cover interleaved ordinary input, re-entrant and throwing protocol-enable writes, overlapping, cancelled, revived, rejected, staggered, long-split and late queries, invalid prefixes and UTF-8, consecutive Escape, paste payloads, flow pause and resume, synchronous mount and continuation responses, teardown, and shared-stdin behavior. See [normalized input and routing](./input-routing.md). This is an unstamped completed F3 implementation decision; the normalized public contract and private priority, continuation, delayed-default, external-owner, host, and lifecycle mechanisms are implemented and verified.

### Historical: `useAnimation()` outside a render tree drove a standalone animation

- **Ink:** the default `AnimationContext.subscribe()` is a no-op subscription with
  `startTime: 0`, so a `useAnimation` rendered outside an Ink tree never ticks.
- **Historical vue-tui behavior:** `useAnimation` fell back to a freshly created standalone scheduler
  (`inject(AnimationSchedulerKey, null) ?? createAnimationScheduler()`), so `frame`/`time`/
  `delta` advance even with no surrounding app.
- **Why it existed:** the composable did useful work in isolation, such as a unit test or a
  non-rendered driver. Inside a tree the injected scheduler was used exactly as Ink's.
- **Current disposition:** the minimum Runtime re-audit removed `useAnimation`, its public
  types, and the shared animation scheduler. Animation policy does not require terminal or
  renderer ownership; the retained Spinner owns a Vue-scoped timer directly. This entry is
  historical comparison evidence, not a current Runtime capability.

### Two apps sharing one stdin both receive input

- **Ink:** raw-mode count and the input listener are **per-`App`** (`useRef`), and Ink reads
  via the `'readable'` event + `stdin.read()` (pull, `App.tsx:278-313`). Two `render()`s to
  different stdout but one stdin each attach a `readable` listener, but the first-registered
  listener's `read()` loop drains the buffer every tick, so the second app receives no
  input until the first unmounts. And because counts are per-`App`, the first app's
  unmount calls `stdin.setRawMode(false)`, dropping raw mode while the second still needs
  it.
- **vue-tui:** the terminal raw-mode toggle is refcounted **per-stdin** (a shared
  `WeakMap`), so one app's unmount cannot drop raw mode while another holds it; and the
  `'data'` input listener is **per-controller**. Each app attaches its own `handleData` ->
  own parser -> own emitter. Since `'data'` (push) broadcasts to **every** listener, both
  apps receive every keystroke, and the second keeps receiving after the first unmounts.
- **Why:** this covers a combination vue-tui already allows: two `createApp`s to different
  stdout. The same-stdout no-op is keyed on stdout, not stdin. The push model has no drain
  race, and a shared raw-mode refcount matches the ownership model when several renderers
  share one input. The common one-app-to-terminal flow is unchanged: one controller's
  `localRefs` equals the shared `refs`. Test: `raw-mode-lifecycle.test.tsx` ("two apps
  sharing one stdin both receive input..."). KEEP. [VOUCHED @hyfdev]
- **Completed F3.1–F3.4 plus public migration (unstamped):** one weakly registered framework ingress replaces the per-controller physical listeners without changing the vouched ordered multicast result. It decodes bytes, parses structural control-sequence and paste events, removes owned query replies, normalizes each event once into the same immutable semantic fact for all eligible app controllers, and carries each app's fact-start route and selected-topology activations through split framing. Distinct facts dispatch serially and recapture after the preceding callback even when Node batches them into one chunk; plain text remains one fact when the wire provides no finer boundary. Public `useInput` consumes one cached readonly key, text, paste, or uninterpreted projection, and every captured global handler returns an explicit route result; `usePaste` and public `Key` are removed. The private policy and live topology runtime execute global, selected-boundary, supplied-focus-path, delayed-default, and optional-external layers in the actual controller while keeping action, continuation, defaults, and external permission independent. The bridge does not publish or select focus topology. Product-boundary, prior-art, implementation, and real nested-PTY evidence select semantic facts plus normalized UTF-8; arbitrary original-byte recovery is deliberately not promised. Raw state counts total logical references separately from unsuspended references, so suspending one app cannot release the shared terminal or listener while another remains active. The vouched direct-stdin contract retains the actual mounted stream as a raw escape hatch without framework event or safe routing-composition guarantees. Managed non-TTY exclusion, removal of public raw-mode controls, and semantic-demand ownership of raw/listener/ref/Kitty state are implemented. See [normalized input and routing](./input-routing.md).
- **Current public supersession (unstamped, 2026-07-24):** the shared ingress, normalization, multi-app ownership, suspension, restoration, and mounted-stream identity remain implementation mechanisms. The old public uninterpreted projection, route result, selected topology, delayed default, and removal of raw controls described above are superseded by the current broadcast `type`/nested-key surface, default-false `exitOnCtrlC`, and complete per-hook `useStdin()` raw hold.

## Vue API and Mental Model Divergences

These divergences come from choosing Vue's API shape, framework model, mental model, and
user expectations as the source of truth while tracking Ink. Some are model-implied:
matching Ink would require React-shaped machinery inside Vue, changing a core Vue-facing
contract, or handling a React-only concept that has no Vue equivalent. Others are
idiomatic choices: Ink could be copied, but vue-tui chooses the behavior or public
surface that better fits Vue's reactivity, lifecycle, component boundaries,
current-props model, or API conventions.

### Model-Implied Differences

#### Reactive composable state is a `shallowRef`, not a plain snapshot

- **Ink/React:** a hook re-runs on every render of its component, so it can return a plain
  value and the caller always reads the latest one. `useFocusManager().activeId`, for
  instance, is a bare `string | undefined`, re-read fresh each render.
- **vue-tui:** a composable's `setup()` runs **once**, so reactive state cannot be a plain
  snapshot: it would freeze at setup time. vue-tui returns a **`shallowRef`** whose `.value`
  updates and re-renders the template; read these as `.value`. Every stateful composable
  follows this — `useFocusManager().focusedTarget` is a readonly ref to the exact opaque target, while the
  current layout primitives return smaller refs directly: `useLayoutWidth()` returns
  `Readonly<Ref<number>>`, `useViewportHeight()` returns `Readonly<Ref<number>> | null` after a
  one-time bounded-host check, and `useBoxSize()` returns `Readonly<Ref<BoxSize | null>>`. An empty single-ref state
  holds `null` (Vue's convention for an empty ref: a template ref is `ref<T | null>(null)`),
  where Ink's plain value is `undefined`.
- **Why:** the two frameworks track a changing value differently. React reads the newest
  value by re-running the hook; Vue wraps it in a ref the template subscribes to. This is
  the general rule, not a per-API choice. The focused-target ref is one instance. This follows Vue's philosophy: changing state is exposed as a reactive source,
  not as a one-time snapshot. KEEP.

#### Console protection keeps Ink's default and escape hatch, without message filtering

- **Ink 7.1.1:** `patchConsole` defaults to `true`, and `false` leaves the native console alone. Ink suppresses a React component-error diagnostic beginning with `The above error occurred` because its built-in error boundary already renders an error overview; it does not suppress all React warnings.
- **Vouched vue-tui target:** `patchConsole` likewise defaults on and accepts `false`, but active applications use a normal registration stack and Runtime forwards all intercepted content, including Vue warnings. Protection begins before the user component first runs and an application's registration remains until its Vue cleanup finishes.
- **Current implementation gap:** the active-registration stack and pre-component installation already exist, but the implementation still drops the `[Vue warn]` prefix and releases an application's registration before Vue cleanup. The accepted corrections remain explicit work in [TODOs](./todos.md#runtime-public-api-review).
- **Why:** dependency logging is a real way to corrupt a live terminal frame, so coordinated forwarding belongs with Runtime's output ownership. After removing the hidden Runtime error boundary and automatic error overview, filtering Vue's own diagnostics would hide information without removing a duplicate UI.

#### React concurrent mode

- **Ink:** built on React; `useTransition` / `useDeferredValue` work as ordinary React
  hooks. Ink v7 also exposes a `concurrent?: boolean` render option (default `false`)
  with two distinct halves (run-verified vs v7.0.4): the root-tag half is inert — under
  the pinned reconciler (react-reconciler 0.33.0 / React 19) every root is overwritten to
  ConcurrentRoot, and hook/preemption probes behave identically in both modes — but the
  dispatch half is live: the default commits the first frame synchronously inside
  `render()` / `rerender()` (bytes reach stdout before the call returns), while
  `concurrent: true` schedules the commit asynchronously on a later tick.
- **vue-tui:** no equivalent — no such composables, and `MountOptions` has no
  `concurrent` flag. `mount()` commits the first frame synchronously, matching Ink's
  default dispatch.
- **Why:** React scheduling concepts with no Vue counterpart; N/A rather than a parity
  gap. The absent `MountOptions.concurrent` is this entry, not an unlisted difference:
  the one observable behavior the flag adds (deferring the first paint past the mount
  call) has no Vue-side demand, and vue-tui already matches Ink's default.

#### Historical screen-reader rider on `<Transform>`; visual all-comment behavior remains

- **Ink:** `Transform` returns `null` only for `undefined` / `null` children. React's
  `false` child and a literal `[]` child are not nullish, so each creates an empty
  `ink-text` node that consumes a flex-gap slot. Ink's screen-reader behavior was also
  measured during the former vue-tui experiment and is retained here only as historical evidence.
- **vue-tui:** after slot resolution, `null` / `false` / `undefined` / `v-if="false"` /
  a `false`-yielding `&&` all materialize as the same Comment vnode — React's
  `false !== null` edge has no Vue equivalent. `<Transform>` treats an absent slot, an
  all-comment slot, or an empty slot array (`() => []`) as no renderable children and
  returns `null`: the node is omitted and no gap slot is consumed. Boundary parity: `''`
  and `0` children are text vnodes, not comments — both engines render a
  node (`''` takes a gap slot; `0` prints `0`) — and a Vue JSX `{[]}` child is a
  Fragment vnode that still renders a node, matching Ink; only the bare `() => []` slot
  collapses.
- **Why:** a child set that renders nothing equals omitting the child — letting
  framework anchors occupy layout slots would be worse than matching Ink's React-only
  `false !== null` edge, which Vue cannot see. The `() => []` collapse alone is **not**
  model-forced (Vue can see the empty array); it is
  a deliberate consistency rider — in each engine `() => []` and `() => [false]` behave
  alike (Ink renders a node for both, vue-tui omits both), and aligning only `[]` would
  create an asymmetry that exists in neither engine without reaching parity. The earlier
  vouch also covered a screen-reader label rider that no longer exists, so its stamp was
  removed rather than transferred to this narrower visual statement. Visual regression:
  [`private-transform-wrapper.test.ts`](../../packages/runtime/src/components/private-transform-wrapper.test.ts).

### Vue-Idiomatic Choices

#### `Static` delegates collection composition and identity to Vue

[VOUCHED @hyfdev 2026-07-23]

- **Ink:** exports `Static` from its root as a collection component with `items`, `style`, and a positional render-function child. Pinned v7.0.4 [stores a numeric rendered length and renders only `items.slice(index)`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/components/Static.tsx#L28-L58).
- **vue-tui:** exports only a prop-free `Static` value from `@vue-tui/runtime/inline`. One ordinary default slot describes one history block. Applications use Vue `v-for` and stable `key` values for collections, conditional rendering for ordinary instance creation, and `Box` or `Text` inside the slot for layout and styling. There are no collection-specific props, scoped-slot values, events, methods, or named types.
- **Why:** collection iteration, keyed identity, conditional creation, slots, and component cleanup are already Vue responsibilities. Copying Ink's React-shaped collection API into Runtime would duplicate those mechanisms and make the terminal-owned primitive larger. A third party can build an opinionated list component entirely from the public one-block primitive.

#### Public Box size follows a direct Vue Box ref

- **Ink:** `measureElement(node: DOMElement)` and `useBoxMetrics(...)` receive Ink's public host `DOMElement` ref and read its Yoga node.
- **vue-tui:** `useBoxSize()` receives a Vue ref bound directly to the exported Vue `Box` component in the current app. The private F2 resolver follows that instance's current rendered host through replacement, but the public type does not expose or accept raw component values, getters, vue-tui's internal host-node, or Yoga types. A caller can wrap a derived target in `computed()` without Runtime help. A Text ref, arbitrary component ref, or foreign-app Box is rejected.
- **Why:** a Vue template ref naturally yields a component instance, while current application evidence needs only Box width and height. Restricting the type to `InstanceType<typeof Box>` avoids promising bounding rules for fragmented nested Text or multi-root components. Accepting renderer nodes would make a private implementation type into a second public target model. This is a Vue-idiomatic replacement, not an additive Ink-compatible superset: raw Ink-style host-node input and Ink's imperative Yoga read are deliberately unsupported.

> **Unstamped lifetime note:** component-instance support cannot stop at reading `$el` when the ref changes. The public component instance can remain identical while its rendered root moves through `null`, insertion, keyed replacement, removal, or a template-only HMR rerender; Vue 3.4 can also leave a stale non-null ref to an already detached host. The renderer reconciles internal ref-bound registrations by resolved host identity after every commit and invalidates removed subtrees synchronously. `useBoxSize()`, `useMouseEvent()`, and `useMouseDrag()` use that mechanism; the former `useDraggable()` supplied earlier evidence. See [rendered-target-lifetime.md](./rendered-target-lifetime.md).

#### Focus has a self handle and an optional Vue rendered target

- **Ink:** `useFocus()` registers logical focus without a rendered node. Its optional string ID and `useFocusManager().focus(id)` provide programmatic addressing; the hook does not return a zero-argument operation that focuses its own registration.
- **vue-tui:** every `useFocus()` call returns its own opaque handle with `focus()` and reactive `isFocused`, and every call shares one unique owner per app. The zero-argument overload remains logical and follows its Vue scope. `useFocus(target)` adds a Vue rendered-target validity constraint: a hidden or detached target or rendered ancestor clears ownership, and later availability does not restore it. The target is not the identity and supplies no traversal or input route.
- **Why:** a self handle covers ordinary local programmatic focus without a global string namespace, while applications or a public-only higher layer can build distant lookup with a `Map<string, UseFocusReturn>`. Vue template refs additionally let Runtime solve the ancestor-`v-show` case that Ink's logical-only registration cannot see. Both overloads stay in one controller so targetless and targeted components cannot claim focus independently. Exact target source and return type names remain under review; the accepted behavior and evidence are in the [`useFocus` review](./runtime-public-api-review.md#usefocus).

#### Entry point - `createApp()` instead of `render()`

- **Ink:** `render(<App/>, options?)`: `options` is `RenderOptions`; returns an `Instance`.
- **vue-tui:** `createApp(App)` returns a `TuiApp`; `app.mount(options?)` takes
  `MountOptions`.
- **Why:** mirrors Vue's own `createApp` mental model. A Vue developer expects an app
  object (`TuiApp`) they mount, not a one-shot render call. The mount-options bag and the
  app handle are therefore Vue-shaped (`MountOptions` / `TuiApp`), not `render()`-shaped
  (`RenderOptions` / `Instance`). Do not add Ink-compatible aliases here: aliases would
  make the public API look render-shaped while the actual runtime contract is app-shaped.
  KEEP. [VOUCHED @hyfdev]

#### Vue visibility replaces a public `display` prop

[VOUCHED @hyfdev 2026-07-23]

- **Ink:** `Box` includes `display: "flex" | "none"` in its public style vocabulary.
- **vue-tui:** the vouched minimum `BoxProps` has no `display` field. Applications use ordinary Vue conditional rendering and visibility directives instead of addressing Yoga display state directly.
- **Why:** component creation, destruction, and authored visibility already have Vue syntax and lifecycle meaning. Publishing the renderer engine's display switch would duplicate that framework responsibility without enabling another minimum layout or paint task. This entry decides the public API relationship only; exact `v-if` and `v-show` Runtime behavior is tested with the corresponding Vue lifecycle and renderer paths.

#### Nullish `flexDirection` / `flexWrap` reset to Box defaults

- **Ink:** the public `<Box>` injects `flexDirection:'row'` and `flexWrap:'nowrap'` before
  spreading user style. If a previously-set prop is **truly omitted**, that default reaches
  the host and both engines reset (`column` -> omitted renders `"A\nB"` -> `"AB"`; `wrap`
  -> omitted stops wrapping). But an explicit `flexDirection={undefined}` / `{null}` or
  `flexWrap={undefined}` / `{null}` overwrites the default before the host layer. Ink's
  `applyFlexStyles` has no reset branch for these two props, so a dynamic nullish value
  preserves the previous Yoga value. On first mount, nullish `flexDirection` leaves Yoga's
  column default; nullish `flexWrap` happens to match nowrap.
- **vue-tui:** nullish current values reset to the public Box defaults (`row` / `nowrap`)
  in the same way as true omission (G19). A conditional spread that removes the key remains
  parity with Ink; a live binding whose value becomes `null` or `undefined` intentionally
  resets instead of preserving prior Yoga state.
- **Why:** render = f(current props): a Vue binding with no current `flexDirection` /
  `flexWrap` value means "use the Box default", not "keep whatever Yoga had last render".
  Preserving the prior value would make layout depend on history rather than current props.
  The cost is limited to explicit nullish public bindings; true omission remains Ink-parity.
  Tests: `prop-reset.test.tsx`.

#### Withdrawing a `margin`/`padding` edge override falls back to the surviving shorthand

- **Ink:** when a box has both a shorthand and a more-specific override of the same family
  (`margin={5} marginTop={8}`, `margin={5} marginX={2}`, padding equivalents) and the override
  is later withdrawn, the edge **collapses to 0**, not back to the surviving shorthand
  (run-verified vs v7.0.4, both spread-removal and explicit `marginTop={undefined}`: with
  `margin:5 marginTop:8` the top margin renders 8 cells, and after removing `marginTop` it
  renders **0**, not 5). The cause is yoga edge precedence — a per-edge value (`EDGE_TOP`)
  overrides the all-edges shorthand (`EDGE_ALL`) **even when reset to 0** — combined with
  Ink's `applyMarginStyles`/`applyPaddingStyles` emitting one yoga setter per prop, so a
  withdrawn `marginTop` becomes `setMargin(EDGE_TOP, 0)` that still beats the surviving
  `EDGE_ALL=5`.
- **vue-tui:** the withdrawn override falls back to whatever shorthand still applies
  (`marginTop` removed from `margin={5} marginTop={8}` → top margin = 5). On any margin/padding
  prop change, `reconcileMarginEdges`/`reconcilePaddingEdges` recompute **all four physical
  edges** from the box's full current props with most-specific-wins precedence
  (`top = marginTop ?? marginY ?? margin ?? 0`, etc.) and zero the composite edges, so no stale
  per-edge value can shadow the shorthand. This mirrors the existing `reconcileBorderEdges`
  pattern (an edge that depends on several props can't be set correctly by a single
  per-prop yoga setter).
- **Spacing value contract:** an edge resolves from a prop only when it is a **finite number**
  (matching the `number` prop type + Ink's number-only margin/padding); a numeric **string**
  (`margin="5"`) is coerced for Vue **static-template attribute** ergonomics, but any other
  non-numeric value (`"50%"`, junk, `""`) is treated as **not-set** and falls through to the
  surviving shorthand rather than being forwarded to yoga. So the family recompute drops the
  OLD per-setter code's incidental, off-contract string forwarding — `marginTop="50%"` no longer
  becomes a yoga percent and `marginTop="foo"` no longer throws.
- **Why:** render = f(current props): with current props `{margin: 5}` the top margin is 5, full
  stop — a value that is no longer set must not linger via yoga's edge layering (G19, the same
  declarative-reset principle as the `display` and `flexDirection`/`flexWrap` entries above).
  This is NOT an Ink-parity item: Ink and pre-fix vue-tui both collapsed to 0 (the identical
  bug); the fix diverges from Ink by being declaratively correct. Verified against
  yoga-layout@3.2.1 that the recompute produces identical computed edges as the old per-setter
  code for the SET path (no layout regression), and the correct fallback on removal.
  Tests: `prop-reset.test.tsx`, `unit/yoga-prop-reset.test.ts`.

#### Historical public composable naming followed Vue conventions

- **Ink/React:** public APIs are hooks (`useFocus`, `useInput`, ...), but return-type naming
  is mixed: the stream/app hooks return exported context types named `XProps` (`useStdin` →
  `StdinProps`, `useStdout` → `StdoutProps`, `useApp` → `AppProps`), newer hooks return
  exported non-`XProps` types — result-named (`useBoxMetrics` → `UseBoxMetricsResult`,
  `useAnimation` → `AnimationResult`) or a bare data name (`useWindowSize` → `WindowSize`) —
  and the rest fit neither: `useInput`/`usePaste` return `void`, `useFocus`/`useFocusManager`
  return an unexported type, `useCursor` an inline shape, `useIsScreenReaderEnabled` a bare
  `boolean`.
- **vue-tui:** public APIs are Vue **composables** (`useFocus`, `useInput`, ...). Where a
  composable's return type is exported under a name, the name always follows VueUse's
  `UseXReturn` convention (`UseAppReturn`, `UseStdinReturn`, `UseStdoutReturn`,
  `UseStderrReturn`, `UseAnimationReturn`, `UseElementGeometryReturn`, `UseCaretReturn`, `UseLayoutSizeReturn`); the remaining composables
  return `void` or small unexported inline shapes — never an `XProps` type. `useRenderSession()`
  returns the exported domain model `RenderSession` rather than adding a duplicate hook-specific
  alias. `XProps` is reserved for component props (`BoxProps`/`TextProps`, derived via
  `ExtractPublicPropTypes`).
- **Options types follow the same principle:** Ink names a composable's options type locally
  `Options` / `Props` and usually does **not** export it (e.g. `useAnimation`'s `Options` is
  internal — only the return `AnimationResult` is exported, `use-animation.ts:14,30`). vue-tui
  exports each composable's options type under VueUse's `UseXOptions` name: `UseInputOptions`,
  `UseFocusOptions`, `UseCaretOptions`, `UseAnimationOptions`. `useAnimation`'s options type
  originally shipped as `AnimationOptions` — the lone holdout — and was renamed to
  `UseAnimationOptions` (a hard rename, no alias) while the package is pre-1.0 (`0.0.x`, no
  stability promise yet). **Export composable options types
  as `UseXOptions`; renamed `AnimationOptions` → `UseAnimationOptions`.** [VOUCHED @hyfdev]
- **Why:** the public surface should read like Vue code: named composable return types get a
  single convention (`UseXReturn`) instead of Ink's mix of `XProps`, result names, and bare
  names, and `XProps` keeps its Vue meaning (component props). Return shapes still mirror
  Ink field-for-field where the same public state exists; reactive state is represented as
  refs for the model-implied reason documented above. Do not export Ink-compatible alias
  names for these types: Vue-first naming is more important than making type imports look
  portable across React and Vue. KEEP. [VOUCHED @hyfdev]
- **Current disposition:** this naming rule remains historical evidence for composables that
  survive later boundary reviews, but it does not justify retaining a composable. The current
  minimum Runtime work removed `useAnimation`, `UseAnimationOptions`, and
  `UseAnimationReturn`; Path 1 likewise removed `UseLayoutSizeReturn` and
  `UseElementGeometryReturn`. The replacement layout hooks return refs directly, while the only
  new named measurement type is the domain value `BoxSize`. The vouched text above records the
  naming decision that applied while those exports existed.

#### Function-valued composable inputs use `MaybeRef`, not getters

- **Ink/React:** `useInput` and `usePaste` use React's current-props model: a hook can keep
  a stable event listener and still call the latest handler after a re-render.
- **vue-tui:** `setup()` runs once, so passing a function prop's current value directly
  (`useInput(props.onInput)`) captures a one-time snapshot. When `useInput` should follow
  a function-valued prop, pass a live prop ref instead:
  `useInput(toRef(props, "onInput"))`. A wrapper
  closure that reads `props.onInput(...)` at event time is also correct.
- **Why:** this is Vue's standard reactive-source boundary: pass the source, not a value
  read from it in setup. The handler parameter accepts `MaybeRef<Handler>` and resolves it
  with `unref()` when input occurs. It deliberately does **not** accept
  `MaybeRefOrGetter<Handler>` because a handler is itself a function:
  `useInput(() => {})` must remain an input handler, not be reinterpreted as a getter that
  returns one. KEEP. [VOUCHED @hyfdev]

#### Historical: `<Static>` used a scoped slot object instead of positional render arguments

- **Ink/React:** `<Static>` receives a function-as-children render callback and calls it as
  `render(item, absoluteIndex)`.
- **vue-tui:** `<Static>` exposes a Vue scoped slot with `{ item, index }`, so template
  users write `v-slot="{ item, index }"` and TSX users pass a slot function that receives
  one props object.
- **Why:** this is the framework-native match for React render children. Vue scoped slots
  pass one props object, not multiple positional arguments, and that object form is what
  Vue users expect for slot payloads. The rendered item/index values remain equivalent.
  KEEP. [VOUCHED @hyfdev]

**Active superseding note (unstamped, 2026-07-19):** `Static` no longer owns a collection and therefore exposes an ordinary zero-payload default slot. The vouched Vue rule remains applicable to any future collection wrapper: if it supplies item and index, it passes one scoped-slot props object rather than React-style positional arguments.

#### Historical experiment: ARIA props were typed camelCase

The current boundary and retained type-system evidence are in [accessibility-api](./accessibility-api.md). Runtime no longer exposes ARIA props, named ARIA types, a screen-reader presentation, or a hidden transcript path; this entry describes the removed experiment.

- **Ink:** kebab string-literal prop keys (`'aria-label'`, `'aria-hidden'`, `'aria-role'` union,
  `'aria-state'` object); JSX keys never camelize.
- **Historical vue-tui experiment:** the same vocabulary as typed **camelCase** props (`ariaLabel`/`ariaHidden`/
  `ariaRole`/`ariaState`; `AriaRole`/`AriaState` exported, identical to Ink's). Ink's kebab still
  works at runtime (Vue camelizes onto the declared prop), so `aria-role` ports unchanged.
- **Why (Vue idiom + reasonableness > parity — see "The governing principle"):** Vue's `prop-name-casing`
  mandates camelCase, and — run-verified with `tsc`/`vue-tsc` — **camelCase is the only spelling
  type-checked** (value/typo/compound mistakes compile-error in both TSX and templates), while
  kebab `aria-*` is not (Vue/Volar treat it as a global attr). So `ariaRole` is the type-safe
  spelling and `aria-role` the runtime-only porting escape; the rejected kebab-only `$attrs`
  alternative loses typing + Boolean coercion for nothing the checker doesn't already give.
  That vouch depended on retaining the ARIA feature and was removed when Yunfei chose to delete
  the feature rather than carry it in the minimum Runtime foundation.
- **Historical edges:** a future compound aria word would have needed to be declared as its mechanical camelize
  (`ariaHaspopup`, not `ariaHasPopup`) or folded into `ariaState`; `aria-hidden` is modeled
  boolean (bare → true), but the string `aria-hidden="false"` wrongly hid in the experiment.

## Intentional Divergence Choices

These divergences are deliberate, but they are not strict supersets and are not primarily
driven by Vue's framework model or API conventions. vue-tui intentionally chooses a
different runtime behavior, ownership rule, or out-of-contract handling.

### Box and Text expose a coherent minimum instead of Ink's complete style grammar

[VOUCHED @hyfdev 2026-07-23]

- **Ink:** exposes a broad Yoga-backed Box style grammar and its full Text style set, including capabilities and aliases beyond the ordinary foundation tasks reviewed for vue-tui.
- **vue-tui:** the vouched public shape has 46 `BoxProps` fields in nine concepts and nine `TextProps` fields in three concepts. It retains ordinary flex layout, gaps, constraints, positioning, spacing shorthand and edges, simple borders, background, axis clipping, independently inheritable or terminal-default foreground and background, six text modifiers, and the five `wrap`, `hard`, `truncate`, `truncate-middle`, and `truncate-start` width modes. It omits `display`, `alignContent`, baseline alignment, aspect ratio, percentage height, custom border objects and decoration fields, the `truncate-end` alias, a broad style bag, and separate named types for every enum or percentage helper. The exact shape and evidence live in the [Runtime public API review](./runtime-public-api-review.md#box-and-text).
- **Why:** Ink and other mature peers prove that the retained user tasks recur, while Runtime ownership explains why applications cannot reproduce them after final layout and paint. `hard` is retained as the word-boundary-independent wrapping primitive; ordinary `wrap` already breaks an individual over-wide word, so that case alone is not its justification. Minimum is measured by independent concepts rather than mechanically deleting shorthand and making normal Vue templates repetitive. The omitted capabilities either duplicate Vue, have unstable cross-host semantics, expose renderer details, add a synonym without a capability, or lack a current foundation task. They can be reconsidered additively if real application practice supplies one.
- **Boundary:** The second adversarial round found necessary numeric range handling and observable layout and text edge cases, but no additional field or named type. Those are implementation contracts and tests, not reasons to widen or narrow the vouched public shape.

### `Static` rejects a true Fullscreen surface

[VOUCHED @hyfdev 2026-07-23]

- **Ink:** keeps accepting `Static` when alternate-screen mode is active. The block can appear above Ink's replaceable region inside that buffer, but it is disposable when the terminal returns to the primary screen.
- **vue-tui:** a true Fullscreen surface that encounters `Static` throws explicitly and restores Runtime-owned terminal resources before reporting failure. It does not ignore the block or reinterpret it as mutable viewport content. `Static` remains isolated on `@vue-tui/runtime/inline`.
- **Why:** the public primitive promises terminal history, while a Fullscreen alternate buffer is a fixed application-owned viewport with no durable history. Explicit failure preserves the meaning of the component and tells applications to retain Fullscreen history in state and render it through an ordinary bounded viewport instead.

### Historical non-`Error` policy: uniform show-the-error-and-reject

- **Ink:** accepts the throw, but its handling is **non-uniform** (run-verified vs v7.0.4):
  for a **truthy** non-`Error` it renders an `ErrorOverview` showing a string `.message`
  (**blank** for a bare string, since `'boom'.message` is `undefined`) **and RESOLVES**
  `waitUntilExit()` with the **raw** thrown value — a throw looks like a clean exit. For a
  **falsy** throw (`0` / `''` / `null`) it renders **no** overview and leaves
  `waitUntilExit()` **PENDING** (recoverable — a later unmount resolves it with `undefined`).
- **vue-tui:** **any** thrown value renders an `ErrorOverview` (message = a string `.message`
  if present, else `String(value)`) **and REJECTS** `waitUntilExit()` with an `Error` whose
  `.message` **EQUALS the displayed message** — one `messageForNonError(value)` helper feeds
  both the overview header and the reject-wrap, so display and reject can't drift (e17). No
  synthetic stack (a value with no `.stack` renders only the header).
- **Why:** aligning to Ink reduces bugs only where Ink is correct. Ink resolving the exit
  promise with a thrown value, and silently hanging on a falsy throw, are abnormal, so
  vue-tui deliberately diverges to one uniform contract: show the error, reject the exit. Same
  recover-vs-crash family as the invalid-input-validation divergence. Showing a real message
  (string `.message` else `String(value)`) is useful for the lint-discouraged non-`Error`
  throw, and matching the rejected message to it removes a confusing internal inconsistency
  (`throw {message:'x'}` once displayed `x` but rejected `[object Object]`). Introduced
  2026-05-31; consistency fixed 2026-06-12. KEEP. [VOUCHED @hyfdev]

**Superseding decision, 2026-07-22:** Runtime removes its hidden component boundary, automatic `ErrorOverview`, and `app.config.errorHandler` override. Vue component errors now follow Vue and application handlers instead of this uniform Runtime show-and-reject policy. An Ink-like error screen is deferred as explicit optional `@vue-tui/components` behavior, not a Runtime default. See the vouched [Vue error-policy decision](./runtime-public-api-decisions.md#vue-component-errors-follow-vue) and [optional-error-UI decision](./runtime-public-api-decisions.md#pretty-component-error-ui-is-deferred-above-runtime).

### Invalid `exit` input is a programming error, not an exit result

[VOUCHED @hyfdev 2026-07-23]

- **Ink:** `exit(value)` accepts arbitrary JavaScript values as its selected application result, and `waitUntilExit()` resolves with that same value when it is not an `Error`.
- **vue-tui:** the public contract is only `exit(error?: Error): void`. Before teardown, a first non-`Error`, non-`undefined` value synchronously throws `TypeError` without selecting or consuming exit. A caller that catches the programming error can continue running. After teardown begins, later calls remain no-ops and do not validate arguments.
- **Why:** vue-tui has no public success-result channel, so accepting arbitrary values would add an untyped behavior absent from its API. Converting an invalid value into a selected error would also consume the app even when the caller catches the `TypeError`. The exception itself may still reach normal Vue or input error handling when uncaught.

### Ctrl+C defaults to ordinary normalized input

[VOUCHED @hyfdev 2026-07-23]

- **Ink:** defaults `exitOnCtrlC` on and recognizes the legacy Ctrl+C byte in its application layer; applications opt out when they need to handle Ctrl+C themselves.
- **vue-tui:** `MountOptions.exitOnCtrlC` defaults to `false`. With the default, an active `useInput()` subscription receives Ctrl+C as an ordinary normalized key. When explicitly `true`, Runtime exits before delivering that exact key event. Recognition is semantic across supported legacy and enhanced protocol encodings, while paste contents never trigger the option.
- **Why:** application input remains observable by default and requires no return-value propagation protocol. The explicit option still supplies the common command-line behavior when requested. With no active managed input demand, Runtime leaves stdin cooked and the operating system and terminal retain their ordinary signal behavior.
- **History:** this supersedes both the older always-on delayed default that handlers could prevent and the later removal of the mount option. Those implementations remain historical evidence, not the accepted public contract.

### Mount and used-stream failures are transactional lifecycle failures

[VOUCHED @hyfdev 2026-07-23]

- **Ink:** run-verification of pinned 7.0.4 found that an initial output failure can leave alternate-screen or resize state installed, while asynchronous stream errors are not consistently routed through teardown and `waitUntilExit()` and may instead crash or leave the exit promise pending.
- **vue-tui:** deterministic option, stream, ownership, and Fullscreen checks run before user setup or terminal mutation. Subsequent acquisition installs reverse cleanup as each resource is obtained. Once mounted, a failure of stdout or of an accepted stdout or stderr write, or loss of stdin while active input needs it, records the first cause, tears down, and rejects `waitUntilExit()` after accepted output finishes or is abandoned. Input-free stdin EOF is not fatal, `EPIPE` is not silent success, close without an `Error` receives a stable Runtime error, and later cleanup failures do not replace an earlier cause.
- **Why:** a caller needs one truthful result for the terminal operation. Leaked modes, process-level crashes, pending exit promises, and false clean completion all violate that result. The ordering still lets Vue setup reveal whether stdin is actually required: Runtime validates active demand before raw-mode acquisition and rechecks a later inactive-to-active transition.

### Re-measure text when the `wrap` prop changes at runtime

- **Ink:** a runtime `wrap` (style `textWrap`) change goes through `commitUpdate` →
  `applyStyles`, but `applyStyles` **ignores `textWrap` entirely** (styles.ts) and never
  calls `yogaNode.markDirty()`. Only `setTextNodeValue` (a text-CONTENT change) dirties the
  measure func. So when ONLY `wrap` toggles, yoga keeps the previously-measured height while
  paint renders with the new wrap mode → layout and paint disagree. Run-verified vs v7.0.4
  (`/tmp/ink-verify`, append-oriented diagnostic capture): a width-6 column `<Box>` with
  `<Text wrap>` over `"aaaa bbbb cccc"` and a `ZZZZ` sentinel below, toggled wrap→truncate,
  yields `"aaaa …\n\n\nZZZZ"` — the truncated text paints on row 1 but yoga still reserves 3
  rows, stranding `ZZZZ` on row 4 with blank rows. Toggling text content alongside `wrap`
  (which DOES `markDirty`) gives the correct `"aaaa …\nZZZZ"`, proving the cause.
- **vue-tui:** the host `patchProp` (`node-ops.ts`) calls `markTextDirty(el)` when the changed
  STYLE_PROP is `wrap` on a `tui-text` node, so yoga re-measures and layout matches paint:
  wrap→truncate collapses to `"aaaa …\nZZZZ"`, truncate→wrap grows to
  `"aaaa\nbbbb\ncccc\nZZZZ"`. `wrap` is the only STYLE_PROP that affects measured height (the
  measure func reads `text.props.wrap`); the rest (color/bold/border colors/…) are paint-only,
  so this is the sole case.
- **Why:** the correct behavior is the declarative invariant — a runtime `wrap` change must
  produce the EXACT SAME frame as a fresh mount with that `wrap` (measure == paint, render =
  f(current props)). This is VERIFIED across the full 6-mode transition matrix (`wrap`, `hard`,
  `truncate`, `truncate-end`, `truncate-middle`, `truncate-start` → all 30 ordered transitions):
  each toggled frame equals the fresh-mount frame for the target mode. Ink v7.0.4 diverges from
  this correct behavior — a run-verified latent bug where `applyStyles` ignores `textWrap` and
  never `markDirty`s, leaving a stale cached measure that contradicts paint. Aligning to Ink
  reduces bugs only where Ink is correct; here Ink is buggy, so vue-tui keeps the correct
  invariant. The fix is minimal (one `markDirty`) and matches the layout Ink ALREADY produces
  whenever its measure func happens to be invalidated. KEEP. [VOUCHED @hyfdev] Tests:
  `text-wrap-remeasure.test.tsx` (both directions; RED without the fix, reproducing Ink's stale
  frame) and [`text-wrap-remeasure-matrix.test.tsx`](../../packages/runtime-tests/integration/layout/text-wrap-remeasure-matrix.test.tsx) (the two public modes plus a private raw-host Vue-reactive suite covering the full retained 6-mode / 30-transition internal matrix; 16 transitions go RED without the fix).

### Historical second-mount policy: an inert no-op on a live stdout

- **Ink:** `render()` keeps one instance per stdout (`WeakMap<WriteStream, Ink>`); a second
  `render(node, {stdout})` on a stream that already has a live instance warns on stderr but
  **reuses** that instance and `rerender`s the new tree into it.
- **vue-tui:** a second `mount()` on a still-live stdout warns on stderr, wires no second
  renderer, renders nothing, and returns an empty placeholder object (the real controls —
  `unmount()`, `waitUntilExit()` — live on the app, not on `mount()`'s return value). The
  first app's tree stays on screen. The skip is scoped to that one guarded call — derived
  from what the app actually wired, never sticky: a guarded _different_ app's `unmount()`
  settles only its own exit promise and never touches the owner's stream or registry entry;
  the _owner_ double-firing `mount()` on its own stdout keeps a fully working `unmount()`
  (the warning's recovery path); an app that once hit the guard can later mount — and
  cleanly unmount — on a free stdout; and a live app that merely targeted another app's
  busy stream stays fully killable.
- **Why:** a second `mount()` on a live stdout is a misuse (forgot to `unmount()`, a
  re-render glitch fired `mount()` twice, or expecting `mount()` to re-render — it doesn't;
  update reactive state for that). Ink treats it as unsupported and warns too. vue-tui fails
  safe: it ignores the second mount, keeps the live app rendering, and warns with the two
  recovery paths. It deliberately doesn't copy Ink's reuse-and-rerender: there's no clean
  public path to it (`createApp` binds the tree to the app, so an Ink-style rerender would
  mean reaching into the live app's container or tearing it down first), and on a misuse path
  keeping the running app stable beats auto-tearing it down (which would churn on a re-render
  glitch). KEEP. [VOUCHED @hyfdev] Test: `instance-reuse-guard.test.tsx`.

**Superseding decision, 2026-07-22:** mounting against an already-owned stdout throws synchronously before state mutation, does not consume the app, and permits retry after the owner releases the stream. The warning, inert success, and placeholder component instance are removed. See the [vouched mount-ownership decision](./runtime-public-api-decisions.md#mount-ownership-and-consumed-failure-reporting-are-explicit).

### Screen mode is explicit and unavailable Fullscreen fails

[VOUCHED @hyfdev 2026-07-23]

- **Ink:** `alternateScreen?: boolean` requests the alternate buffer and `interactive?: boolean` controls a broad output policy. Pinned Ink silently ignores alternate-screen entry on non-TTY stdout and uses fallback dimensions when terminal size is unavailable.
- **vue-tui:** the only public screen selector is `mode?: "inline" | "fullscreen"`, defaulting to Inline. An explicit Fullscreen request requires TTY stdout and positive resolved dimensions and synchronously fails before user setup or terminal mutation when either is unavailable. It never silently changes the request to Inline. Output cadence is private and derived from the host; `liveUpdates`, `interactive`, `alternateScreen`, and `fullscreen` compatibility options are absent.
- **Why:** Inline and Fullscreen have different viewport and terminal-ownership semantics. Returning successful Inline behavior for an explicit Fullscreen request would make the application's requested layout and lifecycle false. Removing the public cadence switch also keeps the minimum API from exposing an orthogonal renderer policy whose non-TTY result is terminal-control output rather than a useful redirected document.

### Deterministic observation is separate from output; `debug` is removed

- **Ink:** public `debug: true` changes stdout behavior: every commit writes complete current content, Static history can be replayed, clear and console-patching behavior changes, and final-stream teardown follows a distinct diagnostic path.
- **vue-tui:** own `debug` keys on live mounts and `@vue-tui/testing` render options are removed programming errors and fail before terminal or component mutation. The testing package installs a symbol-keyed internal render observer that receives structured `{ dynamic, staticOutput }` commits without selecting a host, changing stdout, disabling console handling, or changing scheduling. Terminal-visible assertions use an independent xterm emulator; `maxFps: 0` remains an unthrottled scheduler choice rather than an output mode.
- **Why:** output policy and observation have different consumers. Making tests alter application bytes produced sessions that claimed production cadence while stdout followed an append-only diagnostic branch, and content frames had to be inferred from a stream containing terminal controls. Orthogonal observation lets the deterministic host exercise the real Inline, Fullscreen, live-stream, and final-stream paths while exposing both semantic commits and the resulting terminal screen. Direct removal is appropriate while vue-tui is experimental. Implemented and verified in F1.5.

> **Implementation checkpoint, 2026-07-24:** the vouched `useStdin` section below is now implemented. Its final historical bullet still records the earlier pending state and is preserved verbatim because the vouch covers the whole section.

### `useStdin` keeps Ink's complete low-level shape with safer ownership

[VOUCHED @hyfdev 2026-07-23]

- **Ink:** `useStdin()` publicly returns the selected `NodeJS.ReadStream`, `setRawMode(boolean)`, and `isRawModeSupported`. `useInput`, `useFocus`, and `usePaste` share one anonymous raw-mode count. This supplies a complete component-level escape, but an unmatched public `false` can decrement another consumer's hold, and enabling managed input changes the stream encoding.
- **vue-tui:** the accepted public shape likewise returns the selected stream, raw-mode capability, and a boolean setter, with `stdin` widened to the accepted Node `Readable` protocol. Each Vue hook call owns one idempotent logical hold, scope disposal releases it automatically, and managed `useInput()` owns a separate internal hold. One caller therefore cannot disable another. Physical raw mode and ref state remain Runtime-coordinated across shared streams, suspension, resume, HMR, failure, and teardown. Raw-only use starts no Runtime parser, Kitty negotiation, or bracketed-paste reporting; direct observation remains outside safe composition guarantees with `useInput()`.
- **Why:** retaining only the stream was an incomplete middle state: it neither supplied Ink's usable low-level input capability nor enforced a managed-only model like Bubble Tea or Textual. The complete escape lets a third-party component implement alternative low-level behavior without Runtime internals, while per-hook ownership preserves Runtime's terminal restoration and prevents the interference that caused the controls to be removed experimentally.
- **History:** the former mount-wide `rawMode: "always"` policy remains removed because it could keep an input-free process alive. The later stream-only `useStdin()` experiment and removal of its controls are superseded by the vouched target. The internal semantic-demand and raw reconciliation mechanisms remain reusable; public implementation is pending.

### `useCursor()` re-asserts the declared caret every commit (persistent declaration)

- **Ink:** `useCursor`'s no-deps `useInsertionEffect` (`use-cursor.ts:27-32`) re-marks the
  cursor dirty only when **the cursor's React component re-renders**, and log-update emits
  the caret only on a dirty commit. React's render cascade re-renders the child on an
  **ancestor**-driven commit (so Ink re-asserts there), but on an unrelated **sibling/leaf**
  repaint the cursor component does not re-render — Ink does **not** re-assert and the caret
  is dropped, **zombieing** to the bottom-left corner (run-verified vs v7.0.4: a sibling
  spinner tick ends `…> hello\n` with no caret suffix, leaving the caret at row 2 col 0).
- **vue-tui:** the runtime re-emits the **last-declared** caret at the **end of every
  commit** (until the declaration changes or is cleared), so a focused input's caret stays
  at its edit point across unrelated repaints (spinner / log line / progress bar) in **all**
  component topologies. The hide-before-erase / show-at-resolved-position flicker discipline
  is preserved (no corner streak), and the re-emitted position is clamped to the visible
  region (y to the line count, x to the width) so a post-resize/shrink stale coordinate
  never moves out of range.
- **Why:** this is a **deliberate divergence FROM Ink toward correct terminal-app
  behavior**, not Ink-alignment. Real terminal programs that own an edit point re-place the
  caret at that point **every frame** (vim emits `\e[<row>;<col>H` after each repaint;
  readline re-lands the buffer offset on SIGWINCH; nano homes to its edit cell) — they never
  leave the caret where the repaint dragged it. Aligning to Ink exists to reduce bugs, not to
  preserve abnormal behavior; matching Ink's topology-conditional zombie would preserve
  abnormal behavior, so vue-tui diverges. Per the classification flow this is **not** a
  Model-Implied difference (Vue is not _forced_ here — fine-grained reactivity could also be
  made to re-run the child; the runtime simply chooses to be more correct than Ink at the
  commit level), and it is not Vue-API-shaped, so it lands in **Intentional Divergence
  Choices**. The `{x,y}` `setCursorPosition` surface is **unchanged** — it remains the right
  low-level IME primitive (a composing glyph offset deliberately decoupled from the buffer
  point); the fix is an internal per-commit re-emit, so the public API stays compatible. A
  cleared declaration (`setCursorPosition(undefined)`, e.g. `useCursor`'s `onScopeDispose`
  on unmount) re-emits no caret, so teardown still ends with the cursor shown and handed back
  (`\x1b[?25h`); the persistent re-emit runs **before** the unmount clear, so it cannot
  resurrect a torn-down caret. The one accepted residue is a stale-but-in-range absolute
  position if an app declares a fixed `{x,y}` and then shrinks content without re-declaring
  (it parks at a plausible spot, strictly better than a corner-zombie); a future **Stage 2**
  focus-owned, content-tracking caret (recomputed from the focused widget's layout each
  frame) would dissolve that residue. Tests: PTY `cursor-sibling-repaint.test.ts` (a
  sibling-topology spinner tick re-asserts the caret, not the corner) and unit
  `frame-writer.test.ts` (a non-dirty changed-output re-render re-emits the declared suffix;
  D5 clamp). **OVERRIDE prior KEEP — adopt per-commit
  re-assert.** [VOUCHED @hyfdev] The prior KEEP (2026-06-01) had kept the reactivity-tied behavior to avoid
  diverging from Ink in the sibling direction; that rationale was overturned when running
  real terminal apps showed Ink itself zombies the caret there, so matching Ink was matching
  a defect, not parity.

**Unstamped F5 supersession:** the vouched section above records why the writer must reassert the selected caret after every repaint; that mechanism remains. F5 has now removed the public targetless `useCursor()` setter and `CursorPosition` type rather than preserving the historical `{x,y}` authoring conclusion. `useCaret(target, { focus, position })` accepts an element-local rendered cell, one per-app arbiter selects the effective F4 owner after paint, and the private mode writer reasserts only that validated surface result. Hidden, clipped, detached, unavailable, invalid, and outside requests produce no physical terminal-cursor placement instead of being clamped. This supersession is unstamped and does not alter the historical VOUCHED text.

### Resize unconditionally cancels the pending trailing commit

- **Ink:** `resized()` paints synchronously via `onRender()` but does **not** cancel a
  pending throttled `onRender`; when that trailing commit re-runs and
  `shouldClearTerminalForFrame` clears (because the previous frame overflowed), Ink emits a
  **second** `clearTerminal`.
- **vue-tui:** `onResize` calls `scheduler.cancel()` as its **first, unconditional** step on
  **every** resize, dropping any pending throttled commit before its synchronous commit. A
  same-size event consumes the pending tree once; a real Inline geometry change establishes
  a fresh region once and cannot be followed by a stale timer repaint.
- **Why:** the synchronous resize commit already reflects the current host tree. A pending
  timer represents the same tree and would only repeat terminal writes after the resize
  boundary (issue #26). Cancellation is independent of whether the terminal narrowed,
  widened, or only changed height.

### Inline bounds its live region instead of deleting terminal history

- **Ink:** Inline Yoga receives only terminal width. A frame that fills the terminal omits its
  trailing newline, but layout itself remains vertically unbounded. After an earlier overflow,
  on a fit-to-overflow transition, on a full-height/overflow-to-shorter transition, or while
  tearing down a full-height frame, Ink writes `ansiEscapes.clearTerminal`, retained Static
  output, and the current frame. With ansi-escapes 7.3.0 that reset is `ED2 + ED3 + Home`; ED3
  deletes scrollback, including output from before the application.
- **vue-tui:** a visual Inline terminal session exposes terminal rows as a **maximum** layout
  height. The runtime first computes natural Yoga layout; only a tree that exceeds the maximum
  is recalculated against the available rows, which avoids making percentages inside a short
  tree resolve against terminal height. Paint then hard-clips both columns and the final root
  height, so a non-shrinking child or transform cannot create extra physical wraps or rows.
  Overflow keeps the layout's row-zero projection; a coding-agent tail, finder selection, or
  monitor follow state is expressed by Static, ScrollBox, or application state rather than a
  renderer-wide tail slice.
- **Ownership:** before the first visible managed output, vue-tui emits one NEL on the main
  screen. This leaves a pre-existing partial row untouched and gives the relative writer a row
  boundary it can own; an empty app emits no initial NEL. Static and coordinated stdout/stderr
  output clear only the known live region, append bytes once, finish an unterminated TTY payload
  with NEL, and redraw below it. On TTY destinations the coordinated helpers retain styled lines
  while stripping cursor/erase and other geometry-changing control bytes. Redirected stderr and
  non-TTY streams remain byte-exact; returned raw streams and direct process writes stay outside
  the guarantee. After `app.clear()` erases the live region, vue-tui forgets that physical
  baseline so a repeated clear cannot walk upward into pre-app history.
- **Resize and teardown:** after a real Inline dimension change, terminal reflow makes the old
  logical-line count untrustworthy. vue-tui moves to the resized viewport bottom, creates a new
  row, resets writer bookkeeping **without erasing**, and paints a fresh bounded region; the old
  frame is immutable history. Teardown first returns a declared application caret to the region
  bottom; a full-height final frame then advances once so subsequent shell output begins below it.
  Framework-generated Inline controls emit no ED2, ED3, or Home.
- **Escape hatch:** destructive main-screen control remains session-external: an application may
  clear before mount or after teardown, or choose Fullscreen for arbitrary viewport repaint.
  There is no ordinary `preserveHistory: false` policy or mounted destructive reset.
- **Evidence:** `inline-overflow-comparison.test.ts`, `inline-resize-history.test.ts`,
  `inline-clear-history.test.ts`, `resize-clear.test.tsx`, deterministic host screen tests,
  geometry-safe text/coordinator tests, and frame-writer reset tests cover pre-app scrollback,
  partial rows, repeated clear, overflow, width/height resize, Static, coordinated output,
  declared-caret teardown, and the post-app line. This deliberately
  replaces Ink's overflow behavior rather than treating its ED3 fallback as compatibility.

### Fullscreen owns a fixed viewport instead of reusing the inline writer

- **Ink:** `alternateScreen: true` switches buffers but keeps the relative inline output writer.
  Run-verified against v7.0.4 (`40b3a757`, real PTY + xterm, 32×10): an initial `<Static>` leaves
  `STATIC` on row 0 and moves `DYNAMIC` to row 1; successive `useStdout`, `useStderr`, patched
  `console.log`, and patched `console.error` writes move the dynamic frame down one more row each.
  With `debug: true`, rerenders append in place (`DYNAMICFRAME-1FRAME-2`) instead of replacing the
  alternate-screen surface.
- **vue-tui:** effective Fullscreen visual rendering owns the current `columns × rows` viewport. Yoga receives both dimensions, and paint plus hit testing clip to them. After a valid baseline, ordinary consecutive frames replace only changed rows through absolute cursor addressing. Initial paint, dimension changes, continuation, `app.clear()`, uncertain physical output state, and coordinated stdout, stderr, or patched-console output clear, home, and repaint the complete viewport. The renderer hides the physical cursor before output and restores the selected focus-bound semantic caret afterward. `Static` from `@vue-tui/runtime/inline` is rejected on presence before history bytes, dynamic output, observation, or a new viewport frame. If setup already acquired terminal leases, the ordinary fatal path restores them before reporting. Deterministic observation does not change physical output.
- **Why:** targeted mouse events, the resolved caret surface point, and Yoga layout all use viewport coordinates. If output outside the tree can move the visible frame while the hit map remains at row 0, clicking the visible element misses and clicking the log line can trigger it. Treating Fullscreen as an owned fixed surface keeps all four coordinate systems identical and prevents tall content from scrolling the alternate buffer. Absolute row replacement reduces ordinary output without changing that contract and is independent of `incrementalRendering`.
- **Boundary:** direct `process.stdout.write()` / `process.stderr.write()` calls bypass the runtime
  coordinator and cannot be repaired automatically. Introduced 2026-07-11 and completed for live mounts in F1.4.
  Tests: `fullscreen-origin.test.ts`; full contract:
  [fullscreen-output.md](./fullscreen-output.md). The Static rejection was accepted on 2026-07-15
  during Runtime closure Stage 3 and adds no VOUCHED stamp.

### Degenerate boxes do not lay out or paint children when the content area is gone

- **Ink:** its size model is border-box-like: `width`/`height` are handed to Yoga as the
  element's outer size, while border and padding consume space inside that size. Ink has no
  `boxSizing` / `content-box` prop. During paint, though, Ink only clips children when
  `overflow` is hidden. With default visible overflow, children can leak into border rows
  or outside the box when border/padding squeeze the content area to zero, and a bare
  `width={0}` Box can still let zero-width text wrapping create extra visible rows
  (`B\nA` beside a sibling). Examples in Ink v7.0.4 include:
  `width={3} height={2} borderStyle="single"` painting the child on the bottom border row;
  `width={2} height={3}` leaking the child past the right border;
  `width={4} height={3} paddingX={1} borderStyle="single"` leaking into the bottom
  border; and bare `width={0}` text reserving rows through wrap-ansi's width-0 layout.
- **vue-tui:** layout computes each Box's inner content size by subtracting computed border
  and padding from the outer box size, clamps it to `{width >= 0, height >= 0}`, and
  temporarily removes that Box's **in-flow** yoga children from the layout when either
  dimension is zero. Paint applies the same inner-content gate, so the in-flow child subtree
  neither reserves invisible rows nor writes glyphs outside a nonexistent content area.
  Border and background are still painted as far as the outer area permits.
  **Absolutely-positioned children are exempt** — their containing block is the padding box
  (inside the borders), not the content rect, so they still lay out and paint (clipped only
  by `overflow:hidden`), matching Ink. Positive-size content areas keep the
  existing overflow behavior; this is not a blanket `overflow:hidden`.
- **Layout model guidance:** primitive `Box` should preserve the Yoga/flexbox model rather
  than paper over it with ad-hoc layout corrections. Defaults such as `flexShrink: 1` are
  part of that model, and a child resolving to zero width or height can be a valid layout
  result. Higher-level components are where stronger user intent belongs: scroll, list, and
  viewport abstractions should keep their content at natural size (`flexShrink: 0`, or an
  equivalent encapsulated default) and let a bounded viewport clip or offset what is visible.
  Paint containment is the renderer invariant underneath both cases: whatever Yoga resolves,
  **in-flow** children may only paint inside their owning Box's content rectangle; if that
  rectangle has no positive width or height, the in-flow child subtree does not paint.
  Absolutely-positioned children are the exception — they paint against the containing block
  and are suppressed only by `overflow:hidden`, matching Ink.
- **Why:** children need a real content rectangle to lay out and paint into. If the
  resolved content width or height is zero, rendering child text or nested borders on top
  of the frame, outside the box, or on later rows is an implementation artifact, not useful
  output. This follows the common TUI box model: Ratatui renders child widgets into an
  inner `Rect`, Textual reduces content space from the assigned box, and Rich panels render
  children with child width/height after subtracting the border. Bubble Tea's viewport
  follows the same separation at the component level: content keeps its natural size while
  the viewport exposes a bounded visible window and offsets. The behavior also prevents
  negative repeat/count math and paint crashes in tiny legal boxes. KEEP. [VOUCHED @hyfdev]
  Tests: `text-wrap-width.test.tsx`, `flex.test.tsx`,
  `text.test.tsx`, `absolute-in-degenerate-box.test.tsx`.
- **Future `content-box`:** this does not block adding an explicit content-box option
  later. That option would change how a requested size is expanded into an outer box size
  before layout. Once an outer box exists, the paint invariant remains the same: a child
  subtree only lays out and paints when the resolved inner content rectangle has positive
  width and height. The default remains border-box-like, matching Ink's current public
  sizing model.

### Left clipping preserves source columns after a straddling wide grapheme

- **Ink:** when a wide grapheme straddles the left edge of an `overflow:hidden` clip, `slice-ansi` drops that grapheme whole and Ink resets the write origin to the clip edge. Any following text is therefore shifted left over the dropped source cells. For `"中x"` written at `x=-1`, Ink v7.0.4 renders `"x"` at column 0.
- **vue-tui:** drops the same straddling grapheme whole but advances the write origin to the first retained grapheme's original source column. The same example renders `" x"`: column 0 stays blank and `x` remains at column 1.
- **Why:** clipping decides which source cells are visible; it must not change the layout coordinates of cells that remain visible. Reflowing retained text makes paint coordinates disagree with layout, geometry, hit testing, and caret placement. Preserving the gap keeps one stable surface coordinate for each painted source cell.
- **Boundary:** horizontal clipping still runs before `<Transform>`. A transform receives the clipped substring, but its output begins at that retained substring's original column. Ordinary narrow-character clipping is unchanged, and a wide grapheme that straddles the right edge is still omitted whole.
- **Evidence:** [`overflow.test.tsx`](../../packages/runtime-tests/integration/layout/overflow.test.tsx) covers plain wide and ZWJ graphemes at both viewport edges. [`private-transform.test.ts`](../../packages/runtime/src/paint/private-transform.test.ts) proves that the raw private Transform receives the clipped span while the following text keeps its source column. The `horizontal-left-wide` Fullscreen fixture is also exercised through a real PTY in [`fullscreen-origin.test.ts`](../../packages/runtime-tests/integration/pty/fullscreen-origin.test.ts) and is available to the visual review controller. The Ink result above was previously run-verified against the pinned v7.0.4 build; this entry deliberately chooses the spatially stable behavior instead.

### Nested overflow keeps every ancestor clip active

- **Ink:** Output replay uses only the most recently pushed component clip, then applies `Transform` without clipping the callback result again. A larger inner `overflow:hidden` region or an expanding transform can therefore reopen cells already excluded by a narrower outer overflow ancestor.
- **vue-tui:** Output replay intersects the complete active overflow stack, then intersects the terminal viewport boundary. `Transform` still receives the pre-clipped source span, but its result is contained by that same intersection. A descendant can narrow its visible region but cannot expand an ancestor-owned region.
- **Why:** overflow is a containment boundary. Paint, semantic geometry, and later targeted pointer selection must agree on the same ancestor intersection; allowing paint to escape while hit testing remains clipped creates visible cells that no semantic target owns. This is an unstamped F5 implementation decision.
- **Evidence:** [`overflow.test.tsx`](../../packages/runtime-tests/integration/layout/overflow.test.tsx) covers the retained public vertical ancestor intersection. [`private-transform.test.ts`](../../packages/runtime/src/paint/private-transform.test.ts) uses raw private hosts to cover a width-eight inner clip inside a width-four ancestor, post-transform containment, and constant plus appending Transform results at the ancestor's exclusive right edge. These Transform cases preserve internal paint evidence without making Transform or horizontal-overflow props public again.

### Historical: `measureElement` coerced a non-finite pre-layout dimension to `0`

- **Ink:** `measureElement` returns `{ width: node.yogaNode.getComputedWidth() ?? 0, height: ... ?? 0 }`.
  Before the first layout pass yoga's `getComputedWidth()`/`getComputedHeight()` return **`NaN`**, and
  `?? 0` does **not** catch `NaN` (`NaN ?? 0 === NaN`), so a pre-layout / mis-timed read returns
  `{ width: NaN, height: NaN }`.
- **Historical vue-tui behavior:** the former imperative API coerced a non-finite computed dimension to `0`, so a pre-layout read stayed finite. This was safer than leaking `NaN`, but `0` still overloaded a legitimate zero-size result, a detached target, and a not-yet-painted target.
- **Current foundation disposition:** `measureElement()` and the later broad `useElementGeometry()` projection are removed. `useBoxSize()` publishes only a direct same-app Box's last accepted full size or `null`; a real zero-size Box remains distinguishable as `{ width: 0, height: 0 }`. The earlier sentinel and geometry-state behavior remains decision history, while the accepted-paint authority stays private.

### Historical: out-of-type style values were forwarded instead of defensively coerced

- **Ink:** several flex/align setters coerce an invalid runtime value to a default:
  `flexShrink` non-number -> `1`; `alignItems`/`alignSelf`/`alignContent`/
  `justifyContent` falsy (`""`) -> their default (STRETCH / AUTO / FLEX_START); and an
  out-of-set value matches none of Ink's `if`-chain branches, so no setter runs and the
  previous/default value persists.
- **Historical vue-tui behavior:** these setters trusted the typed prop surface and forwarded the raw value to
  yoga: a non-number `flexShrink` is passed through; `toAlign("")`/`toJustify("")` look up
  `""` and pass `undefined` to the setter; and out-of-set values that yoga happens to
  accept (`space-*`/`auto` on `alignItems`) reach yoga rather than being ignored.
- **Historical rationale:** every one of these was reachable **only** via a TS-bypass. The public prop types
  forbid them. Within the typed contract Ink and vue-tui are identical. Ink's per-value
  coercion is defensive code for runtime values vue-tui's types already exclude. Duplicating
  those `typeof`/falsy guards would add checks for inputs the public types reject.
  (`flexGrow` is not in this set: both only coerce null/undefined -> `0`.) If a reviewer
  shows any case is reachable in-type, it becomes a bug to fix, not a divergence.
- **Current disposition:** the closed `Box` component validates every retained enum and numeric
  domain at render time, and rejects undeclared removed props such as `alignSelf` and
  `alignContent`; a TS bypass no longer reaches Yoga through the public component. The private
  raw `tui-box` host still keeps broader defensive renderer mechanics for existing internal
  paths, but those mechanics are not a public input contract. This entry is historical rather
  than a current divergence; the exact current evidence is
  [`public-prop-contract.test.tsx`](../../packages/runtime-tests/integration/components/public-prop-contract.test.tsx).

### Composables throw outside a render tree

- **Ink:** the hooks read a React context whose **default** value is a no-op object, so
  calling e.g. `useStdin()` outside an Ink tree returns inert defaults without an error.
- **vue-tui:** the current public `useApp`, `useStdin`, `useLayoutWidth`, `useViewportHeight`, `useBoxSize`, `useFocus`, and `useInput` composables **throw** when their required context is absent. Removed composables followed the same guard while they existed. The removed `useAnimation` used to avoid throwing by creating a standalone scheduler; that behavior is recorded in the historical entry above.
- **Why:** a composable used in the wrong place is usually a bug, and a thrown error names it at
  the call site instead of returning a context that quietly does nothing. An unbounded document is
  not a missing context: inside a valid tree, `useViewportHeight()` returns `null`, and
  `useBoxSize()` returns a ref whose value is `null` when visual Box measurement is unavailable.
  No-op defaults outside a Runtime tree would hide bugs.

### Box and Text validate their closed public contracts at the component layer

- **Current contract:** `Box` and `Text` have a closed declared-prop surface. Their component
  render validates every retained structural value, including numeric domains, canonical
  percentage width, enum values, offset/position coupling, booleans, and
  the two public Text wrap modes. Undeclared attributes are rejected instead of falling through
  to a raw host. Visual-only colors and border style are validated when a visual frame can use
  them. The exact accepted and rejected values are locked by
  [`public-prop-contract.test.tsx`](../../packages/runtime-tests/integration/components/public-prop-contract.test.tsx).
- **Layer:** `box-validate.ts`, `text-validate.ts`, and `unsupported-attrs.ts` run from the
  `Box` / `Text` component render before Vue patches a host node. A bad value therefore follows
  Vue's ordinary component-error path through user `onErrorCaptured` and
  `app.config.errorHandler` behavior instead of crashing or wedging the later paint callback.
- **Ink visual-input comparison:** Ink validates the overlapping color and border inputs
  **lazily at paint** (`colorize` / `render-border`, run from the reconciler's commit hook):
  **outside** React's
  ErrorBoundary, so a bad value is an uncaught crash, not a recoverable error.
- **Why for visual inputs:** the key constraint is where paint runs. vue-tui's paint runs in a Vue
  **post-flush callback** (`queuePostFlushCb`, decoupled from render), so a throw there
  escapes `onErrorCaptured` and wedges the scheduler. Unlike a component error, it cannot
  be made recoverable. The escape itself is symmetric, not a Vue weakness: a component error
  boundary covers framework-managed component work, never the renderer's paint callbacks, so a
  paint-layer throw is uncatchable in **both** engines. Validating in `Box` / `Text` keeps a bad
  user value on Vue's defined component-error path; Ink's paint-time check can only crash. This
  is a deliberately chosen fail-safe given a constraint that is symmetric across React and Vue
  (recover-vs-crash), not a Vue-model-forced difference — hence an intentional choice rather
  than a model-implied one. Provenance: the wedge claim rests on the earlier paint-throw
  investigation; the 2026-06-12 audit could not reach a paint throw from public or raw-host
  input (paint's `if (!chars) return;` border fallback intercepts an invalid `borderStyle`
  that bypasses component validation), so it stands on that prior record, not an in-audit
  reproduction.
- **Historical vouched visual-validation cost:** the component-layer check is eager (no paint-time layout/squash info), so it
  over-throws in a few degenerate, invalid-input-only cases Ink never reaches. For the
  covered public inputs in normal reachable cases, both libraries error; only the channel
  (recoverable reject vs crash) differs. KEEP. [VOUCHED @hyfdev] vue-tui
  makes the more reliable library choice here: reject the same invalid input with a
  recoverable, prop-specific error instead of preserving Ink's lower-level paint crash and
  chalk implementation message. The current exact evidence is
  [`public-prop-contract.test.tsx`](../../packages/runtime-tests/integration/components/public-prop-contract.test.tsx).
- **Current error channel:** eager component-layer validation remains useful because it keeps invalid public props out of paint and on Vue's component-error path. The old claim that Runtime necessarily renders an overview and rejects `waitUntilExit()` is superseded; user `onErrorCaptured`, `app.config.errorHandler`, and Vue now determine the component-error result.
- **Current Text color rule:** `<Text>` validates `color` and `backgroundColor` on every render,
  not only when its content is non-empty — matching `<Box>`, which validates its colors
  unconditionally. Ink does not throw for empty text only because its colorize call is lazy;
  an invalid value remains invalid regardless of content, so the former
  `wouldRenderNonEmptyText` gate stays removed. The old vouch also covered special ordering for
  screen-reader-hidden text, so its stamp was removed when that presentation and its props were
  deleted. Current Runtime has one validation path across all supported hosts.
- **Historical removed screen-reader ordering:** the experiment once validated structure before
  transcript hiding while skipping paint-only color and border checks under either explicit
  screen-reader selection or `INK_SCREEN_READER=true`. Ink v7.0.4 was run-verified to bypass its
  colorize path under that environment. The vue-tui branch, environment selector, ARIA state,
  transcript renderer, and associated test cases have all been removed; none of this is current
  behavior or a private compatibility path.

## Non-Behavioral Notes

These notes are neither divergence nor alignment entries. They document Vue-facing conventions
or internal mechanics so they are not mistaken for parity gaps.

- The internal host-node type is **`TuiNode`** (`TuiContainer | TuiTextLeaf | TuiComment`,
  from `@vue-tui/runtime/internal`), not Ink's DOM-emulation `DOMElement`
  (`nodeName` / `attributes` / `childNodes`). vue-tui keeps a native host tree, but
  `useBoxSize()` accepts only a direct same-app Vue `Box` ref and does not expose or accept `TuiNode` on the supported public surface.
- `null` / `false` / `undefined` / `v-if="false"` children are materialized by Vue as
  comment vnodes, which vue-tui's host renderer turns into an inert `TuiComment`: no yoga
  node, paints nothing, never shifts a sibling, and is skipped when counting child positions
  (the `child.type !== "comment"` guards in `paint.ts` and `text-measure.ts`; `G52`). This is renderer mechanics, not a divergence entry by
  itself. The observable `<Transform>` literal-`false` edge is documented above as a
  **model-implied divergence**.
