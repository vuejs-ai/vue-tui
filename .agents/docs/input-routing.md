# Normalized input and routing

> **Status:** unstamped active F3 implementation record. F3.1 owns one serialized ingress and structural framing per physical stdin. F3.2 normalizes each structural event once into one shared immutable semantic fact. F3.3 captures non-reusable app-route leases when the event begins. F3.4 now has an executable private policy model for explicit route order, independent continuation and default control, modal isolation, and normalized-sequence external fallthrough; it is not wired into live dispatch and does not prove byte-exact PTY transport. Public names and current-API disposition remain active. This record does not select a public event type, hook name, handler return convention, focus route, external-PTY API, or the final disposition of `useInput`, `usePaste`, `useMouseInput`, `useStdin`, and `exitOnCtrlC`.

## Product problem

A stateful terminal application needs more than a callback for raw stdin chunks. A coding-agent composer must distinguish text, paste, global interrupt, approval actions, and local editing. A finder needs modal shortcuts and a focused query editor. A terminal workbench needs application shortcuts plus a pane that can receive input not handled by the outer UI. If the runtime loses key identity, guesses paste from listener count, broadcasts before ownership is known, or lets protocol replies share the application route, every component must rebuild part of the terminal input stack.

F3 establishes one truthful internal event stream and tests routing behavior before publishing an authoring API. F4 will later supply logical focus as one route owner; F3 must not implement a second focus system or assume that the current flat registry is final.

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

An app subscribes before Kitty auto-detection starts but retains ordinary input until Vue setup has installed its first handlers. This covers terminals whose query write synchronously produces `ordinary + reply + ordinary` input. Query completion and its protocol-enable write cannot overtake ordinary input from the data event that caused them; a throwing enable write is reported only after those ordinary segments have been delivered. Subscription deactivation is deferred until the current ingress transaction drains, so input synchronously produced by the enable write remains ordered after the outer data event.

Kitty detection has a finite 200ms FIFO slot per accepted query. A complete reply within that window is removed once and completes the oldest outstanding slot. Cancelling an app suppresses its callback but temporarily retains the written query's slot, so its late reply cannot settle another app's newer query; resuming the same app revives that slot instead of adding a blocker ahead of its fresh query. A synchronously rejected query write aborts its unwritten slot immediately. After cancellation, lone `ESC` and `ESC[` retain the ordinary 20ms input boundary, while a prefix that has become specifically query-shaped at `ESC[?` remains owned by the tombstone so a reply split beyond 20ms cannot leak. Bytes that arrive only after every relevant window are ordinary input; for example, `ESC[?1`, a timeout, then `u` delivers `u`.

Each framing unit snapshots app generations at its start. Suspension invalidates delivery but retains a definite split CSI, paste, or UTF-8 scalar long enough to find and discard its boundary; a lone ambiguous Escape is dropped so it cannot consume the first post-resume key as an old Alt chord. Ordinary last-consumer release and disposal discard orphaned framing. The last framework listener pauses a stream that the ingress itself put into flowing mode, so idle bytes remain buffered rather than being silently drained; reattachment resumes that owned flow. An externally flowing stream remains externally owned and is not paused.

Raw-mode state records total logical references separately from references belonging to unsuspended apps. A re-entrant reconciler commits desired ownership before calling `setRawMode`, `ref`, or `unref`, then rechecks it after every host callback. Suspending one app deactivates only that app's subscription and active raw references; the physical stdin remains raw while another app is active. The last active app releases the terminal mode, and continuation reacquires raw mode, parser-affecting paste and mouse modes, then the input listener before Kitty. A suspension requested during partial mount is deferred until the complete acquired resource set can be released.

Each input composable and terminal-mode controller now separates requested state from attached or physical state and drains re-entrant changes before returning. This matters when a custom stream callback synchronously changes `isActive`, suspends, mounts another app, or unmounts the current app. A terminal write that throws may have failed before or after the escape took effect, so paste and mouse ownership becomes explicitly uncertain until an idempotent disable establishes a safe state. Cleanup continues across independent paste, mouse, raw-mode, listener, and ref failures, and one-shot restore failures are retried before suspension or disposal reports completion. The first error is still surfaced after a surviving re-entrant owner has reached its final requested state.

The raw controller assumes Node-style idempotent `ref()` and `unref()` behavior. A custom stream that increments a private lease counter and then throws after the side effect is indistinguishable from one that throws before the side effect; no caller can infer which happened from the exception. Custom streams therefore need `ref()` and `unref()` to represent a boolean keep-alive state, as Node streams do, rather than a stack of counted leases.

## Implemented F3.2 semantic fact boundary

After query ownership and structural framing, the shared ingress now normalizes each event exactly once and sends the same frozen object to every eligible app. The internal discriminated facts are key, text, paste, pointer, and uninterpreted input. Every fact preserves its decoded source sequence. Paste also preserves its payload and reconstructed bracketed boundaries. A syntactically valid SGR pointer report preserves the wire button, coordinates, final byte, modifiers, and the decoded action when known; an unsupported button/action remains pointer input with no fabricated action. A complete Kitty query response produces no application fact.

Plain UTF-8 is recorded as text rather than guessed to be a physical key. For example, a received `A` does not prove that Shift was held; it may come from Caps Lock, an IME, a keyboard layout, or unbracketed text. Recognized legacy controls and escape sequences become keys, but their phase remains unknown because legacy terminals do not distinguish initial press from repeat. Kitty CSI-u keys retain the primary, shifted, and base-layout codepoints; independent Shift, Alt, Ctrl, Super, Hyper, Meta, Caps Lock, and Num Lock bits; press, repeat, or release; known functional identity; and only text explicitly reported by the terminal. The current Ink-shaped compatibility adapter derives ordinary printable and Return input at the hook edge, so derived text is never confused with a reported protocol fact. Kitty pure-text facts retain protocol, primary zero, reported origin, and phase without inventing a key identity. Unknown Kitty functional PUA values remain non-printable keys with their numeric identity rather than becoming printable private-use characters.

The Kitty parser now follows the official [`CSI primary[:shifted[:base]];modifiers:event;text u` grammar](https://sw.kovidgoyal.net/kitty/keyboard-protocol/). It accepts alternate keys, base-layout-only keys, pure-text events with primary zero, and all defined modifiers. Invalid Unicode scalars, associated control text, modifier zero, event values outside press/repeat/release, C0 key codepoints that Kitty does not define as functional keys, and letter-form special sequences whose first parameter is not one remain uninterpreted with their exact decoded source sequence. Alt and Meta stay distinct internally. The current public `Key.meta` compatibility projection still combines them.

The current hooks are adapters, not the fact source. `useInput` reads one cached Ink-shaped projection shared by all current listeners; Ctrl+C, focus defaults, and mouse delivery read the same normalized fact and never parse its sequence again. A paste whose event-start route snapshot contains a paste owner goes to that paste route; otherwise the event-start input route receives the payload verbatim with no fabricated key flags. Paste-contained Ctrl+C, arrow, mouse, and query-like bytes therefore remain text and cannot execute an application default or disappear as a protocol reply. The richer internal key identity is deliberately not published while routing semantics remain open.

## Implemented F3.3 route-lifetime boundary

Each app input attachment now owns a non-reusable internal lease on one typed `input`, `paste`, `mouse`, or `internal_mouse` route. Updating a handler ref keeps its lease and reads the latest callback. Deactivation, scope disposal, component replacement, and later reactivation end the old lease and create a new one; the listener function's JavaScript identity cannot revive an earlier attachment.

The physical stdin ingress captures an app-specific route snapshot alongside the app generation when the first byte of an event arrives and carries it through split CSI, paste, pointer, and UTF-8 framing. Immediately before dispatch, the app filters the old snapshot's still-active leases once and freezes the recipients. A route removed before dispatch does not run, its replacement cannot inherit the event, unrelated persistent routes and other apps still receive it, removal during a callback does not cancel a later frozen recipient, and an addition waits for the next physical event. Re-entrant input begins with a fresh snapshot after synchronous route changes.

Paste destination and mouse classification use the same event-start context. A paste that began with a paste owner cannot fall back to input after that owner disappears, and a paste that began without one cannot be stolen by a later paste attachment. An SGR report that began before mouse capture remains input for the current compatibility route; a report that began while capture was active remains pointer input even if that owner disappears. Internal and public mouse recipient lists are both resolved before either group runs.

Kitty detection subscribes before Vue setup, so pre-mount ordinary input initially carries one bootstrap binding rather than an empty route snapshot. `activateInputDelivery()` resolves that binding once against the complete initial route set before invoking any handler; every earlier fact uses the same initial snapshot, and the controller then drops its binding reference so initial callbacks are not retained for the application lifetime. Suspension still invalidates the app generation rather than the component leases: an old split event may finish framing but cannot cross resume, while the first new event captures the still-live routes after terminal modes are restored.

Two limits remain explicit. First, standard UTF-8 replacement already loses invalid source bytes before semantic normalization; `sequence` is enough for valid terminal UTF-8 but is not yet a byte-perfect external-PTY fallback. Second, an ordinary text run has no physical key boundary on the wire and may follow stream chunk boundaries. F3 must either preserve raw byte spans or narrow the eventual external-owner guarantee before claiming transparent PTY forwarding. Neither limit is hidden by calling the current fact lossless.

## Executable F3.4 route-policy experiment

The private `input-route-policy.ts` model captures one immutable candidate plan before any callback: application-global recipients, one selected active boundary, a later supplied focused owner, that owner's nearest-to-farthest logical ancestors, owner and application defaults, and at most one explicit external owner. The model neither creates focus nor discovers the active boundary. A later controller integration must capture their activation leases beside F3.3's handler leases when the physical event starts; the pure experiment accepts the already-selected plan so it cannot accidentally create a second focus system.

Every semantic recipient returns four explicit internal observations. Performing an action does not imply stopping later semantic recipients. Stopping semantic delivery does not imply preventing delayed defaults. Preventing defaults does not imply stopping semantic delivery. External permission is independently monotonic, but external delivery is fallthrough rather than a side channel: the selected semantic path must also reach its natural end. Delayed defaults still run after a stopped semantic path unless a recipient explicitly prevented them; a default action blocks external delivery only when its own policy says so. These are executable mechanism terms, not proposed public fields, method names, or handler return values.

An active modal changes the candidate plan. The approval plan contains the approval boundary, approval owner and its ancestors, not the background composer or the terminal pane's external owner. An unknown key may therefore continue through every approval recipient without leaking to the background. Route changes made by a callback affect only a re-entrant or later physical event that captures a new plan; the current plan stays fixed. Synchronous handler failure fails closed for that application dispatch because later semantic recipients, defaults and external delivery do not run; the shared-ingress layer remains responsible for reporting the error and continuing other applications.

The deterministic coding-agent journey runs the same policy table under Inline and Fullscreen labels. It inserts and deletes composer text, preserves one escape-containing bracketed paste, submits a prompt, rejects one tool call, accepts its replacement, interrupts streaming with Ctrl+C, restores composer ownership for the next event, and lets idle Ctrl+C reach a delayed exit default. It proves three inheritance boundaries: a new approval owner does not receive the submit Enter, a replacement approval owner does not receive its predecessor's Escape, and the restored composer does not receive the approval Enter. The rendering modes intentionally produce the same input trace; actual mode and host integration remains a later gate.

The deterministic terminal-workbench journey selects either pane A with an explicit external owner or a closed confirmation-modal plan. Ctrl+W opens the modal globally; an unknown F5 and Escape never reach pane A or its external owner. After the modal closes, ordinary `a`, Tab and Ctrl+C traverse the explicit pane path. The pane prevents outer Tab focus and application Ctrl+C exit defaults without stopping semantic continuation, so the external owner receives normalized sequences `61 09 03` exactly once and in order. A bracketed-paste fact and an uninterpreted control sequence then follow the same complete path and reach the owner as their exact normalized sequence and same frozen fact object. This proves normalized-sequence fallthrough for text, control keys, paste and uninterpreted input, not transparent child-terminal compatibility or arbitrary source bytes.

The external representation is deliberately labeled `normalized-utf8-sequence`. A committed ingress test proves that source byte `80` and canonical UTF-8 `EF BF BD` both become the same frozen U+FFFD text fact and re-encode as `EF BF BD`; the original source cannot be recovered afterward. Outer Kitty encodings, bracketed-paste negotiation, pointer coordinates and a child terminal's protocol state also make automatic `pty.write(fact.sequence)` unsound as a general framework promise. A future explicit owner can be an application or specialized terminal-engine adapter, but byte-exact forwarding requires preserved post-protocol source spans and provenance before decoding. Whole-terminal suspension remains a separate ownership operation.

The experiment is source-level evidence only. It is not exported by the package, is not called by the current stdin controller, does not replace the current hook broadcast, does not move Ctrl+C, Escape or Tab defaults yet, and does not satisfy the real-PTY, host, lifecycle or packaged-consumer completion gates. The next implementation unit must extend event-start snapshots from flat channels to the selected topology and activation leases, connect the private planner behind compatibility adapters, and prove actual live delivery before any public API proposal.

## Reproduced failures and constraints

### Protocol input has no single owner

Kitty auto detection and the application controller listen to the same `data` event. The detector later `unshift()`s non-response bytes that the controller already handled. A real `PassThrough` reproduction delivered `a ESC[?1u b` as `a`, `b`, and then a duplicated `ab`. The former unit harness replaced `unshift()` with an array, so it proved byte preservation without exercising replay into the real stream.

The controller also flushes an incomplete ordinary escape after 20ms while Kitty detection waits 200ms. Splitting `ESC[?1u` after `ESC[?`, waiting 35ms, and then sending `1u` delivered `"[?"` and `"1u"` to the application. Filtering a complete reply later in each `useInput` listener cannot repair a reply already split into application events.

The first F3 red tests require ordinary bytes around a query reply to arrive once and in order and require a response split beyond the ordinary escape timeout to remain protocol input. The implemented correction is internal: one shared ingress owns byte decoding, structural framing, protocol recognition, semantic normalization, and ordered multicast for a physical stdin. It creates one frozen fact before app delivery; the current `useInput` listeners read one cached compatibility projection instead of parsing or reducing the event again. This avoids replay and classification differences among apps sharing stdin without prematurely selecting a public route.

### Parsed facts are reduced before routing

Before F3.2, `parseKeypress()` already knew a key name, code, raw sequence, modifiers, Kitty source, printable text, and press/repeat/release state. `useInput()` exposed only a text-like `input` string and a small boolean `Key`; F1, Insert, keypad, media, and modifier-only keys became indistinguishable empty events. Ctrl+C caused a second parse in the controller, and every active listener parsed the same event again.

The internal stream now retains those facts once. The current hook projection still intentionally demonstrates the information loss of the old public shape; whether the final public surface exposes all fields directly remains open.

### Paste meaning depends on subscribers

Before F3.2, the existence of any `usePaste` listener changed the event kind for the whole app. With a listener, every paste listener received the payload and no `useInput` listener did. Without one, boundaries disappeared and the payload was interpreted as ordinary keys: pasted Ctrl+C could trigger application exit, and pasted `ESC[A` could become Arrow Up. The shared fact is now always paste. Listener count only selects the temporary edge adapter, and fallback content is verbatim text. The final route and hook disposition remain open.

### Framework defaults run before application ownership

Escape blurs and Tab or Shift+Tab moves the current flat focus registry before ordinary application listeners run, then the same event still broadcasts to all active listeners. No handler can prevent the default or stop later delivery. F3 must separately test two questions: whether routing continues to another owner, and whether the framework or component default runs. One boolean must not accidentally stand for both.

### App and route generations solve different lifetimes

F3.1 snapshots app subscriptions; F3.3 adds individual hook-route leases inside each app. The reproduced failure used a persistent app route while `useInput` component A was replaced by B during a split CSI: completing the key formerly delivered it to B. Invalidating the whole app would also discard the event for an unrelated persistent handler. The implemented two-level snapshot drops only A's expired lease, excludes B's later lease, and still delivers to persistent routes and another app. F4 can bind a selected route to logical focus and rendered lifetime without reopening physical input ownership.

### Direct stdin is a parallel escape hatch, not fallthrough

`useStdin().stdin` exposes physical chunks before the framework knows whether an application handler used them. It also sees protocol replies and paste wrappers and cannot receive only unhandled input. This may remain a low-level escape hatch, be replaced, or be removed, but it cannot serve as the terminal-workbench fallthrough contract.

Whole-terminal handoff is a separate operation. Ink 7.1's `suspendTerminal()` and Bubble Tea's `ExecProcess` release framework input/output and terminal modes while an external program owns the terminal, then restore and redraw. They do not route an unhandled event to an embedded PTY while the outer application remains active.

### Input availability is not yet a coherent host fact

The temporary `inputLifecycleActive` condition follows the requested live-output setting and controls the default raw hold plus Kitty auto detection, even though stdin capability and stdout update cadence are different axes. Input composables throw on a live non-TTY stdin except `useFocus`, which quietly does nothing; string rendering injects an inert controller. F3 must make these results explicit after the live routing experiment rather than infer input from output mode.

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

| Framework                                                                                                                                                                         | Observed route                                                                        | Continue or default mechanism                                                                                                                                     | Embedded-PTY fallback |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [OpenTUI](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/lib/KeyHandler.ts#L130-L200)                                       | global listeners, then one focused renderable                                         | propagation and default prevention are separate; the optional keymap also distinguishes command rejection, keymap fallthrough, and preventing later core delivery | none                  |
| [Textual](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/src/textual/app.py#L4121-L4146)                                                     | priority bindings, then focused widget and parent bubbling                            | stop propagation and prevent the current node's default are separate                                                                                              | none                  |
| [prompt_toolkit](https://github.com/prompt-toolkit/python-prompt-toolkit/blob/236bfb7c15c62e921dc81bac5aefcabb16450f0c/src/prompt_toolkit/application/application.py#L1447-L1499) | choose the highest-priority match assembled from focused, parent, and global bindings | one match runs; no match is discarded                                                                                                                             | none                  |
| [pi-tui](https://github.com/badlogic/pi-mono/blob/4c1861033b63a04563547ccdb5ed2bf31d4fdcd3/packages/tui/src/tui.ts#L761-L834)                                                     | global listeners, then one focused component                                          | global listeners can consume or rewrite; focused delivery has no continue result                                                                                  | none                  |
| [Bubble Tea](https://github.com/charmbracelet/bubbletea/blob/fc707bb7ea0161405bb6c653ec93f6a9c6a72fe1/tea.go#L741-L880)                                                           | one message to the root model                                                         | the root explicitly calls child updates                                                                                                                           | none                  |

These projects show viable mechanisms, not one industry rule. The decisive vue-tui evidence must come from its two journeys and must keep semantic application routing distinct from transparent PTY byte transport.

## Internal experiment order

The experiment proceeds without selecting public names:

Each route trace keeps four results independent: whether a recipient performed a semantic action, whether later semantic recipients still receive the fact, whether a delayed default remains allowed, and whether an explicit external owner may receive recoverable source input. An active modal boundary also chooses the candidate route before handlers run; an unrecognized key inside an approval overlay must not reach the background composer merely because the overlay performed no action. These are internal test terms, not proposed public fields.

1. **Implemented in F3.1:** give byte decoding, structural framing, and protocol detection one serialized ingress per physical stdin; preserve bracketed-paste payloads; retain ordered event-start multi-app multicast; and separate total from unsuspended raw ownership;
2. **Implemented in F3.2:** normalize each structurally framed event once into a shared immutable semantic key, text, paste, pointer, or uninterpreted fact, and adapt the current hooks at the edge;
3. **Control retained in F3.2:** keep pinned Ink broadcast, registration order, `isActive`, printable-release, and current public key projection behavior while the richer fact stays internal;
4. **Corrected in F3.2:** preserve paste as a paste fact regardless of listener count and prove pasted control, escape, pointer, and query-like content never becomes an application default or protocol reply;
5. **Implemented in F3.3:** add per-route leases captured at event start so a replacement handler cannot inherit a split event while unrelated persistent handlers and other apps still receive it; fix paste destination and mouse classification at the same boundary while retaining ref updates and re-entrant broadcast behavior;
6. **Implemented as a private pure F3.4 model:** run a coding-agent composer plus approval overlay and a terminal-workbench route through explicit layers: global application command, selected active boundary, later focused control, logical ancestors, owner and application defaults, and an optional external owner;
7. **Proved at the policy-model boundary:** keep semantic action, semantic continuation, default prevention, and external permission independent; require semantic completion for fallthrough; isolate modal plans; and forward honest normalized UTF-8 sequences while retaining the invalid-byte provenance limit;
8. extend the event-start snapshot to boundary, focus, default, and external activation leases, wire the private plan into actual controller delivery, and pass mode, host, lifecycle, direct-stdin duplication, protocol, and real-PTY gates;
9. only then retain, replace, or remove current hooks and select public names and types.

The first route order to test is application-global commands → current active boundary → later focused owner and logical ancestors → delayed default → explicit external owner. Framework protocol replies stay before the route. Default `exitOnCtrlC` behavior moves conceptually to the delayed-default position in this experiment so an application can interrupt an active agent or let a focused terminal pane receive Ctrl+C; no public mount change is selected yet.

## Ordered evidence matrix

| Area            | Required observable evidence                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol        | ordinary input during detection arrives once; complete and slow-split replies never reach application code; timeout preserves safe non-protocol input; ordering is stable                                                                |
| Key and text    | legacy and Kitty letter, Enter, Tab, Escape, arrows, Insert, F1, keypad or media examples retain identity, modifiers, text, phase, and recoverable source sequence                                                                       |
| Paste           | multiline and escape-containing paste remains one paste fact; pasted Ctrl+C does not exit; listener count does not reclassify content                                                                                                    |
| Current control | two active listeners receive exactly once; inactive listeners do not; split-event replacement cannot inherit; persistent routes and other apps remain; same-tick changes do not lose raw ownership                                       |
| Route           | the pure plan proves explicit higher-layer action, continuation, delayed defaults, modal isolation, re-entry snapshots, and order independent of registration timing; live controller integration remains                                |
| External owner  | the pure workbench plan forwards fully continued text, control keys, paste, and uninterpreted normalized sequences once with the same fact object; exact raw spans, protocol translation, live PTY delivery, and duplication remain open |
| Lifecycle       | Inline and Fullscreen share semantics; suspension, teardown, error, HMR, and shared stdin leave no stale listener, parser state, raw lease, or protocol mode                                                                             |
| Host            | live TTY, non-TTY, deterministic test, screen-reader transcript, and string document report or fail consistently without manufacturing input capability                                                                                  |

## Issue #250 acceptance role

[Issue #250](https://github.com/vuejs-ai/vue-tui/issues/250) describes two `useInput` calls in one setup while template `v-if` switches visible regions. Setup-scope cleanup cannot infer which branch owns input; both current hooks remain active unless the author maintains `isActive` or moves each hook into a child component that unmounts. F2 solved the renderer-host lifetime mechanism but did not migrate input. F3 must establish route ownership, and F4 must attach logical focus and rendered lifetime. The final acceptance journey is an approval overlay that suppresses the composer without manual booleans, releases on removal, and restores composer delivery in both modes.

## Deliberate non-decisions

- No public `InputEvent`, `KeyEvent`, hook, directive, component listener, or handler return value is selected.
- No DOM capture/bubble analogy is assumed; terminal routes may use explicit ordered owners instead.
- No current hook is protected for compatibility, but none is removed before the experiment supplies a coherent replacement.
- No focus scope, target-ref input behavior, pointer propagation, scroll routing, selection, or copy design is pulled forward from F4–F8.
- No automatic embedded-PTY forwarding is promised. The experiment first proves whether semantic facts plus recoverable source data can support an explicit external owner safely.
