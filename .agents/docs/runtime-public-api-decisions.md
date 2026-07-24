# Runtime public API decisions

Judgments Yunfei actually expressed about the target public surface of `@vue-tui/runtime` — selections, acceptances, and rejections. A finished implementation, a passed review, resemblance to a peer, or silence is not acceptance. Never invent a rationale. Entries record the judgment, not the full API contract; implementation detail and evidence live in the [Runtime public foundation re-audit](./runtime-public-foundation-reaudit.md) and the [current branch API contract](./api-contract.md). Edit entries in place; git keeps history.

The current goal's three-layer direction is not duplicated here: `runtime ← use ← components`, with independent higher-level behavior in the optional, replaceable `@vue-tui/use` layer. This review also applies Yunfei's stated working constraint that higher layers use only public Runtime APIs and that Runtime expose only primitives requiring Runtime ownership. See [Package Layers & Dependency Direction](./package-layers.md).

The branch's exact export inventory is guarded in code and tests. Entries below record only Yunfei's expressed judgments; evidence-determined technical conclusions belong in the re-audit and API contract rather than this ledger.

## Decided

Entries without a stamp are drafts of judgments Yunfei expressed. A stamp alone on the first line below an entry heading covers that whole entry as current vouched direction.

### Earlier public-API vouches do not bypass this review

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Re-evaluate earlier public-API vouches when deriving the minimum Runtime surface; they are evidence of the previous assumptions, not automatic retention decisions for this review.
- **Limits:** This does not discard unaffected product goals or implementation evidence, and an earlier choice may be accepted again after review. It does mean that an old stamp alone cannot close an Open API item whose assumptions or package boundary changed.
- **Why:** Yunfei explicitly said that earlier vouches are not necessarily still valid because some of their underlying assumptions have changed.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### Current consumers establish a lower bound, not a deletion rule

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Do not remove a candidate Runtime primitive merely because it is absent from vue-tui's current application sample; compare mature peers and ordinary component requirements before concluding that the capability is unnecessary.
- **Limits:** Concrete current consumers remain strong positive and regression evidence. Peer presence alone does not accept an exact API or justify copying a complete framework surface; the primitive must still require Runtime ownership and form a small coherent contract.
- **Why:** Yunfei explicitly pointed out that vue-tui has too few users for missing application usage to be representative.
- **Source:** Yunfei, 2026-07-23, current `Box` and `Text` review; no durable session URL is available, so this entry is the durable record.

### Unsupported usage does not require dedicated validation

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** An unsupported Runtime usage does not by itself require proactive detection or a dedicated error. Prefer the simplest sound implementation, and decide whether to add a guard only after weighing implementation complexity, Runtime-owned state and resource safety, diagnostic value for users, and future freedom for that specific case.
- **Limits:** This does not ban explicit errors or require Runtime to accept malformed usage silently. A case may justify validation when it protects an invariant or materially improves user experience at reasonable cost. Conversely, an incidental current error, recovery path, or test for unsupported usage does not become a public contract merely because it exists.
- **Why:** Yunfei expects implementation simplicity and explicit user-facing diagnostics to conflict in some cases. He rejected a blanket rule that unsupported behavior should receive defensive validation and instead chose a case-by-case trade-off.
- **Source:** Yunfei, 2026-07-24, current `Static` unsupported-placement review; no durable session URL is available, so this entry is the durable record.

### Minimum public API is measured in concepts, not repetitive prop spelling

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Do not remove stable shorthand from a Runtime-owned primitive merely to reduce the number of public prop names when doing so makes ordinary application code mechanically repetitive.
- **Limits:** This rejects an edge-only interpretation of minimum API; it does not automatically accept every Ink alias or every convenience unrelated to an already accepted primitive. Exact `BoxProps` fields remain under review.
- **Why:** Yunfei explicitly rejected requiring applications to expand ordinary `padding`, horizontal margin, and two-axis overflow into eight separate Box bindings.
- **Source:** Yunfei, 2026-07-23, current `Box` and `Text` review; no durable session URL is available, so this entry is the durable record.

### Basic rendering operations remain public

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** `@vue-tui/runtime` must retain public `createApp`, `renderToString`, `Box`, and `Text` values.
- **Limits:** This accepts the existence and Runtime placement of the four values. The complete `renderToString` contract is decided below; the remaining exact signatures, props, named types, host behavior, and failure semantics stay Open where listed.
- **Why:** Yunfei explicitly said this group was reasonable. He later specifically retained `renderToString` after reviewing its real production use for deterministic non-interactive terminal documents and its need for Runtime-owned layout and paint behavior.
- **Source:** Yunfei, 2026-07-22 and 2026-07-23, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### `createApp` retains the documented Vue application model

[VOUCHED @hyfdev 2026-07-22]

- **Ruling:** `createApp` returns a Vue application with the documented Vue app-level capabilities, including plugin installation, app-level provide, configuration, component and directive registration, and unmount. Vue's underscore-prefixed private app fields and vue-tui's renderer-only `TuiNode` are not public API. `mount()` returns the actual user root component instance rather than a Runtime wrapper instance or `void`.
- **Limits:** The exact TypeScript projection must preserve ordinary Vue plugin use without re-exposing private host fields. Mount options remain a separate review item.
- **Why:** Yunfei explicitly retained the standard Vue application capabilities and accepted matching Web Vue's documented root-instance mount result. He rejected treating Vue private fields as vue-tui API.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### App construction keeps Vue's signature and named authoring types

[VOUCHED @hyfdev 2026-07-22]

- **Ruling:** `createApp` retains `rootProps?: Record<string, unknown> | null` and returns the named public `TuiApp` type. `TuiApp` exposes the public application capabilities supplied by the consumer's installed Vue version while replacing Vue's DOM-oriented `mount`; underscore-prefixed Vue internals and the renderer-only `TuiNode` are excluded. A consumer on Vue 3.5 therefore receives `onUnmount()`, while a consumer on a Vue version without that public method does not. `MountOptions` remains a named public type. Do not add a separate `RootProps` export.
- **Limits:** This decides the parameter and type names and how the Vue application surface tracks the peer dependency. Mount host semantics and lifecycle barriers are governed by the accepted contracts below.
- **Why:** Vue itself accepts root props at application creation. An outside wrapper can pass the values but would make `mount()` return the wrapper rather than the actual user root instance. `TuiApp` and `MountOptions` name core objects that applications and higher-level packages store, accept, and derive configuration from.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review after Vue and Ink comparison; no durable session URL is available, so this entry is the durable record.

### `stdout` is an optional Node Writable

[VOUCHED @hyfdev 2026-07-22]

- **Ruling:** `MountOptions` retains optional `stdout`; omission uses `process.stdout`, and the public type is Node's `Writable` from `node:stream`. Do not require the narrower TTY-oriented `NodeJS.WriteStream`, invent a vue-tui output-stream type, or add a Web `WritableStream` union.
- **Limits:** This accepts the output option, default, and public stream protocol. Non-TTY cadence, Fullscreen availability, stream ownership, preflight, and failure settlement are governed by the accepted contracts below.
- **Why:** Custom output is required by real tests, while `process.stdout`, `PassThrough`, file streams, sockets, and other supported Node destinations share the Node Writable protocol. Runtime already relies on that protocol's callback, backpressure, and event behavior. Web streams use a different writer, locking, backpressure, and error model and can be adapted explicitly outside Runtime when needed.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### Mounted stdin and stderr use Node's base stream protocols

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** `MountOptions` retains optional `stdin` typed as Node's `Readable` and optional `stderr` typed as Node's `Writable`; omission uses `process.stdin` and `process.stderr` respectively. Do not require the narrower TTY-oriented `NodeJS.ReadStream` or `NodeJS.WriteStream` types.
- **Limits:** This accepts the two options, defaults, and public base protocols. Terminal capabilities remain separate optional facts, and Web streams require explicit outside adaptation. Ownership, validation, input demand, and failure settlement are governed by the accepted contracts below.
- **Why:** Yunfei accepted the reviewed declarations together and later explicitly selected the matching process-stream defaults. The review evidence showed that terminal capabilities can be detected separately from the Node base stream protocol.
- **Source:** Yunfei, 2026-07-22 and 2026-07-23, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### Mount mode remains an inline-or-fullscreen choice

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** `MountOptions` retains `mode?: "inline" | "fullscreen"`, and omission selects `"inline"`. An explicit Fullscreen request requires a TTY stdout and resolvable positive terminal dimensions; if either capability is unavailable, `mount()` throws synchronously instead of silently changing the requested mode.
- **Limits:** This accepts the option name, values, default, and Fullscreen availability result. Exact dimension discovery is an internal implementation choice that must truthfully establish the required capability; validation, acquisition, rollback, and later lifecycle behavior are governed by the accepted contracts below.
- **Why:** Yunfei explicitly selected Inline as the default and an error for an unavailable explicit Fullscreen request. Silently producing Inline output would claim that a mode request succeeded while providing a different screen model.
- **Source:** Yunfei, 2026-07-22 and 2026-07-23, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### Rendering-mode aliases are not separate root exports

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Do not separately export the root type name `RenderMode`; do not expose `RenderPresentation` because Runtime has no public presentation contract.
- **Limits:** The accepted non-optional mode union can be derived as `NonNullable<MountOptions["mode"]>`. Runtime may retain a private mode alias, and a future public named type would require an independent user need. A future accessibility proposal would reopen the removed capability itself rather than merely restore an alias.
- **Why:** Yunfei agreed that the option aliases have no independent value. Consumers do not need an extra public name for a type already expressed by an accepted option field, and the presentation field has now been removed entirely.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### Screen-reader presentation is removed from the current foundation

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Runtime must not support a screen-reader presentation in the current foundation: remove the `presentation` option, ARIA props and named types, environment selection, transcript renderer, internal string helper, and testing-only selector instead of retaining a hidden optional path.
- **Limits:** This does not declare terminal accessibility permanently out of scope. A future additive proposal may reopen it if a concrete user need justifies a complete semantic and host-lifecycle design; ordinary terminal text is not presented as an accessibility guarantee in the meantime.
- **Why:** Yunfei explicitly chose to remove and not support the current screen-reader feature rather than carry its cross-cutting contract in the minimum Runtime foundation.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### Console output is protected by default with an explicit escape hatch

[VOUCHED @hyfdev 2026-07-22]

- **Ruling:** `MountOptions` retains `patchConsole?: boolean`. Omitting it enables Runtime console protection; `false` leaves the process console untouched. Active applications compose as a normal stack: the newest active registration receives intercepted output, removing it reveals the previous registration, and Runtime restores the native console when no registrations remain. Runtime installs protection before the user component first runs, releases an application's registration only after its Vue cleanup, and forwards intercepted console output without content-based filtering.
- **Limits:** This accepts the option, default, escape hatch, nesting behavior, installation and release order, and absence of filtering. It does not add a public logging API or otherwise expand the Runtime surface.
- **Why:** Dependencies may call `console.*` while a terminal application is rendering. Runtime can keep that output from corrupting the live frame by default, while `patchConsole: false` lets an application keep or install its own console handling. Normal nesting is sufficient; a single-application restriction is unnecessary.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review after comparison with Ink 7.1.1; no durable session URL is available, so this entry is the durable record.

### Mount ownership and consumed-failure reporting are explicit

[VOUCHED @hyfdev 2026-07-22]

- **Ruling:** Mounting onto an already-owned stdout throws synchronously before state mutation and does not consume the app, allowing a later retry after the stream is released. Once a real mount attempt is consumed, a failure throws synchronously and `waitUntilExit()` rejects with the same error after Runtime cleanup instead of remaining pending.
- **Limits:** The accepted transactional preflight contract below defines the boundary around a consumed attempt. This ruling does not change Vue component-error handling after Vue has begun rendering.
- **Why:** A warning plus inert success falsely reports a mounted application, while synchronous throw informs the caller immediately. A lifecycle observer that already holds or later calls `waitUntilExit()` must observe the same terminal failure rather than wait forever.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### Inline non-TTY output is one final dynamic document

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Inline output to a pipe, file, or other non-TTY destination does not emit terminal screen-management controls and does not write every reactive dynamic frame. Accepted `Static` history is appended when committed, coordinated console output remains immediate, and clean teardown writes the current final dynamic document once. Empty final dynamic output writes no bytes; non-empty output receives a line ending only when it does not already have one. Error teardown does not replay a stale successful dynamic frame.
- **Limits:** This decides the default non-TTY output policy; ordering among simultaneously eligible `Static` blocks follows the Static contract below. It does not add a public cadence override. A custom Writable that happens to emulate TTY capabilities is governed by the capabilities it truthfully exposes.
- **Why:** Redirected output should be a useful final document rather than a recording of intermediate UI frames or terminal cursor operations. Yunfei accepted this policy after comparison with Ink, including the deliberate difference that an empty final document writes nothing instead of a lone newline.
- **Source:** Yunfei, 2026-07-23, current mount-host review after run-verifying Ink 7.0.4 and comparing Bubble Tea, OpenTUI, and Textual; no durable session URL is available, so this entry is the durable record.

### Mounted streams are borrowed

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** Runtime borrows caller-supplied `stdin`, `stdout`, and `stderr`; it never calls `end()`, `destroy()`, or otherwise permanently closes them. It removes its listeners and restores only stream and terminal state that it changed, including raw mode and ref state where applicable. Runtime closes resources that it created itself.
- **Limits:** Borrowing does not require Runtime to continue using a stream that has failed or closed, and it does not make Runtime responsible for an owner closing a file or socket after `waitUntilExit()`. Shared simultaneous application ownership remains constrained by the accepted stdout lease and input-demand behavior.
- **Why:** A stream passed by the caller may be shared with surrounding application code or reused after the terminal app exits. Ink, Bubble Tea, and OpenTUI follow the same practical ownership rule; ending or destroying a borrowed destination would unexpectedly take ownership from its creator.
- **Source:** Yunfei, 2026-07-23, current mount-host review after peer and Node stream comparison; no durable session URL is available, so this entry is the durable record.

### Failures of streams Runtime is actively using settle through application exit

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** Runtime treats loss of the mounted stdout host, a synchronous throw or callback error from an accepted stdout or stderr write, premature close before an accepted write or backpressure transaction completes, and loss of stdin while active managed input requires it as fatal Runtime failures. `EPIPE` is an error rather than silent success. Input-free stdin EOF is not an application failure. A close without an `Error` receives a stable Runtime-created error; a later close never replaces an earlier real error. The first fatal cause is recorded when observed, later restoration failures do not replace it, and `waitUntilExit()` rejects with that cause after cleanup and all accepted output has either completed or been abandoned. A required final or restoration write that fails after clean exit has begun changes that exit into rejection. `waitUntilRenderFlush()` remains a non-reporting output barrier and does not duplicate the exit result.
- **Limits:** Runtime does not treat every event on every borrowed stream as fatal; the failure must affect a capability or operation Runtime is actively using. Exact diagnostic wording for a close without an error is an implementation contract, not a new public type. Applications that intentionally treat a downstream closed pipe as success may catch and translate the rejected exit outside Runtime.
- **Why:** Once Runtime accepts ownership of a frame or terminal restoration write, callers need one reliable completion result instead of process crashes, pending exit promises, or false success. The reviewed peers do not provide a complete model here, so vue-tui deliberately closes their observable lifecycle gaps while retaining Node's ordinary stream error facts.
- **Source:** Yunfei, 2026-07-23, current mount-host review after Node stream documentation and run-verified Ink behavior plus Bubble Tea, OpenTUI, and Textual comparison; no durable session URL is available, so this entry is the durable record.

### Mount preflight and resource acquisition are transactional

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** Before user setup or terminal mutation, Runtime resolves and validates options, defaults, mode, stdout and stderr protocol state, stdout ownership, and Fullscreen TTY and positive-dimension requirements. It then reserves stdout, creates rollback ownership, installs stream observers, and installs accepted console protection before user component setup. If setup creates active managed input demand, Runtime validates stdin before acquiring raw mode or other terminal resources. Only after those checks succeed may it enter alternate screen, raw mode, mouse modes, or paint. Every acquired resource immediately registers inverse cleanup, and failure rolls back in reverse order. A later inactive-to-active input transition rechecks stdin capability.
- **Limits:** A deterministic preflight error throws synchronously without mutation and does not consume the app. A failure after a real attempt is consumed throws the original error synchronously and rejects `waitUntilExit()` after rollback, as accepted above. The implementation may organize helpers differently, but it may not run user setup or leave terminal state behind before a deterministically knowable failure.
- **Why:** Capability errors should be reported before visible or global state changes, while input capability cannot always be known to be required until Vue setup declares an active subscription. The accepted ordering preserves both facts without guessing from component source or weakening cleanup.
- **Source:** Yunfei, 2026-07-23, current mount-host review after peer startup and rollback comparison; no durable session URL is available, so this entry is the durable record.

### Invalid `exit` input throws without selecting an exit result

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** `useApp().exit()` requests clean exit and `useApp().exit(error)` accepts an `Error`. On the first call before teardown, any non-`Error` non-`undefined` JavaScript value synchronously throws `TypeError` and does not consume or select the application's exit result. If the caller catches it, the app continues; if it escapes, surrounding Vue or input error handling may still end the app. Once exit or teardown has already started, later calls remain no-ops and do not validate their arguments.
- **Limits:** This is runtime validation for untyped JavaScript, not an arbitrary success-result channel. It does not change first-valid-call-wins settlement or the inert `renderToString()` exit behavior already accepted.
- **Why:** The TypeScript contract names only clean exit or an `Error`. Ink's arbitrary success value channel does not serve the accepted vue-tui API, while silently converting invalid input into a selected failure would consume the app even when application code catches the programming error.
- **Source:** Yunfei, 2026-07-23, current mount-host review after run-verifying Ink 7.0.4; no durable session URL is available, so this entry is the durable record.

### Vue component errors follow Vue

[VOUCHED @hyfdev 2026-07-22]

- **Ruling:** Runtime does not insert a hidden component error boundary, render an automatic error overview, override `app.config.errorHandler`, or turn every Vue component error into application exit. The user's root, `onErrorCaptured` hooks, app error handler, and Vue's development and production behavior determine component-error propagation and continuation.
- **Limits:** Runtime still owns rollback and terminal restoration when synchronous mount or Runtime-controlled renderer, input, output, or terminal work fails. If a user handler suppresses an internal renderer failure, continued renderer behavior is unsupported; that does not justify changing ordinary Vue component-error semantics.
- **Why:** Yunfei asked Runtime to follow Vue rather than add special component-error handling, even when a user chooses to continue after an unsafe failure. The hidden boundary currently changes Vue propagation, hides the user root instance, and bundles an application error screen with Runtime resource ownership.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### Pretty component-error UI is deferred above Runtime

[VOUCHED @hyfdev 2026-07-22]

- **Ruling:** Do not add a zero-configuration Runtime error boundary, error screen, or mount option. A future Ink-like error boundary and formatted error screen may be offered as explicit, optional `@vue-tui/components` behavior built only from Vue and public Runtime APIs, but it is deferred until later application-layer work.
- **Limits:** This does not accept component names, props, slots, automatic exit, retry behavior, source-file reading, or Fullscreen durability semantics, and it is not a Runtime-foundation completion requirement.
- **Why:** Explicit composition can provide the useful error UI without changing every application's Vue error propagation or root instance. Yunfei chose not to add it now and to revisit the optional component later.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### Component lifecycle access remains public

[VOUCHED @hyfdev 2026-07-22]

- **Ruling:** `@vue-tui/runtime` retains `useApp(): UseAppReturn`, where the named public `UseAppReturn` exposes `readonly exit: (error?: Error) => void` and no other operation.
- **Limits:** This decides the mounted-component surface and retains the project's `UseXReturn` naming convention for object-valued hook results. String-rendering behavior, invalid JavaScript input, and mounted repeated-call settlement are governed by the other accepted contracts in this ledger.
- **Why:** Components need Runtime-owned application exit and error settlement. `UseAppReturn` is retained as the standard named return shape used by vue-tui hooks, rather than requiring consumers to derive it with `ReturnType`.
- **Source:** Yunfei, 2026-07-22, current Runtime public API review; no durable session URL is available, so this entry is the durable record.

### `useInput` exposes one tagged text, key, and paste event contract

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** `@vue-tui/runtime` retains one public `useInput()` subscription and the named public types `TuiInputEvent`, `TuiKey`, and `TuiKeyName`. The event uses `type: "text" | "key" | "paste"`. A text event carries a non-empty `text` and may carry a complete nested `key` only when Runtime has reliable logical-key identity; a key event carries that required nested `key` and has no `text`; a paste event carries the complete decoded bracketed-paste `text` and has no key fields. Empty paste remains valid. `TuiKey` is exactly one of a normalized named key or one logical `character`, plus `shift`, `alt`, `ctrl`, `meta`, `super`, and `hyper` booleans. It is never nullable and never contains both name and character. `TuiKeyName` provides literal suggestions for `backspace`, `tab`, `enter`, `escape`, `insert`, `delete`, the four arrows, `home`, `end`, `page-up`, `page-down`, and `f1` through `f12`, while retaining an open string tail so future normalized keys do not widen its assignable domain; Runtime emits stable semantic lower-kebab-case names rather than parser tokens.
- **Limits:** Event classification follows paste before text before key: recognized bracketed paste is always paste; otherwise any non-empty application text produces a text event, with optional key evidence; otherwise a reliable logical key produces a key event; inputs with none of those facts are not public events. Key identity is logical rather than a physical position or base-layout code. Runtime does not invent a key for an opaque text chunk or IME commit. Unmarked paste remains indistinguishable from ordinary text. Protocol, raw sequence, parser names, codepoints, base-layout identity, lock state, and a public unknown or uninterpreted category remain private. This does not add `usePaste()` or `useRawInput()`.
- **Why:** Yunfei accepted the final design after reviewing ordinary text, enhanced Shift+A, Ctrl+A, Enter, IME, and paste examples, and after explicitly reviewing nested versus flat key fields. The tagged union removes nullable and empty sentinels, keeps text insertion straightforward, and makes the optional complete key fact reusable by third-party higher layers without exposing parser details.
- **Source:** Yunfei, 2026-07-23, current Runtime public API review after comparison with Ink, OpenTUI, Bubble Tea, Textual, and Crossterm; no durable session URL is available, so this entry is the durable record.

### `useInput` is a live broadcast subscription without propagation results

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** `useInput()` accepts a live `MaybeRef<Handler>` and an optional `isActive?: MaybeRefOrGetter<boolean>` whose default is `true`; a direct function is always the handler rather than a getter. Handler results are ignored. Every active subscription receives each event, and subscriptions cannot consume it, prevent delivery to peers, or control focus or routing through a return value. Key release is not delivered; repeat is delivered as another ordinary input. `MountOptions.exitOnCtrlC` defaults to `false`: when false, Ctrl+C is an ordinary key event; when true, Runtime exits before delivering that exact key input. Paste contents never trigger this default.
- **Limits:** Focus, scopes, modal routing, priority, and propagation remain application or higher-layer policy composed through activation. `useInput()` does not promise relative handler ordering as a routing mechanism. Inline and Fullscreen use the same event contract. An active live subscription requires controllable mounted stdin and fails explicitly when that capability is unavailable; inactive subscriptions create no input demand. `renderToString()` permits the composable but never invokes its handler. A future phase-aware or raw-input facility, if justified, must be a separate opt-in primitive rather than changing this default delivery contract.
- **Why:** Yunfei accepted the complete control contract after reviewing multiple subscribers, handler reactivity, Ctrl+C takeover, terminal phase limitations, non-TTY behavior, and future raw-input escape needs. Broadcast plus reactive activation is sufficient for third parties to compose higher-level routing without placing application policy in Runtime.
- **Source:** Yunfei, 2026-07-23, current Runtime public API review after peer comparison and bounded adversarial review; no durable session URL is available, so this entry is the durable record.

### `useStdin` remains a complete low-level input escape

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** Runtime retains `useStdin(): UseStdinReturn` and the named return type with exactly `readonly stdin: Readable`, `readonly isRawModeSupported: boolean`, and `readonly setRawMode: (enabled: boolean) => void`. A live app receives the exact `Readable` selected by `MountOptions.stdin`. Each `useStdin()` call owns an independent, idempotent logical raw-mode hold: `true` acquires that call's hold, `false` releases only that hold, and Vue scope disposal releases it automatically. Physical raw mode remains active while any public raw hold or managed `useInput()` demand remains, is temporarily restored during Runtime suspension, resumes for surviving holds, and is restored during teardown.
- **Ruling:** Raw-only use does not start Runtime's normalized parser, Kitty negotiation, or bracketed-paste reporting. The caller owns direct stream listeners and their cleanup. Direct stream observation and `useInput()` may see the same physical input and have no safe ordering, deduplication, protocol-filtering, or byte-exact composition guarantee. A non-TTY `Readable` remains observable while reporting no controllable raw mode. In `renderToString()`, the hook receives an isolated inert `Readable`, reports no raw-mode support, never touches `process.stdin`, and produces no input.
- **Limits:** This does not publish Runtime's stdin ingress, parser, routing, protocol configuration, input availability, or a general renderer controller. It does not add `useRawInput()`, claim that a raw listener can replace managed terminal protocols, or promise that one consumer can force the physical terminal cooked while another owner remains active. Exact diagnostic wording and the behavior of redundant unsupported-mode calls remain implementation details so long as capability failure does not mutate terminal state or another owner's hold.
- **Why:** Yunfei chose the complete low-level route after comparing the three coherent peer models: Ink exposes stream plus raw-mode capability and control, Bubble Tea and Textual keep raw input at the program or driver owner, and OpenTUI exposes its broad renderer. A stream-only remnant was neither a usable Ink-like escape nor a fully managed input model. Retaining complete per-component access lets third parties implement alternative low-level input behavior through public Runtime APIs, while per-hook ownership corrects the old anonymous-counter failure where one component could release another component's or `useInput()`'s raw mode.
- **Source:** Yunfei, 2026-07-23, current `useStdin` review after pinned Ink 7.0.4 run-verification and comparison with Bubble Tea, Textual, OpenTUI, and Ratatui; no durable session URL is available, so this entry is the durable record.

### `Static` is one Vue-native Inline history block

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Runtime retains `Static` as the only public value on `@vue-tui/runtime/inline`. It has no public props, events, methods, collection-specific types, or scoped-slot payload; its ordinary default slot describes one irreversible history block. A mounted instance remains open while it produces no output. Its first non-empty eligible output is committed once above the replaceable live region, after which the slot subtree is released through normal Vue unmount lifecycle and later reactive changes cannot rewrite the committed bytes. Applications use ordinary Vue `v-for` and stable `key` values for collections, `Box` and `Text` for layout and styling, and a new mount or remount for a new history block.
- **Ruling:** Vue conditional rendering keeps its ordinary lifecycle meaning rather than becoming reversible history control. Removing an instance before its first accepted output produces no block; removing it after acceptance cannot erase terminal history; mounting it again creates a new instance that may commit the same content again. A true Fullscreen surface that encounters `Static` throws explicitly and restores Runtime-owned terminal resources rather than silently ignoring it or treating it as mutable viewport content.
- **Ruling:** Presence in the current Runtime render tree makes a mounted Static instance immediately eligible regardless of ancestor or direct `v-show`; `v-if` and ordinary mount lifecycle decide whether the instance exists. Several blocks accepted together use current rendered host-tree preorder, while blocks that become eligible later append without moving accepted history.
- **Limits:** This does not promise reversible visibility or copy Ink's `items`, render-function, and style API. Roots, components, Fragments, and ordinary Box structure are the supported authoring path; other placement, nesting, and malformed-tree behavior is unsupported and creates no public normalization, exact diagnostic, recovery, or Static-specific failure-timing contract. Inline non-TTY append behavior and `renderToString()` behavior are decided elsewhere in this ledger. Private host nodes and validation, prepare, accept, abandon, backpressure, cleanup, and rollback transactions remain implementation mechanisms.
- **Why:** Only Runtime can coordinate irreversible terminal history with the replaceable frame. Vue already owns collection rendering, instance identity, conditional creation, and component cleanup, so Runtime needs only the one-block primitive. Yunfei chose mounted identity as the minimum eligibility rule because `v-show` does not unmount a component and Static is a history-output boundary rather than a layout node; adding visibility-dependent eligibility would be a separate policy. Current Vue tree order is the natural order for several Vue-owned instances, and already written terminal history cannot move. Pinned Ink v7.0.4 runs confirm the overlapping baseline: empty `items` may later produce output, unmount does not erase committed output, and remount creates a fresh producer that repeats the block.
- **Source:** Yunfei, 2026-07-24, current Runtime public API review, retaining the run-verified pinned Ink v7.0.4 lifecycle baseline while explicitly selecting Vue mount identity, `v-show` independence, and rendered-tree ordering; no durable session URL is available, so this entry is the durable record.

### App exit and app-owner wait barriers have one simple settlement contract

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** The public app owner retains `waitUntilExit(): Promise<void>` and `waitUntilRenderFlush(): Promise<void>`. The first mounted `useApp().exit()` call wins and later calls are no-ops. `exit()` requests normal teardown; `exit(error)` makes `waitUntilExit()` reject with that same `Error` after Runtime-owned teardown, terminal restoration, and already-accepted output complete. Normal unmount or exit makes `waitUntilExit()` resolve only after that same completion point. `waitUntilRenderFlush()` is an always-callable output barrier rather than an app-state validator: before mount and after completed exit it resolves immediately because no work exists; while mounted it waits for the render and output work already accepted for that barrier; while teardown is in progress it waits for already-started teardown output and then resolves, leaving the authoritative exit result to `waitUntilExit()`.
- **Limits:** One `waitUntilRenderFlush()` call does not subscribe to a future mount or later application updates. String rendering, invalid untyped arguments, and first-failure selection are governed by the other accepted contracts in this ledger. Runtime does not expose a multiple-error result shape or its internal scheduler and stream-barrier algorithms.
- **Why:** Runtime alone knows when accepted renderer and terminal output is complete and when owned resources have been restored. A flush barrier has no pending work before mount, must not invent an availability error, and must not duplicate exit error reporting. The pinned Ink v7.0.4 baseline provides the closest run-verified peer behavior for mounted exit, first-call settlement, final-output waiting, and flush during teardown; vue-tui additionally has a distinct pre-mount state because it follows Vue's separate `createApp()` and `mount()` shape. The relationship and evidence are recorded in [vue-tui ↔ Ink](./ink-divergences.md#app-exit-settlement-and-flush-during-teardown).
- **Source:** Yunfei, 2026-07-23, current Runtime public API review after comparison with the run-verified pinned Ink v7.0.4 baseline; no durable session URL is available, so this entry is the durable record.

### `renderToString` is one synchronous initial terminal document

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Runtime retains `renderToString(component: Component, options?: RenderToStringOptions): string` and the named `RenderToStringOptions` with only `readonly columns?: number`. It synchronously returns one initial terminal document, defaults to 80 columns, has unbounded height, and acquires no terminal, stream, input, or live-application resources. Runtime validates `columns` as a positive bounded integer before component setup or paint allocation. It does not accept `rows`, `mode`, streams, lifecycle barriers, or other live-host options, and it does not preserve special runtime recognition of removed options or reject unrelated extra object keys.
- **Ruling:** Runtime creates a temporary normal Vue renderer tree. Synchronous setup and mount hooks run, and setup-time synchronous state changes are reflected, but the returned document is the first synchronous commit: updates queued by `onMounted`, timers, promises, async setup, or other later work are not awaited. Both success and failure unmount the tree, run component cleanup, and release Yoga and Runtime-owned resources before returning or throwing. An unhandled component error is synchronously propagated after cleanup.
- **Ruling:** Shared components may call `useApp()` and register `useInput()` while string rendering. Input subscriptions remain inert and never receive input, and `useApp().exit()` is an inert no-op because the temporary application already ends before the function returns. `Static` contributes each non-empty block present in the temporary Runtime tree in Vue tree order before ordinary document output; `v-show` does not suppress it, an empty block contributes nothing, and no future Static lifecycle exists after the temporary tree is destroyed. The returned string has no artificial trailing newline, and layout and styling use the same Runtime renderer as live output.
- **Limits:** This does not add an asynchronous string renderer, root-props overload, VNode or app overload, string-specific styling dialect, color option, terminal mode, or live lifecycle. Those are additive future proposals only if real application practice requires them. The exact `Box` and `Text` prop grammar remains a separate review.
- **Why:** The public machud monitor uses the operation for real `--once` and `--snapshot` output that can be piped, used in CI, or inspected without a TTY, while its tests use the same path for deterministic component documents. Only Runtime can reproduce terminal cell measurement, wrapping, Yoga layout, Text styling, and Static extraction. The contract follows the run-verified Ink 7.0.4 synchronous baseline while expressing Static through Vue tree and mounted-identity semantics rather than layout visibility. machud also proves the shared-component case: the snapshot tree obtains `exit` for an input handler that can never run in the inert string host, so permitting the hook without inventing an exceptional lifecycle is the smaller behavior.
- **Source:** Yunfei, 2026-07-24, current Runtime public API review after the production-use audit, peer comparison, explicit review of the complete behavior batch, correction of the unsupported `exit()` exception policy, and the decision that `v-show` cannot suppress a mounted Static block; no durable session URL is available, so this entry is the durable record.

### `Box` and `Text` keep the reviewed minimum authoring surface

[VOUCHED @hyfdev 2026-07-23]

- **Ruling:** Runtime adopts the exact public authoring shape in the [`Box` and `Text` review](./runtime-public-api-review.md#box-and-text): `BoxProps` has 46 fields covering nine layout and paint concepts, `TextProps` has nine fields covering color, text modifiers, and width handling, and the only named authoring types are `BoxProps`, `TextProps`, and `Color`. Text foreground and background each accept the closed `Color` grammar or the explicit terminal `"default"` escape; all six reviewed modifiers remain; and width handling retains `wrap`, `hard`, `truncate`, `truncate-middle`, and `truncate-start` while removing the synonymous `truncate-end`. Percentage and offset notation remain accepted where the reviewed shape specifies them, but their explanatory helper aliases and the individual enum unions are not separate exports.
- **Limits:** This vouches the public field names, value categories, named types, and deliberate omissions in that reviewed shape. It does not declare the current implementation complete or turn numerical range handling, current-prop defaults, opposing-offset resolution, percentage layout resolution, clipping boundaries, truncation details, or nested style resolution into additional public APIs. Those observable behaviors still require implementation and focused tests before the Runtime foundation can be called complete.
- **Why:** Yunfei accepted the complete shape after comparison with Ink and other peers, review of real application code, and two bounded adversarial rounds. He clarified after the second round that its findings were behavior and safety-envelope work rather than changes to the public API. In the follow-up field-by-field Text review, he accepted terminal-default foreground and background, all six modifiers, and all five width modes; he specifically chose to keep `hard` because its word-boundary-independent behavior is a reasonable primitive even though its evidence is weaker than ordinary wrapping and truncation. He also rejected measuring minimum API by mechanically deleting shorthand: the minimum should contain the necessary concepts while keeping ordinary Vue application code reasonable.
- **Source:** Yunfei, 2026-07-23, current `Box` and `Text` public API review after two bounded adversarial rounds and the follow-up field-by-field Text review; the linked review is the pinned contract and evidence record.

### Focus acquisition stays explicit

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** `useFocus()` does not expose `autoFocus`, `initialFocus`, or another mount-triggered focus option. Runtime exposes the explicit `focus()` operation and makes it usable from the component's ordinary Vue `onMounted()` hook; a component or higher layer that wants focus on every mount composes that behavior itself.
- **Limits:** `v-show` does not remount a component, so showing it again never triggers mount-time focus. An application that deliberately wants focus on later visibility changes explicitly watches the state it owns and calls `focus()`. A repeated convenience may later grow into an optional component prop or public-only `@vue-tui/use` behavior, but it is not part of the Runtime foundation. The exact accepted overloads, target source, handle, unavailable behavior, host semantics, and absence of disabled policy are governed by the decision below.
- **Why:** Yunfei concluded that mount-time focus is completely implementable by users with `onMounted(() => focus.focus())`; keeping the decision explicit avoids Runtime guessing about first appearance, later visibility, remounting, or stealing focus.
- **Source:** Yunfei, 2026-07-24, current focus review; no durable session URL is available, so this entry is the durable record.

### Focus identities may optionally follow a rendered target

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Each mounted application has at most one focused identity. Every `useFocus()` call creates a distinct opaque identity in the same application controller, and a successful `focus()` replaces any previous owner. Runtime exposes two explicit overloads rather than one optional-target signature: `useFocus()` creates a logical identity whose validity follows its Vue scope, while `useFocus(target)` creates the same kind of identity and additionally binds its validity to one explicit Runtime-rendered target.
- **Ruling:** A targetless identity is not invalidated by an ancestor's `v-show` because Runtime has no rendered target to inspect; scope disposal still removes it. A targeted identity cannot remain focused while its target is missing, detached, unmounted, or `display:none`, including when a rendered ancestor hides it. Becoming available again does not restore focus, and losing a targeted identity does not restore the previous owner.
- **Ruling:** Runtime does not derive navigation policy from the target. The focus contract has no `tabIndex`, public focus order, `focusNext()` or `focusPrevious()`, automatic Tab or Shift+Tab handling, neighbor fallback, pending restoration, or other index-based behavior. Applications and optional public-only higher layers choose which identity to focus and which input invokes that choice.
- **Limits:** The target is never the identity and exists only to couple that identity's validity to the accepted Vue-component-boundary lifecycle and ancestor-visibility facts. It does not imply input routing, geometry, caret, pointer, styling, visual-coordinate ordering, or inspection of every child inside a true multi-root Fragment. The exact public shape and boundary normalization are governed by the decision below.
- **Why:** Yunfei accepted both forms after reviewing their user-visible difference. Requiring a target would exclude logical input owners and components without one stable rendered region. Providing a separate zero-argument overload preserves those uses while retaining the ancestor-`v-show` case as the concrete Runtime-only value: a nested editor may not know that an outer Box hid its whole subtree, while Runtime can invalidate targeted focus without threading visibility state through every descendant. He explicitly rejected deriving navigation behavior from the target.
- **Source:** Yunfei, 2026-07-24, current focus review; no durable session URL is available, so this entry is the durable record.

### Focus handles and component targets use one Vue-shaped contract

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Adopt the exact public declarations, component-root normalization, unavailable behavior, host semantics, and lifecycle contract in the [`useFocus` review](./runtime-public-api-review.md#usefocus). In summary, Runtime exports `FocusTarget` as a readonly Vue ref to a current-app `ComponentPublicInstance | null | undefined`, exports one `UseFocusReturn` with a readonly boolean `Ref` plus void `focus()` and `blur()` operations, and provides `useFocus()` and `useFocus(target)` as two explicit overloads with the same return type. It has no options object or distinct targeted return.
- **Ruling:** Runtime follows the target component's one root VNode boundary rather than restricting targets to Box or Text, collecting a Fragment's children, rejecting true multi-root components, or selecting the first rendered descendant. It follows Vue's own single-root normalization for component chains and development-root Fragments; a normal Fragment remains one boundary. The accepted boundary controls attachment and common rendered-ancestor visibility, while child-specific visibility inside a true multi-root Fragment is not component-wide focus state.
- **Ruling:** A call to `focus()` on a currently unavailable targeted handle and any call through a disposed or inert handle is a no-op that does not replace the current owner or queue later acquisition. A valid-to-valid retarget in one accepted render preserves the opaque focus identity; an accepted unavailable state clears it and later availability never restores it. `blur()` releases the calling handle, and `disabled` remains composable application policy rather than a Runtime option.
- **Limits:** This contract does not publish VNodes, component internals, renderer nodes, general presence, navigation, input routing, geometry, or a visual focusability test. In particular, an ordinary empty Fragment remains a mounted boundary while a Comment root is unavailable; focus validity does not mean that the target paints a non-empty cell. Teleport, KeepAlive, and Suspense receive no new public promise unless Runtime separately supports and reviews them.
- **Why:** Yunfei wanted any valid Vue component template ref to be accepted and rejected Box/Text-only typing, first-descendant guessing, multi-root errors, and the more complex collected-root region model. He accepted the complete reviewed handle and host contract, including void operations, individual `blur()`, no disabled option, inert string rendering, and renderer-bound ancestor invalidation.
- **Source:** Yunfei, 2026-07-24, acceptance of the complete [`useFocus` review](./runtime-public-api-review.md#usefocus); no durable session URL is available, so the linked review is the pinned artifact.

### Public focus-manager access is removed

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Do not expose `useFocusManager()` or `UseFocusManagerReturn` from the target Runtime public surface. Runtime retains one private per-app controller for unique ownership and rendered-target invalidation, but applications and higher layers interact through individual `useFocus()` handles.
- **Limits:** This removes public `focusedTarget`, `focusNext()`, `focusPrevious()`, and manager-wide `blur()`. The individual handle retains the accepted `blur(): void`; this decision does not permanently rule out a future narrower global-clear or observation primitive if a concrete Runtime-only user task establishes one.
- **Why:** Yunfei explicitly chose to delete `useFocusManager()` after reviewing its current surface. Traversal has already been rejected as application policy, individual handles provide direct programmatic focus, and the remaining observation or global-blur conveniences do not justify exposing the controller as part of the minimum foundation.
- **Source:** Yunfei, 2026-07-24, current focus review; no durable session URL is available, so this entry is the durable record.

### Direct Box presence is not a public Runtime primitive

[VOUCHED @hyfdev 2026-07-24]

- **Ruling:** Remove `useBoxPresence()` from the target Runtime public surface rather than publishing accepted-tree membership as a general-purpose hook.
- **Limits:** Runtime retains private rendered-target lifecycle and ancestor-visibility mechanisms required by `useFocus(target)` and any separately accepted Runtime-owned behavior. This ruling does not decide `useBoxSize()` or imply that higher layers may import the private mechanism.
- **Why:** Yunfei explicitly rejected `useBoxPresence()` and chose to review a Runtime-owned focus primitive instead.
- **Source:** Yunfei, 2026-07-24, current focus review; no durable session URL is available, so this entry is the durable record.

## Open

No additional Yunfei judgment is currently queued for the Runtime foundation. Unsupported future interaction and malformed-tree behavior requires a concrete user task before it becomes a public contract.
