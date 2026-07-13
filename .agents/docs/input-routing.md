# Normalized input and routing

> **Status:** completed F3 implementation record and public-API contract. Only the direct-stdin contract below is maintainer-vouched; the remaining conclusions are accepted but unstamped. One serialized ingress owns structural framing and protocol replies per physical stdin, each structural event becomes one shared immutable semantic fact, and non-reusable fact-start route identities make parser-defined delivery independent of Node chunk grouping. `useInput()` publishes the normalized key, text, paste, and uninterpreted projection as one all-run application-global layer with a required synchronous result; pointer facts remain private to the runtime and F6 consumes them through its separate Fullscreen mouse contract. `useInputAvailability()` reports the stable host capability without creating demand. Active live registration fails fast on an unavailable host, inactive and string-host registration remain inert, and semantic demand owns raw mode, bracketed paste, the shared listener, stdin ref state, and Kitty negotiation. `usePaste`, public `Key`, public raw-mode controls, mount `rawMode`, and `exitOnCtrlC` are removed directly; `useStdin().stdin` remains the exact mounted-stream escape hatch outside framework event semantics and safe routing composition. Completed F4 supplies the public target, scope, local, and external attachments while reusing this same event and result model.

## Product problem

A stateful terminal application needs more than a callback for raw stdin chunks. A coding-agent composer must distinguish text, paste, global interrupt, approval actions, and local editing. A finder needs modal shortcuts and a focused query editor. A terminal workbench needs application shortcuts plus a pane that can receive input not handled by the outer UI. If the runtime loses key identity, guesses paste from listener count, broadcasts before ownership is known, or lets protocol replies share the application route, every component must rebuild part of the terminal input stack.

F3 establishes one truthful event stream, one public application-global hook, and tested routing behavior without publishing the private topology. F4 supplies logical focus as one route owner without creating a second event model or exposing the selected topology.

## Audited baseline before F3.1

The source audit on 2026-07-12 found this path before the first implementation unit:

```text
physical stdin chunk
  ├─ Kitty auto detector: parallel data listener, private byte buffer, unshift remainder
  ├─ public useStdin().stdin and other direct stream listeners
  └─ one stdin controller per mounted app
       → structural input parser: text chunks, CSI/SS3/Meta sequences, bracketed paste
       ├─ paste with any paste listener → broadcast to every usePaste listener
       ├─ paste without a paste listener → discard boundaries and re-enter ordinary input
       └─ string
            → global Ctrl+C interception
            → active SGR mouse parsing and terminal-wide or targeted delivery
            → Escape blur
            → focus Tab/Shift+Tab default
            → broadcast to every active useInput
                 → every listener calls parseKeypress again
                 → every listener reduces the result to input string plus boolean Key fields
```

The controller's `handleReadable()` path existed but was never registered; live delivery used `data`. Raw-mode ownership was shared by stdin identity, while parsing and application delivery were per app. Two apps intentionally mounted on one stdin each received input and had to continue doing so; replacing the competing readers therefore required explicit multicast rather than first-reader ownership.

## Implemented F3.1 ingress and structural framing boundary

The first internal unit gives each physical stdin one framework-owned ingress through a weak registry. Production streams remain byte-oriented instead of installing Node's stream-level UTF-8 decoder, so the ingress can retain the lifecycle context of the byte that began a split scalar. It applies standard streaming UTF-8 replacement behavior, serializes re-entrant chunks through one FIFO, parses control sequences and bracketed paste once into structural `InputEvent` values, recognizes framework-owned Kitty query replies outside paste payloads, and snapshots every app eligible when the event begins. Outside a bracketed-paste frame, C0 and DEL bytes are individual control-key events even when Node batches them next to text; an unmarked paste is indistinguishable from typing at the terminal protocol boundary. F3.2 now supplies the semantic boundary before those app recipients are invoked.

An app registers an inactive ingress subscriber before Vue setup. The first semantic demand activates application delivery and begins configured Kitty detection; ordinary input is retained until setup has installed the complete initial route set. This covers terminals whose query write synchronously produces `ordinary + reply + ordinary` input. Query completion and its protocol-enable write cannot overtake ordinary input from the data event that caused them; a throwing enable write is reported only after those ordinary segments have been delivered. Subscription deactivation is deferred until the current ingress transaction drains, so input synchronously produced by the enable write remains ordered after the outer data event.

Kitty detection has a finite 200ms FIFO slot per accepted query. A complete reply within that window is removed once and completes the oldest outstanding slot. Cancelling an app suppresses its callback but temporarily retains the written query's slot, so its late reply cannot settle another app's newer query; resuming the same app revives that slot instead of adding a blocker ahead of its fresh query. A synchronously rejected query write aborts its unwritten slot immediately. After cancellation, lone `ESC` and `ESC[` retain the ordinary 20ms input boundary, while a prefix that has become specifically query-shaped at `ESC[?` remains owned by the tombstone so a reply split beyond 20ms cannot leak. Bytes that arrive only after every relevant window are ordinary input; for example, `ESC[?1`, a timeout, then `u` delivers `u`.

Each framing unit snapshots app generations at its start. Suspension invalidates delivery but retains a definite split CSI, paste, or UTF-8 scalar long enough to find and discard its boundary; a lone ambiguous Escape is dropped so it cannot consume the first post-resume key as an old Alt chord. Ordinary last-consumer release and disposal discard orphaned framing. The last framework listener pauses a stream that the ingress itself put into flowing mode, so idle bytes remain buffered rather than being silently drained; reattachment resumes that owned flow. An externally flowing stream remains externally owned and is not paused.

Raw-mode state records total logical references separately from references belonging to unsuspended apps. A re-entrant reconciler commits desired ownership before calling `setRawMode`, `ref`, or `unref`, then rechecks it after every host callback. Suspending one app deactivates only that app's subscription and active raw references; the physical stdin remains raw while another app is active. The last active app releases the terminal mode, and continuation reacquires raw mode, parser-affecting paste and mouse modes, then the input listener before Kitty. A suspension requested during partial mount is deferred until the complete acquired resource set can be released.

Each input composable and terminal-mode controller now separates requested state from attached or physical state and drains re-entrant changes before returning. This matters when a custom stream callback synchronously changes `isActive`, suspends, mounts another app, or unmounts the current app. A terminal write that throws may have failed before or after the escape took effect, so paste and mouse ownership becomes explicitly uncertain until an idempotent disable establishes a safe state. Cleanup continues across independent paste, mouse, raw-mode, listener, and ref failures, and one-shot restore failures are retried before suspension or disposal reports completion. The first error is still surfaced after a surviving re-entrant owner has reached its final requested state.

The raw controller assumes Node-style idempotent `ref()` and `unref()` behavior. A custom stream that increments a private lease counter and then throws after the side effect is indistinguishable from one that throws before the side effect; no caller can infer which happened from the exception. Custom streams therefore need `ref()` and `unref()` to represent a boolean keep-alive state, as Node streams do, rather than a stack of counted leases. Kitty push and pop are different because they mutate a terminal stack and cannot be retried safely after an ambiguous side effect. vue-tui follows the Node Writable contract for this boundary: a synchronous `.write()` rejection means the valid escape was not accepted, so one bounded retry may restore the requested state. A custom `.write()` that first delivers a Kitty push or pop to the terminal and then throws violates that contract; the resulting stack depth is unknowable, and vue-tui cannot promise exact restoration without risking removal of an externally owned level. The controller's internal `isEnabled` flag is an ownership and retry marker, not proof of physical state under such a non-atomic custom host.

## Implemented F3.2 semantic fact boundary

After query ownership and structural framing, the shared ingress now normalizes each event exactly once and sends the same frozen object to every eligible app. The internal discriminated facts are key, text, paste, pointer, and uninterpreted input. Every fact preserves its decoded source sequence. Paste also preserves its payload and reconstructed bracketed boundaries. A syntactically valid SGR pointer report preserves the wire button, coordinates, final byte, modifiers, and the decoded action when known; an unsupported button/action remains pointer input with no fabricated action. A complete Kitty query response produces no application fact.

Plain UTF-8 is recorded as text rather than guessed to be a physical key. For example, a received `A` does not prove that Shift was held; it may come from Caps Lock, an IME, a keyboard layout, or unbracketed text. Recognized legacy controls and escape sequences become keys, but their phase remains unknown because legacy terminals do not distinguish initial press from repeat. Kitty CSI-u keys retain the primary, shifted, and base-layout codepoints; independent Shift, Alt, Ctrl, Super, Hyper, Meta, Caps Lock, and Num Lock bits; press, repeat, or release; known functional identity; and only text explicitly reported by the terminal. The public projection keeps those reported values separate from ordinary text instead of inventing physical-key facts. Kitty pure-text facts retain protocol, primary zero, reported origin, and phase without inventing a key identity. Unknown Kitty functional PUA values remain non-printable keys with their numeric identity rather than becoming printable private-use characters.

The Kitty parser follows the official [`CSI primary[:shifted[:base]];modifiers:event;text u` grammar](https://sw.kovidgoyal.net/kitty/keyboard-protocol/). It accepts alternate keys, base-layout-only keys, pure-text events with primary zero, and all defined modifiers. Invalid Unicode scalars, associated control text, modifier zero, event values outside press/repeat/release, C0 key codepoints that Kitty does not define as functional keys, and letter-form special sequences whose first parameter is not one remain uninterpreted with their exact decoded source sequence. The public event keeps Alt and Meta distinct and exposes every supported modifier bit directly.

`useInput` reads one cached readonly public projection shared by all captured global handlers; Ctrl+C, focus defaults, selected private recipients, and mouse delivery read the same normalized fact and never parse its sequence again. Every paste remains one `kind: "paste"` event with its payload and boundaries already separated. Paste-contained Ctrl+C, arrow, mouse-like, and query-like bytes therefore remain payload and cannot execute an application default or disappear as a protocol reply. Pointer facts are not projected to `useInput`; the existing internal mouse path remains in place until F6 selects a public pointer contract.

## Implemented F3.3 route-lifetime boundary

Each app input attachment owns a non-reusable internal identity. A public `useInput` registration joins the independent application-global layer; private selected-path recipients use typed activation leases; the existing mouse channels retain their private fact-start registry. Updating a handler ref keeps the attachment and reads the latest callback. Deactivation, scope disposal, component replacement, and later reactivation end the old identity and create a new one; the listener function's JavaScript identity cannot revive an earlier attachment.

The shared ingress processes parser-defined facts serially rather than treating a Node `data` chunk as one route lifetime. A read carries the initial route seed, but after any fact finishes, every later independent fact in that chunk captures current app routes before dispatch. A trailing partial CSI, paste, pointer, or UTF-8 scalar keeps one stable framing identity while its route contents bind after earlier complete facts and remain fixed across later chunks. A parser-distinct control fact, or the prefix or leading byte of a following split CSI, paste, or UTF-8 fact, therefore selects the same route whether that prefix shares the preceding fact's chunk or starts a later chunk. A complete ordinary text run such as `x€` remains one fact because the terminal provides no physical per-character boundary.

Immediately before dispatch, the app filters the captured snapshot's still-active leases once and freezes the recipients. A route removed before dispatch does not run, its replacement cannot inherit that fact, unrelated persistent routes and other apps still receive it, removal during a callback does not cancel a later frozen recipient, and an addition waits for the next framed fact. Re-entrant input and the next independent fact already present in the same read both capture routes after synchronous changes without recursively interrupting the current delivery.

The regression began with `x` plus DEL in one fake-stream chunk: the replacement route received neither the current fact nor the next, while two chunks worked. The committed matrix now covers complete control, trailing split CSI, trailing split bracketed paste, and trailing split UTF-8 after a synchronous route replacement. A focused real-PTY fixture sends `x` and Backspace in one write under actual Inline and Fullscreen mounts, and the repository visual controller exposes the same trace for screen and restoration review.

Paste and mouse classification use the same fact-start context. A paste that began before a public global disappears cannot be inherited by a replacement, while persistent captured globals still receive the same paste fact. An SGR report that began before mouse capture remains outside the captured mouse path; a report that began while capture was active remains pointer input even if that owner disappears. Internal and existing public mouse recipient lists are both resolved before either group runs, while normalized public `useInput` never receives pointer facts.

The inactive ingress subscriber exists before Vue setup, so ordinary input produced by a first semantic demand and its Kitty query initially carries one bootstrap binding rather than an empty route snapshot. `activateInputDelivery()` resolves that binding once against the complete initial route set before invoking any handler; every earlier fact uses the same initial snapshot, and the controller then drops its binding reference so initial callbacks are not retained for the application lifetime. Suspension still invalidates the app generation rather than the component leases: an old split event may finish framing but cannot cross resume, while the first new event captures the still-live routes after terminal modes are restored.

Two limits remain explicit and are part of the selected contract. First, standard UTF-8 replacement already loses invalid source bytes before semantic normalization, so `sequence` is a normalized Unicode sequence and never a byte-perfect external-PTY fallback. Second, an ordinary text run has no physical key boundary on the wire and may follow stream chunk boundaries. F3 therefore labels fidelity as `normalized-utf8-sequence` and does not promise transparent PTY forwarding or call the fact lossless.

## Executable F3.4 route-policy experiment

The private `input-route-policy.ts` model captures one immutable candidate plan before any callback: application-global recipients, one selected active boundary, a later supplied focused owner, that owner's nearest-to-farthest logical ancestors, owner and application defaults, and at most one explicit external owner. The model neither creates focus nor discovers the active boundary. The live bridge now captures their activation leases beside F3.3's handler leases when the framed fact starts; the pure model still accepts an already-selected plan so neither layer accidentally creates a second focus system.

Every semantic recipient returns four explicit observations. Performing an action does not imply stopping later semantic recipients. Stopping semantic delivery does not imply preventing delayed defaults. Preventing defaults does not imply stopping semantic delivery. External permission is independently monotonic, but external delivery is fallthrough rather than a side channel: the selected semantic path must also reach its natural end. Delayed defaults still run after a stopped semantic path unless a recipient explicitly prevented them; a default action blocks external delivery only when its own policy says so. The public `InputRouteDecision` maps these to `action`, `routing`, `defaultAction`, and `external`; the selected topology and internal execution shapes remain private.

An active modal changes the candidate plan. The approval plan contains the approval boundary, approval owner and its ancestors, not the background composer or the terminal pane's external owner. An unknown key may therefore continue through every approval recipient without leaking to the background. Route changes made by a callback affect only a re-entrant or later framed fact that captures a new plan, including another fact already decoded from the same Node chunk; the current plan stays fixed. Synchronous handler failure fails closed for that application dispatch because later semantic recipients, defaults and external delivery do not run; the shared-ingress layer remains responsible for reporting the error and continuing other applications.

The deterministic coding-agent journey runs the same policy table under Inline and Fullscreen labels. It inserts and deletes composer text, preserves one escape-containing bracketed paste, submits a prompt, rejects one tool call, accepts its replacement, interrupts streaming with Ctrl+C, restores composer ownership for the next event, and lets idle Ctrl+C reach a delayed exit default. It proves three inheritance boundaries: a new approval owner does not receive the submit Enter, a replacement approval owner does not receive its predecessor's Escape, and the restored composer does not receive the approval Enter. Those labels alone were not mode evidence; the live bridge separately runs real controller mounts against fake TTY streams with effective Inline and Fullscreen sessions, and the later nested-PTY journey proves both modes through a real terminal path. Selected-topology automatic demand also passes both visual modes, a screen-reader transcript, a final-output stream, shared stdin, suspension and continuation, teardown, replacement, independent globals, raw-acquisition rollback, HMR, deterministic-host disposal, string-host cleanup, and controllable or externally pre-raw custom TTYs. Managed non-TTY exclusion and route-owned raw/listener/ref/Kitty demand are implemented at the same controller boundary.

The deterministic terminal-workbench journey selects either pane A with an explicit external owner or a closed confirmation-modal plan. Ctrl+W opens the modal globally; an unknown F5 and Escape never reach pane A or its external owner. After the modal closes, ordinary `a`, Tab and Ctrl+C traverse the explicit pane path. The pane prevents outer Tab focus and application Ctrl+C exit defaults without stopping semantic continuation, so the external owner receives normalized sequences `61 09 03` exactly once and in order. A bracketed-paste fact and an uninterpreted control sequence then follow the same complete path and reach the owner as their exact normalized sequence and same frozen fact object. This proves normalized-sequence fallthrough for text, control keys, paste and uninterpreted input, not transparent child-terminal compatibility or arbitrary source bytes.

The external representation remains deliberately labeled `normalized-utf8-sequence`. A committed ingress test proves that source byte `80` and canonical UTF-8 `EF BF BD` both become the same frozen U+FFFD text fact and re-encode as `EF BF BD`; the original source cannot be recovered afterward. Outer Kitty encodings, bracketed-paste negotiation, pointer coordinates and a child terminal's protocol state make automatic `pty.write(fact.sequence)` unsound as a general framework promise. An explicit application or specialized terminal-engine adapter receives the semantic fact and normalized sequence, then encodes known input against its child terminal's own state. Whole-terminal suspension remains a separate ownership operation.

The policy and its low-level topology selector remain private and absent from the package root. A narrow `@vue-tui/runtime/internal` fixture helper exposes the selector only so F3 package integration tests can exercise protocol isolation and child-PTY fallthrough; applications must not mix that private owner with public F4 focus ownership. The root package exposes the normalized application-global hook, its result and availability types, the vouched direct-stdin escape hatch, and F4's opaque target, scope, local-input, and normalized external-input composables.

## Selected external-owner representation and real-PTY evidence

F3 keeps semantic facts plus normalized UTF-8 rather than adding post-protocol source spans. The vouched terminal-workspace boundary assigns keyboard routing to vue-tui and child PTY protocol state to the application or specialized engine. Exact parent bytes do not solve that adapter problem: Kitty flags, paste enablement, keypad or cursor state, focus reporting, and pointer coordinates can differ between the outer and child terminals. A string-emitting custom stdin also cannot supply unconditional byte provenance. Preserving a decoder-to-parser source map would therefore add allocation and framing complexity without satisfying a current product promise.

Pinned Herdr independently uses the same boundary. It parses terminal bytes into semantic [`RawInputEvent`](https://github.com/ogulcancelik/herdr/blob/66be0b655fe922867f1eed100a41d67038b6ffd6/src/raw_input.rs#L111-L134) values, [encodes keys against the selected pane's keyboard protocol](https://github.com/ogulcancelik/herdr/blob/66be0b655fe922867f1eed100a41d67038b6ffd6/src/app/input/terminal.rs#L149-L164), and [adds bracketed-paste markers only when that pane enabled them](https://github.com/ogulcancelik/herdr/blob/66be0b655fe922867f1eed100a41d67038b6ffd6/src/pane.rs#L2513-L2543). This is evidence for a semantic adapter, not a requirement to copy Herdr or absorb its PTY engine.

The committed `xterm-256color` integration fixture mounts vue-tui inside a real outer PTY, enables the outer bracketed-paste protocol, registers the private selected boundary and external owner, and forwards through an explicit adapter into a second real child PTY that has not enabled bracketed paste. Inline and Fullscreen runs deliver an outstanding Kitty reply beside Ctrl+C, bracketed paste containing both Ctrl+C and a query-shaped sequence, an uninterpreted CSI sequence, and invalid byte `80`. The external route receives exactly `text`, `key`, `paste`, `uninterpreted`, `text` in order; the outer Kitty reply never reaches it; the query-shaped paste content remains payload; the Ctrl+C default is prevented without blocking external delivery; the adapter removes paste wrappers for the child; and the child receives the final invalid input as normalized `EF BF BD`. The outer paste and Kitty modes restore on exit; Fullscreen enters and leaves the alternate screen while Inline never enters it. Slow reply retention beyond the ordinary 20ms Escape boundary is proved separately in the deterministic in-process ingress test, where the 35ms and 200ms timers share one event loop; the real nested-PTY fixture deliberately uses one write because separate processes do not preserve relative timer deadlines under CPU saturation. Ten repeated focused runs, full `vp run ready`, fresh `CI=true vp run ci`, 546 runtime tests, 1,541 passing integration tests, 164 real-PTY tests, and independent adversarial review pass.

This contract deliberately does not promise transparent or byte-exact PTY passthrough. Reopen source spans only if a vouched product requirement needs recovery of arbitrary original bytes after framework protocol removal. That would require a decoder/parser source map and a distinct provenance contract; it must not be smuggled in as an implication of `sequence`.

## Implemented live route-policy bridge

Each application owns one private routing runtime. A public `useInput` registration joins its independent application-global layer. Registering a selected-path recipient, delayed default, or optional external owner creates a non-reusable activation lease; selecting a route stores one already-selected boundary, supplied focus owner and nearest-to-farthest ancestor path, owner and application defaults, and optional external owner. Registration order only orders callbacks inside the all-run global layer and never chooses semantic priority. The F3 runtime itself does not inspect the Vue tree or rendered targets; the app-owned F4 controller derives one complete focus generation from F2 and supplies it to this runtime.

The selected boundary, focus path, selected defaults, and external owner form one atomic generation. Ending any of those leases invalidates the whole selected path, so a split fact that began in a modal cannot cross a later modal close and leak to a replacement pane or PTY. Application-global leases remain independent and can still receive that old fact when they remain active. Each framed fact captures the generation and activation identities inside the existing per-application snapshot. Immediately before the first callback, the controller resolves all captured activations once and freezes the resulting policy plan. Removal before resolution drops the old recipient without admitting its replacement; removal or selection replacement during a callback cannot cancel a later recipient already frozen for that fact; re-entrant and later parser facts capture the new generation.

Public global registrations and a private selected topology are independent. Every global that was captured and is still active when resolution begins runs in registration order for the same normalized public event; ordinary `routing: "stop"` does not hide that fact from same-layer peers. Their results merge monotonically before the selected boundary: any performed action is retained, any stop prevents the later selected path, any default prevention suppresses delayed defaults, and any external block vetoes fallthrough. A missing selected topology therefore still has the global layer and framework defaults, while a stale selected generation fails its later path closed without admitting a replacement. Pointer facts are skipped by the public projection and remain on the existing internal mouse/private route until F6.

Every active public global registration acquires its own controller input-demand lease. A selected private generation can independently request demand or remain logical-only: completed F4 publishes one complete fact-start focus topology even when no effective focus node can consume input, while an independent application-global owner may still drive facts through that topology. A demanded selection replacement acquires its lease, then revalidates both every proposed activation lease and the caller's complete candidate revision before publication. If raw/listener/Kitty acquisition re-enters focus and creates a later intent, the obsolete candidate reports that it was not accepted, releases only its new lease, and leaves the old logical route and physical demand intact. A successful replacement publishes before releasing the old generation. A logical-only replacement publishes without touching the host. Failed demand acquisition preserves the previous logical selection. Ending one owner releases its logical lease while another global or demanded selected generation keeps the shared physical resources continuously owned. An inactive public registration, an unselected private recipient, and a logical-only selected generation own no physical input. Routing reuses the existing transactional raw/listener controller rather than duplicating terminal mechanics.

Route-owned demand tests prove exact raw, paste, ref, listener, and Kitty balance for first publication, selection, replacement, explicit end, independent-global staleness, acquisition rollback, shared stdin, suspension and continuation, and teardown. Physical acquisition precedes route publication, logical activation follows publication, logical deactivation precedes route release, and the physical release may coalesce at the microtask boundary; synchronous input during acquisition or a physical-only release gap cannot reach the unpublished handler or framework defaults. The matrix runs effective visual Inline and Fullscreen sessions plus a screen-reader transcript and final-output stream, showing that input demand is independent from output cadence. A real input-free final-output PTY proves natural exit with no transient raw/ref/listener/Kitty ownership, while the real outer-terminal and child-PTY journey retains protocol isolation, terminal-mode restoration, and alternate-screen assertions. Controller tests cover hostile and re-entrant raw, listener, flow, paste, mouse, Kitty, shared-stream, and restoration transitions, including demand replacement, query caching, tombstones, unavailable control output, and cross-controller reconciliation. A dedicated Vite fixture externalizes the packaged runtime and proves that template-only HMR preserves the selected route, script HMR replaces its handler without leaking logical demand or toggling physical input ownership, and full reload removes the old data listener, raw/ref ownership, and Kitty protocol before the new app acquires them; mount-tagged handler delivery excludes a stale app. Deterministic final-output, string-host success and failure cleanup, custom controllable TTY, stable and revoked externally pre-raw TTY, unsupported setterless TTY, exact mounted-stdin identity, package contents, and a clean Vue 3.4.38/TypeScript 6.0.3 tarball consumer have focused evidence. Full `vp run ready` and fresh `CI=true vp run ci` gates passed with 546 runtime, 70 deterministic-host, 19 component, 28 Vite, 1,541 passing integration, 164 real-PTY, and 6 example tests; the clean packed consumer, image-reviewed Inline and Fullscreen input journeys, exact terminal restoration, and independent adversarial reviews also passed.

Ctrl+C exit and Tab or Shift+Tab traversal are controller-owned delayed defaults after semantic delivery. Public `useInput` callbacks therefore observe those facts before the default runs and can prevent a default for that event without necessarily stopping semantic continuation or external permission. Completed F4 removed the former bare-Escape blur; Escape is now an ordinary normalized key unless an application, focus target, scope, or later component default handles it. Paste content never triggers framework defaults. SGR mouse classification and its internal/existing-public listener delivery remain on the fact-start pointer path until F6 defines targeted pointer semantics.

Live controller mounts against fake TTY streams in effective Inline and Fullscreen sessions prove explicit layer order independent of registration order, all-run global peers, monotonic result merging, split-fact removal and replacement, frozen-recipient behavior, FIFO re-entry, same-chunk recapture for the next parser-defined fact, modal isolation, preventable defaults, normalized external fallthrough, one-application failure without cross-application loss, and the same semantic trace in both rendering modes. Public tests prove rich immutable facts, paste delivery through `useInput`, required synchronous results, Tab observation before traversal, ordinary Escape after the F4 cutover, preventable Ctrl+C, stable availability, fail-fast live unavailability, inert inactive and string registrations, transactional input ownership, and the removed surfaces. The F3-era xterm-compatible visual route established same-write route replacement and terminal restoration; completed F4 separately proves public focus selection, modal isolation, host removal, restoration, paste delivery, and exact cleanup in both modes. F6 pointer behavior remains deliberately unexposed.

## Reproduced failures and constraints

### Protocol input has no single owner

Kitty auto detection and the application controller listen to the same `data` event. The detector later `unshift()`s non-response bytes that the controller already handled. A real `PassThrough` reproduction delivered `a ESC[?1u b` as `a`, `b`, and then a duplicated `ab`. The former unit harness replaced `unshift()` with an array, so it proved byte preservation without exercising replay into the real stream.

The controller also flushes an incomplete ordinary escape after 20ms while Kitty detection waits 200ms. Splitting `ESC[?1u` after `ESC[?`, waiting 35ms, and then sending `1u` delivered `"[?"` and `"1u"` to the application. Filtering a complete reply later in each `useInput` listener cannot repair a reply already split into application events.

The first F3 red tests require ordinary bytes around a query reply to arrive once and in order and require a response split beyond the ordinary escape timeout to remain protocol input. The implemented correction gives one shared ingress ownership of byte decoding, structural framing, protocol recognition, semantic normalization, and ordered multicast for a physical stdin. It creates one frozen fact before app delivery; public `useInput` listeners read one cached normalized projection instead of parsing or reducing the event again. This avoids replay and classification differences among apps sharing stdin while keeping the selected topology private beneath completed F4's public focus attachments.

### Parsed facts are reduced before routing

Before F3.2, `parseKeypress()` already knew a key name, code, raw sequence, modifiers, Kitty source, printable text, and press/repeat/release state. `useInput()` exposed only a text-like `input` string and a small boolean `Key`; F1, Insert, keypad, media, and modifier-only keys became indistinguishable empty events. Ctrl+C caused a second parse in the controller, and every active listener parsed the same event again.

The internal stream retains those facts once, and the public readonly projection exposes the supported identity directly. The removed boolean `Key` shape remains only historical evidence of the information loss F3 corrected.

### Paste meaning depends on subscribers

Before F3.2, the existence of any `usePaste` listener changed the event kind for the whole app. With a listener, every paste listener received the payload and no `useInput` listener did. Without one, boundaries disappeared and the payload was interpreted as ordinary keys: pasted Ctrl+C could trigger application exit, and pasted `ESC[A` could become Arrow Up. The shared fact is now always paste, bracketed-paste reporting follows semantic input demand rather than listener kind, and normalized `useInput` receives the paste event. `usePaste` and its adapter are removed.

### Framework default ordering

Before the live bridge, Escape blurred and Tab or Shift+Tab moved the then-current flat focus registry before ordinary application listeners ran. The bridge moved those actions after semantic delivery so public handlers could make continuation and default prevention independent. Completed F4 retained Tab traversal as a preventable delayed default and removed bare-Escape blur entirely.

### App and route generations solve different lifetimes

F3.1 snapshots app subscriptions; F3.3 adds individual hook-route leases inside each app. The reproduced failure used a persistent app route while `useInput` component A was replaced by B during a split CSI: completing the key formerly delivered it to B. Invalidating the whole app would also discard the event for an unrelated persistent handler. The implemented two-level snapshot drops only A's expired lease, excludes B's later lease, and still delivers to persistent routes and another app. Completed F4 binds a selected route to logical focus and rendered lifetime without reopening physical input ownership.

### Direct stdin is a parallel escape hatch, not fallthrough

[`useStdin()` returns the controller's physical `stdin`](../../packages/runtime/src/composables/useStdin.ts), while the [shared ingress attaches its own `data` listener to that same stream](../../packages/runtime/src/io/stdin-ingress.ts). Node event delivery invokes every attached `data` listener with the physical chunk; a direct listener therefore observes routed bytes, Kitty replies, and paste wrappers before semantic ownership is known. This is inherent stream broadcast, not a parser defect. Arbitrary application code can always read `process.stdin`; the framework's semantic-route guarantees therefore exclude observation through this raw stream.

A usage audit found that the first-party coding-agent journey, pinned `mo` at `6bea467a`, and pinned `machud` at `a51a6853` use semantic input and never read `useStdin().stdin`. No vue-tui production consumer in this repository reads the field; current uses only inspect fake raw state or string-host stream isolation in tests. Pinned Ink documents the stream as a generic way to handle input, but its own input, paste, and focus hooks use the framework route plus raw-mode operations rather than attach another public stream listener. A 2026-07-12 GitHub code search for `useStdin "@vue-tui/runtime"` found no public consumer. That absence does not disqualify an escape hatch whose purpose is to support integrations the framework has not modeled, especially when a custom mount stream may differ from `process.stdin`.

vue-tui guarantees that `useStdin().stdin` exposes the actual stdin stream mounted into the application. Bytes read from that stream carry no framework event semantics and are not guaranteed to compose safely with framework input routing. [VOUCHED @hyf0 2026-07-12]

The managed non-duplication guarantee is correspondingly scoped to vue-tui's semantic routes. A direct listener may observe user bytes, framework protocol replies, and paste wrappers before ownership is known; it does not participate in modal, focus, delayed-default, or external-owner priority and may duplicate or interfere with routed delivery. Stream mutation such as pausing, destroying, replaying, or changing decoding can also affect the framework ingress and remains outside the routing contract. Applications that need protocol-filtered semantic fallthrough use the selected external-owner route, so no second brokered channel is added. Removing the framework's public raw-mode operations does not remove this stream escape hatch: an application may still manipulate the actual stream directly, but that manipulation remains outside safe routing-composition guarantees.

Whole-terminal handoff is a separate operation. Ink 7.1's `suspendTerminal()` and Bubble Tea's `ExecProcess` release framework input/output and terminal modes while an external program owns the terminal, then restore and redraw. They do not route an unhandled event to an embedded PTY while the outer application remains active.

### Input host evidence and accepted policies

Semantic-route demand is independent from output: the same TTY stdin delivers under Inline, Fullscreen, a screen-reader transcript, a live stream, and final-output cadence. Deterministic final-output rendering proves a selected route receives input, owns raw mode, and clears its routing generation on disposal. String rendering reports `string-host`, keeps active public registration inert, and clears both public globals and selected topology state after success or a component error. A direct identity test also proves the vouched `useStdin().stdin` field is the exact custom stream supplied to the mount.

Live preflight now distinguishes a TTY that can enter raw mode from one that merely claims `isTTY`. A non-raw custom TTY without `setRawMode` reports unsupported and cannot publish a selected route that silently listens in cooked mode. A custom TTY already supplied with `isRaw === true` can route without a setter; vue-tui attaches and refs its shared ingress, then removes and unrefs it while preserving the externally owned raw baseline. That externally owned condition is checked again on every acquisition, so a host returned to cooked mode before selection fails transactionally instead of attaching a listener. These cases pass in Inline and Fullscreen. A callable setter remains only a candidate: a later ioctl can still throw, and the existing transactional acquisition must roll back without replacing the old selection.

Two one-time executable probes prevent a false simplification. First, changing the default lifetime hold to ignore output cadence made a real TTY-stdin, piped-stdout, final-output app with no route stay alive indefinitely because `stdin.ref()` prevented natural `beforeExit`; the test-host fake missed this because its `ref()` is a no-op. Second, while a selected route was the sole owner under `rawMode: "auto"`, one public `useStdin().setRawMode(false)` call removed raw mode, the shared listener, and the ref in both modes, so the still-selected route stopped receiving input. Public raw calls and framework route demand therefore cannot continue sharing one anonymous counter.

The former `inputLifecycleActive` condition and app-lifetime raw hold are removed. Host facts describe whether input can be acquired, while an active semantic route creates demand. The first compatible demand acquires raw mode, the shared listener, stdin ref state, and configured Kitty negotiation; the last releases them. Output cadence, presentation, and rendering mode do not participate, and an input-free final-output app exits naturally.

The maintainer accepted both recommended policies on 2026-07-13 without adding a VOUCHED stamp, and they are now implemented. Managed semantic routing excludes a non-TTY `Readable`: a pipe has no terminal key or protocol boundary, and applications that need its bytes use the vouched raw `stdin` escape hatch. A future socket or PTY transport must explicitly declare terminal semantics instead of being inferred from `Readable`. `useStdin()` exposes only that actual stream; the public `setRawMode`, `isRawModeSupported`, and mount `rawMode` option are removed rather than repaired with another user-owned lease. Recognizable JavaScript mount input containing the removed option fails before stream access or terminal mutation. Framework semantic routes own raw mode, the shared listener, ref state, and Kitty negotiation for exactly their active demand; a direct stream consumer remains an explicitly unsafe-composition escape hatch. This prevents one API from releasing another owner's route, removes the hidden output-dependent lifetime hold, preserves natural final-output exit, lets string-host components remain inert, and makes live unavailable hosts fail before terminal mutation.

## Accepted public input contract

The source audit, issue [#250](https://github.com/vuejs-ai/vue-tui/issues/250), issue [#266](https://github.com/vuejs-ai/vue-tui/issues/266), the first-party coding-agent and ScrollBox examples, pinned `mo` and `machud`, the two-mode workbench and nested-PTY journeys, and the reverified peer routes supplied the evidence for this contract. They did not determine one complete attachment API without also deciding F4's logical focus and target ownership. The maintainer accepted the five recommended choices together on 2026-07-13 without adding a VOUCHED stamp; the alternatives remain below only as decision history.

### Evidence-backed current-API dispositions

- **Replace `useInput`.** The name may remain for the application-global hook, but the Ink-shaped `(input: string, key: Key) => void` signature and lossy `Key` type are removed directly. A normalized handler receives key, text, paste, or uninterpreted input and must return an explicit synchronous route result.
- **Remove `usePaste`.** Paste is always one normalized fact. Any active semantic-input demand owns bracketed-paste negotiation, so listener presence can no longer change event classification or decide whether the terminal reports paste boundaries.
- **Remove public `Key`.** The normalized key detail below preserves functional identity, alternate and base-layout codepoints, exact modifiers, phase, and terminal-reported text instead of expanding another boolean bag.
- **Keep `useStdin().stdin` unchanged.** It remains the vouched exact mounted-stream escape hatch outside semantic routing, protocol filtering, priority, and safe-composition guarantees.
- **Defer `useMouseInput` and all pointer facts to F6.** A syntactically valid SGR report remains an internal fact, but pointer names, delivery, coordinates, target lifetime, and terminal reporting are not smuggled into the F3 union.
- **Keep `UseInputOptions.isActive` for the application-global hook.** It may enable or disable that global registration. It must not select focus, a rendered branch, a modal boundary, or an external owner; F4 owns those states.

### Accepted normalized public facts

The public data shape is a faithful readonly projection of the proved internal fact. `null` means the active terminal protocol did not provide that fact; it is not filled from keyboard-layout guesses. `sequence` is the decoded, framework-protocol-filtered Unicode sequence. Its constant fidelity label prevents an application or child-PTY adapter from treating it as original bytes or as a child terminal's negotiated encoding.

```ts
export interface TuiInputModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly super: boolean;
  readonly hyper: boolean;
  readonly meta: boolean;
  readonly capsLock: boolean;
  readonly numLock: boolean;
}

export type TuiInputPhase = "press" | "repeat" | "release";

export interface TuiInputSource {
  readonly sequence: string;
  readonly fidelity: "normalized-utf8-sequence";
}

export type TuiInputEvent =
  | (TuiInputSource & {
      readonly kind: "key";
      readonly key: {
        readonly protocol: "legacy" | "kitty";
        readonly name: string | null;
        readonly code: string | null;
        readonly primaryCodepoint: number | null;
        readonly shiftedCodepoint: number | null;
        readonly baseLayoutCodepoint: number | null;
        readonly functionalCode: number | null;
        readonly modifiers: TuiInputModifiers;
        readonly phase: TuiInputPhase | null;
        readonly printable: boolean;
        readonly reportedText: string | null;
      };
    })
  | (TuiInputSource & {
      readonly kind: "text";
      readonly text: string;
      readonly protocol: "plain" | "kitty";
      readonly phase: TuiInputPhase | null;
      readonly primaryCodepoint: number | null;
      readonly textOrigin: "reported" | null;
    })
  | (TuiInputSource & {
      readonly kind: "paste";
      readonly text: string;
    })
  | (TuiInputSource & {
      readonly kind: "uninterpreted";
    });
```

Plain text remains text because a legacy byte stream does not reveal one physical key boundary. A Kitty key can carry `reportedText`, while a Kitty pure-text fact stays text. Release is never silently relabeled as a press. Paste content remains one payload even when it contains Ctrl+C, Escape, mouse-like, or query-like sequences. Every object is frozen, and the same fact identity may be observed by all recipients selected for that framed event.

### Handler result: required return value

The public handler keeps four outcomes independent and uses a required synchronous return instead of mutable methods on the fact:

```ts
export interface InputRouteDecision {
  readonly action: "none" | "performed";
  readonly routing: "continue" | "stop";
  readonly defaultAction: "allow" | "prevent";
  readonly external: "allow" | "block";
}

export type InputHandlerResult = "continue" | "consume" | InputRouteDecision;
export type InputHandler = (event: TuiInputEvent) => InputHandlerResult;
```

`"continue"` expands to `{ action: "none", routing: "continue", defaultAction: "allow", external: "allow" }`. `"consume"` expands to `{ action: "performed", routing: "stop", defaultAction: "prevent", external: "block" }`. `routing: "stop"` means do not advance beyond the current explicit priority layer; it does not cancel equal-layer recipients already captured for the fact. Every other combination uses all four named fields; partial objects, `undefined`, a Promise, or an unknown value are programming errors. A thrown or invalid result fails closed for that application's current dispatch: later semantic handlers, defaults, and external delivery do not run, while the shared ingress can continue other applications and terminal teardown still restores owned state.

The rejected alternative was a synchronous control object:

```ts
export interface InputRouteControl {
  markPerformed(): void;
  stopRouting(): void;
  preventDefault(): void;
  blockExternal(): void;
}

export type InputHandler = (event: TuiInputEvent, control: InputRouteControl) => void;
```

This resembles OpenTUI and Textual and makes the common observer callback shorter. It was rejected because the immutable fact would gain a second mutable lifetime, an `async` handler is structurally accepted by TypeScript, a retained control can be called after routing has finished unless runtime guards are added, and forgetting one method silently changes the route. The accepted required result makes completion and every exceptional combination inspectable at the callback boundary.

### Attachment boundary: publish one global hook in F3, complete local attachment in F4

The accepted F3 boundary keeps only an application-global registration public:

```ts
export interface UseInputOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
}

export function useInput(handler: MaybeRef<InputHandler>, options?: UseInputOptions): void;
```

All application-global handlers captured for one fact form one explicit priority layer before the selected boundary and focused path. Every live member of that layer runs; registration order is only a deterministic callback order and cannot let one global suppress another global. After the layer finishes, its results are merged monotonically: any `performed` records an action, any `routing: "stop"` stops the later boundary/focus path, any `defaultAction: "prevent"` suppresses delayed defaults, and any `external: "block"` vetoes external delivery. This preserves deliberate application-global broadcast without making registration time a hidden priority. A callback failure still fails the current application's dispatch closed. Registration lifetime follows the Vue setup scope because an application-global command has no rendered target.

The rejected alternative added `priority?: number` to `UseInputOptions`, ran larger values first, and treated equal values as the same all-run layer. It was rejected at this foundation because the proved semantic priority is already global layer → selected boundary → focused owner → ancestors → defaults → external, while a numeric global keymap would introduce ordering policy before multi-key bindings, commands, and inspectable shortcuts have scenario evidence.

Completed F4 chooses one effective logical owner, semantic ancestor path, modal boundary, target lifetime, and focus restoration. Its target-bound hooks reuse `TuiInputEvent`, `InputHandler`, and the same route result. The public external-owner attachment is selected with that boundary so a closed modal cannot accidentally expose a background PTY. F3 defines the external result and normalized source contract, while F4 supplies the public attachment without changing parser, route, default, or fallthrough behavior.

The maintainer accepted F4.1's complete unstamped [logical focus and focus scopes](./focus-and-scopes.md) contract on 2026-07-13. Its API-neutral policy and journeys select opaque F2-bound handles, target and scope handler aggregation, hard trapped boundaries, centralized restoration, and a focus-target external receiver. The public implementation and closure evidence are complete, while F3's public global contract and private route semantics remain unchanged.

The rejected low-level alternative exposed the private selection graph immediately:

```ts
export interface InputRecipient<Kind extends "semantic" | "default" | "external"> {
  readonly kind: Kind;
  readonly __inputRecipient: unique symbol;
}

export function useInputRecipient(handler: MaybeRef<InputHandler>): InputRecipient<"semantic">;

export interface InputDefaultDecision {
  readonly action: "none" | "performed";
  readonly routing: "continue" | "stop";
  readonly external: "allow" | "block";
}

export type InputDefaultHandlerResult = "continue" | "consume" | InputDefaultDecision;
export type InputDefaultHandler = (event: TuiInputEvent) => InputDefaultHandlerResult;

export interface ExternalInputSource {
  readonly event: TuiInputEvent;
  readonly sequence: string;
  readonly fidelity: "normalized-utf8-sequence";
}

export type ExternalInputHandler = (source: ExternalInputSource) => void;

export function useInputDefault(handler: MaybeRef<InputDefaultHandler>): InputRecipient<"default">;

export function useExternalInput(
  handler: MaybeRef<ExternalInputHandler>,
): InputRecipient<"external">;

export interface InputSelection {
  readonly applicationGlobal?: readonly InputRecipient<"semantic">[];
  readonly activeBoundary?: InputRecipient<"semantic">;
  readonly selectedOwner?: InputRecipient<"semantic">;
  readonly logicalAncestors?: readonly InputRecipient<"semantic">[];
  readonly ownerDefaults?: readonly InputRecipient<"default">[];
  readonly applicationDefaults?: readonly InputRecipient<"default">[];
  readonly external?: InputRecipient<"external">;
}

export function useInputSelection(selection: MaybeRefOrGetter<InputSelection | null>): void;
```

This alternative was rejected because it makes the author compute the focused owner, ancestor order, active modal, and external route manually; it exposes private leases; it creates many invalid combinations; and F4 would later become a second owner of the same state. It would reproduce issue #250 as a larger reactive selection object. A target-bound attachment is the accepted direction, but selecting its target type and logical ancestry in F3 would simply implement F4 under another name.

### Input availability: independent query and fail-fast active live registration

The accepted query is independent from raw stdin, input registration, and the render session:

```ts
export type InputAvailability =
  | { readonly status: "available" }
  | {
      readonly status: "unavailable";
      readonly reason: "string-host" | "stdin-not-tty" | "stdin-not-controllable";
    };

export interface UseInputAvailabilityReturn {
  readonly availability: Readonly<Ref<InputAvailability>>;
}

export function useInputAvailability(): UseInputAvailabilityReturn;
```

The same component can query this finite fact instead of inspecting `stdin.isTTY`, inferring input from output mode, or relying on a predictable unavailable-host exception. The readonly ref is stable for one mount; suspension keeps the capability available while temporarily releasing physical ownership. A host that appears controllable can still reject a later raw-mode operation. That is an acquisition error which preflight cannot promise away and which still propagates through the normal application error path.

The rejected alternative location returned the same app-owned ref from the registration itself:

```ts
export interface UseInputReturn {
  readonly availability: Readonly<Ref<InputAvailability>>;
}

export function useInput(
  handler: MaybeRef<InputHandler>,
  options?: UseInputOptions,
): UseInputReturn;
```

The separate query was accepted because capability inspection should not install a global handler or input demand, and local F4 registrations will need the same app fact. Returning it from every registration would duplicate one shared fact across every attachment and would not serve a component that only chooses its non-interactive presentation.

Unavailable-host behavior was decided independently from query location:

- a string document reports `string-host`, and registration remains inert because a fixed document never acquires live application services;
- a live non-TTY or uncontrollable TTY reports its reason, and activating a managed registration fails before a data listener, raw/ref ownership, or terminal write and emits no warning;
- a deterministic host models the matching live behavior rather than manufacturing input.

This fail-fast live behavior follows Ink's useful guard/failure split while replacing its raw-mode fact with the semantic capability vue-tui actually supports. Pinned `machud` can replace its expected-host `try/catch` with the explicit preflight; a genuine later acquisition failure remains an error.

The rejected behavior made live unavailable registrations inert as well as string registrations. That better supports one unchanged tree across a TTY, redirected output, and issue #266's ignored stdin, but an author can ignore the availability fact and ship a silently dead shortcut. The accepted independent query therefore does not change the accepted fail-fast live behavior.

### Ctrl+C policy: remove the mount boolean

The accepted clean-slate disposition removes `MountOptions.exitOnCtrlC` and the matching testing option. An exact unmodified Ctrl+C remains a framework delayed default while managed routing is active. A handler prevents it for one event with `defaultAction: "prevent"`, independently from later semantic routing and external permission. With no managed-input demand, stdin stays cooked and Ctrl+C remains the operating system's signal behavior.

The rejected alternative retained `exitOnCtrlC?: boolean` as an application-wide delayed-default switch, defaulting to `true`, while adding the same per-event prevention. It would save a small root handler for applications that never want managed Ctrl+C exit, but it would preserve a second policy surface for behavior already expressible by the route result.

### Accepted maintainer decisions

The maintainer accepted all five choices together on 2026-07-13:

1. publish normalized facts and an all-run application-global `useInput` layer in F3, while F4 owns target/local/external attachment rather than exposing the private topology or adding numeric global priority now;
2. use the required `InputHandlerResult` return model rather than mutable dispatch methods;
3. publish the independent `useInputAvailability()` rather than returning the app capability only from registrations;
4. fail fast for an active live registration on an unavailable host, while string rendering stays inert;
5. remove `exitOnCtrlC` and preserve Ctrl+C exit only as a preventable delayed default.

The implementation, public/type guards, repository migration, package consumption, and F3 closure gates realize this acceptance. F3 did not add a VOUCHED stamp or select F4's target or focus API; completed F4 made that later selection without authorizing F6 pointer work.

## Pinned Ink baseline

The repository baseline is Ink v7.0.4 at [`40b3a757`](https://github.com/vadimdemedes/ink/tree/40b3a7578811fd616341ca4e31cc7748aeeff12f). Ink v7.1.0 at [`25766aec`](https://github.com/vadimdemedes/ink/tree/25766aec618bd62030069f57dd081e5ebdd46add) has identical `use-input`, `use-paste`, `use-focus`, input-parser, and keypress-parser objects; its relevant addition is whole-terminal suspension.

Useful starting behavior from Ink is deliberately narrow:

- every active `useInput` subscription receives the event synchronously in registration order;
- `isActive: false` removes that subscription and its raw-mode ownership;
- focus state does not automatically own input, so current applications explicitly combine `isFocused` with `isActive`;
- paste has a separate subscription channel, and active paste subscriptions suppress delivery to `useInput`;
- handler return values do not stop broadcast, and Ink has no priority, bubbling, handled result, or embedded-PTY fallthrough.

The baseline is evidence, not a target for known failures. Pinned Ink also leaks Kitty query replies, mishandles Kitty Ctrl+C, does not apply its Tab/Escape defaults to Kitty encodings, drops known key identity from the public route, and supplies printable text on Kitty release. vue-tui must not recreate those failures merely for parity. Primary sources are Ink's [`useInput`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-input.ts#L126-L268), [`usePaste`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-paste.ts#L15-L80), [`App` input dispatch](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/components/App.tsx#L240-L303), [focus route](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/components/App.tsx#L406-L509), and [Kitty detection](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/ink.tsx#L1104-L1191).

## Routing prior art

No inspected framework automatically forwards a semantically unhandled event as original bytes to an embedded PTY:

| Framework                                                                                                                                                                         | Observed route                                                                                                                             | Continue or default mechanism                                                                                                                                                                                 | Embedded-PTY fallback |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [OpenTUI core and keymap](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/keymap/src/types.ts#L244-L279)                              | global listeners, then one focused renderable; keymap layers may be global, exact-focus, or focus-within and use explicit numeric priority | core propagation and default prevention are separate; keymap fallthrough continues through later bindings while prevention blocks later host delivery, but neither surface separates all four vue-tui results | none                  |
| [Textual](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/src/textual/app.py#L4121-L4146)                                                     | priority bindings, then focused widget and parent bubbling                                                                                 | stop propagation and prevent the current node's default are separate                                                                                                                                          | none                  |
| [prompt_toolkit](https://github.com/prompt-toolkit/python-prompt-toolkit/blob/236bfb7c15c62e921dc81bac5aefcabb16450f0c/src/prompt_toolkit/application/application.py#L1447-L1499) | choose the highest-priority match assembled from focused, parent, and global bindings                                                      | one match runs; no match is discarded                                                                                                                                                                         | none                  |
| [pi-tui](https://github.com/badlogic/pi-mono/blob/4c1861033b63a04563547ccdb5ed2bf31d4fdcd3/packages/tui/src/tui.ts#L761-L834)                                                     | global listeners, then one focused component                                                                                               | global listeners can consume or rewrite; focused delivery has no continue result                                                                                                                              | none                  |
| [Bubble Tea](https://github.com/charmbracelet/bubbletea/blob/fc707bb7ea0161405bb6c653ec93f6a9c6a72fe1/tea.go#L741-L880)                                                           | one message to the root model                                                                                                              | the root explicitly calls child updates                                                                                                                                                                       | none                  |

These projects show viable mechanisms, not one industry rule. The decisive vue-tui evidence must come from its two journeys and must keep semantic application routing distinct from transparent PTY byte transport.

## Internal experiment history

The experiment established the mechanism before public names were selected:

Each route trace keeps four results independent: whether a recipient performed a semantic action, whether later semantic recipients still receive the fact, whether a delayed default remains allowed, and whether an explicit external owner may receive the normalized source sequence. An active modal boundary also chooses the candidate route before handlers run; an unrecognized key inside an approval overlay must not reach the background composer merely because the overlay performed no action. These began as internal test terms and now map to the accepted public route-result fields without exposing the private topology.

1. **Implemented in F3.1:** give byte decoding, structural framing, and protocol detection one serialized ingress per physical stdin; preserve bracketed-paste payloads; retain ordered event-start multi-app multicast; and separate total from unsuspended raw ownership;
2. **Implemented in F3.2:** normalize each structurally framed event once into a shared immutable semantic key, text, paste, pointer, or uninterpreted fact, and adapt the current hooks at the edge;
3. **Control retained in F3.2:** keep pinned Ink broadcast, registration order, `isActive`, printable-release, and current public key projection behavior while the richer fact stays internal;
4. **Corrected in F3.2:** preserve paste as a paste fact regardless of listener count and prove pasted control, escape, pointer, and query-like content never becomes an application default or protocol reply;
5. **Implemented in F3.3:** add per-route leases captured at event start so a replacement handler cannot inherit a split event while unrelated persistent handlers and other apps still receive it; fix paste destination and mouse classification at the same boundary while retaining ref updates and re-entrant broadcast behavior;
6. **Implemented as a private pure F3.4 model:** run a coding-agent composer plus approval overlay and a terminal-workbench route through explicit layers: global application command, selected active boundary, later focused control, logical ancestors, owner and application defaults, and an optional external owner;
7. **Proved at the policy-model boundary:** keep semantic action, semantic continuation, default prevention, and external permission independent; require semantic completion for fallthrough; isolate modal plans; and forward honest normalized UTF-8 sequences while retaining the invalid-byte provenance limit;
8. **Implemented in the live controller:** extend the event-start snapshot to boundary, supplied focus path, default, and external activation leases; resolve one atomic selected generation before callbacks; route current adapters through the private plan; and prove the same order, replacement, re-entry, modal isolation, delayed defaults, and shared-stdin failure isolation in effective Inline and Fullscreen controller mounts;
9. **Selected and proved:** retain normalized UTF-8 rather than post-protocol source spans, prove slow protocol isolation deterministically in-process, and pass ordered text, key, paste and uninterpreted delivery through an explicit adapter into a real child PTY in Inline and Fullscreen;
10. **Selected under the vouched direct-stdin contract:** retain physical `useStdin().stdin` as the actual mounted stream outside framework event and safe-composition guarantees;
11. **Implemented:** acquire and release controller input demand transactionally, retain demand for independent globals after a selected path becomes stale, and pass both-mode, screen-reader, final-stream, shared-stdin, suspension, teardown, acquisition-rollback, HMR, and real-PTY evidence without a mount-time raw policy;
12. **Implemented host boundary:** exclude non-TTY streams from managed semantic routing; expose only the actual raw stdin stream; remove public raw-mode operations and mount policy; and make semantic-route demand own raw/listener/ref and Kitty negotiation;
13. **Completed public contract:** replaced the lossy `useInput`, removed `usePaste`, public `Key`, and `exitOnCtrlC`, retained direct stdin, published normalized facts with a required route result and independent availability query, implemented one all-run global F3 layer, failed fast when a registration becomes active on an unavailable live host, kept inactive and string-host registration inert, and assigned target/local/external attachment to the later completed F4 contract.

The proved route order is application-global commands → current active boundary → focused owner and logical ancestors → delayed default → explicit external owner. Framework protocol replies stay before the route. Default Ctrl+C behavior is at the delayed-default position so an application can interrupt an active agent or let a focused terminal pane receive Ctrl+C; the accepted public contract removes the mount switch and exposes per-event prevention through the route result.

## Ordered evidence matrix

| Area           | Required observable evidence                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol       | ordinary input during detection arrives once; deterministic in-process coverage proves complete and slow-split replies never reach application code; timeout preserves safe non-protocol input; ordering is stable                                                                                                                                                  |
| Key and text   | legacy and Kitty letter, Enter, Tab, Escape, arrows, Insert, F1, keypad or media examples retain identity, modifiers, text, phase, and recoverable source sequence                                                                                                                                                                                                  |
| Paste          | multiline and escape-containing paste remains one paste fact; pasted Ctrl+C does not exit; listener count does not reclassify content                                                                                                                                                                                                                               |
| Public global  | every captured active global receives one frozen public fact in registration order; inactive and replacement registrations do not inherit it; required results merge monotonically; same-tick changes do not lose physical input ownership                                                                                                                          |
| Route          | live controller mounts in effective Inline and Fullscreen sessions prove explicit layer order, all-run global peers, atomic selected generations, split and same-chunk replacement, frozen removal, re-entry, modal isolation, preventable delayed defaults, external fallthrough, per-app failure isolation, and transactional input demand                        |
| External owner | the pure workbench plan and a two-mode nested-PTY fixture forward continued text, control keys, paste and uninterpreted normalized sequences once and in order; the explicit adapter translates child paste state, framework replies cannot escape, invalid bytes become U+FFFD, and the raw-stdin escape hatch remains explicitly outside managed-route guarantees |
| Lifecycle      | Inline and Fullscreen share semantics; suspension, teardown, error, HMR, and shared stdin leave no stale listener, parser state, raw lease, or protocol mode                                                                                                                                                                                                        |
| Host           | controllable and externally pre-raw live TTYs, unsupported setterless TTYs, deterministic final-output tests, screen-reader transcripts, and string documents report, route, clean up, or fail without manufacturing input capability; managed semantic routing is unavailable on non-TTY streams, whose raw bytes remain directly accessible                       |

## Issue #250 acceptance role

[Issue #250](https://github.com/vuejs-ai/vue-tui/issues/250) describes two `useInput` calls in one setup while template `v-if` switches visible regions. Setup-scope cleanup cannot infer which branch owns input; both global hooks remain active unless the author maintains `isActive` or moves each hook into a child component that unmounts. F2 solved the renderer-host lifetime mechanism, F3 established normalized route ownership, and completed F4 attaches logical focus to rendered lifetime. Its public coding-agent and real-terminal acceptance journeys prove that an approval overlay suppresses the composer without manual booleans, releases on removal, and restores composer delivery in both modes.

## Deliberate non-decisions

- This F3 contract does not select target/local/external attachment; completed F4 owns and publishes that separate contract over the same event and result types.
- No DOM capture/bubble analogy is assumed; terminal routes may use explicit ordered owners instead.
- No old hook was protected for compatibility. The implementation replaced `useInput` and removed `usePaste` and public `Key` directly, without a compatibility period.
- F3 did not pull focus scope or target-ref input behavior forward; completed F4 now supplies them. Pointer propagation, scroll routing, selection, and copy remain owned by F6–F8.
- No automatic embedded-PTY forwarding is promised. Semantic facts plus normalized sequences now support an explicit adapter in the nested-PTY journey; child protocol state and byte encoding remain specialized-engine responsibilities.
