# Runtime public foundation re-audit

## Status and authority

This is the implementation and technical evidence record for the public boundary currently present on PR #265. On 2026-07-22 Yunfei reopened that surface for item-by-item review. The [Runtime public API decision ledger](./runtime-public-api-decisions.md) remains authoritative for his expressed judgments; this re-audit records implementation results and evidence rather than inventing acceptance. On 2026-07-24 Yunfei closed the last Static question by selecting mounted identity, `v-show` independence, current rendered-tree ordering, and no public contract for unsupported placement or Static-specific failure timing. He subsequently reclassified the current `/devtools` and `/testing` bridges as privileged internals for the official tooling packages rather than public third-party integration contracts. The latest vouched layout correction replaces `useLayoutWidth()` / nullable `useViewportHeight()` with numeric `useLayoutSize()` width and height, gives `renderToString()` modeled `width` / `height` options with an explicit `Infinity` escape for unbounded height, makes live TTY the primary application host, and classifies explicit `renderToString()` plus implicit mounted non-TTY document output as supported secondary paths rather than undefined behavior. The mounted document path uses the same default 80×24 model for both mount modes and no longer throws solely for Fullscreen on non-TTY stdout. Those selected corrections are implemented on this branch with focused and package-boundary evidence; see [todos.md](./todos.md). Older narrative tables elsewhere in this file may still describe intermediate branch states and must not be read as superseding the ledger or the shipped package surface. The PR remains unmerged and unreleased.

The goal is not to publish every mechanism already implemented. `@vue-tui/runtime` publishes only facts and operations that require ownership of the terminal, Vue renderer, accepted layout or paint, normalized terminal input, or lifecycle resources. Application policy remains ordinary Vue code or an optional higher layer. No `@vue-tui/use` package is required by this phase.

Earlier vouches do not bypass the item-by-item review when their assumptions changed. In particular, the former accessibility props and transcript path are now removed rather than retained as current or hidden Runtime support; [removed experiments](./removed-experiments.md#screen-reader-presentation-and-aria) preserves only the historical evidence.

## User-visible result

The pre-audit branch asked users to understand Runtime's parser, routing, paint geometry, focus manager, pointer pipeline, clipboard transports, output coordinator, scheduler controls, and lifecycle result channel. The selected target asks users to understand only four things:

1. Render with `Box`, `Text`, `createApp()`, or `renderToString()`.
2. Read the few layout facts Runtime alone knows.
3. Subscribe to normalized input and, when needed, participate in one shared unique-focus controller without adopting Runtime routing policy.
4. Let the app owner mount, flush, exit, and await restoration.

```ts
import { createApp } from "@vue-tui/runtime";

const app = createApp(App);
app.mount({ mode: "fullscreen" });
await app.waitUntilExit();
```

```ts
import { onMounted, shallowRef } from "vue";
import { Box, useFocus, useInput } from "@vue-tui/runtime";

const panel = shallowRef<InstanceType<typeof Box> | null>(null);
const focus = useFocus(panel);

useInput(handlePanelInput, { isActive: focus.isFocused });
onMounted(() => focus.focus());
```

There is no public focus manager, renderer session, screen-reader presentation, ARIA semantic API, physical caret, pointer route, selection service, clipboard transport, arbitrary stdout transaction, frame-rate knob, `/fullscreen`, or `/internal` package entry.

## Path 0: renderer entry and basic nodes

### User task and resulting code

Applications need a Vue terminal tree and a synchronous document renderer:

```vue
<Box flexDirection="column" borderStyle="round">
  <Text bold color="cyan">Status</Text>
  <Text>{{ message }}</Text>
</Box>
```

```ts
createApp(App).mount();
const help = renderToString(Help, { width: 80, height: 24 });
```

### Boundary decision

- Retain `createApp`, `renderToString`, `Box`, and `Text`. Only Runtime can create the Vue custom renderer, own Yoga nodes, paint terminal cells, sanitize ANSI, and release the tree coherently.
- Retain the exact closed `BoxProps` and `TextProps` contracts already established by Path 0. Their named types let components describe Runtime-validated inputs without copying the grammar.
- Retain `Color` as the shared stable color domain of those primitives. The experimental `AriaRole` and `AriaState` domains were removed with screen-reader presentation.
- Remove `Newline`, `Spacer`, and `useAnimation` from Runtime; ordinary Text, Box, and Vue timers implement them without Runtime access. `Newline` and `Spacer` ship as `@vue-tui/components` exports built on the public surface, which is the layer that owns authoring convenience.
- Keep Yoga hosts, ANSI runs, and renderer nodes private. No current application justifies a transform API; the private Transform mechanism was deleted with the redundancy cleanup, and the screen-reader linearizer was deleted instead of retained privately.

Supported live-TTY Inline and Fullscreen hosts use the same Box/Text visual vocabulary and define the primary mounted application contract. `renderToString()` is the explicit supported secondary renderer for one deterministic document without terminal resources; its implemented options are `{ readonly width?: number; readonly height?: number }`, default to 80×24, and accept explicit `height: Infinity` when a caller needs an unbounded document. Mounting either mode against non-TTY stdout selects the implemented implicit document path with the same default 80×24 layout, mounted Vue lifecycle, Static and console commits, and final dynamic document. `useApp().exit()` is an inert no-op only in the synchronous string host. Runtime renders an owned root VNode and records every host Yoga allocation in a render-local ledger, so an initial Vue patch failure still disposes created scopes and inert streams, frees the render's Yoga nodes, and synchronously rethrows the original error.

## Path 1: layout, viewport, and Box facts

### User problem

The old `useWindowSize()`, broad `useRenderSession()`, and `useElementGeometry()` made ordinary code carry physical-terminal, host-resolution, and paint-fragment details. The intervening `useLayoutWidth()` / nullable `useViewportHeight()` split made every application understand a secondary host distinction. Most applications need one root layout bound and, when positioning relative content, one accepted Box rectangle.

### Runtime primitives

```ts
const { width, height } = useLayoutSize();
const { width: boxWidth, height: boxHeight, left, top, hasMeasured } = useBoxMetrics(boxRef);
```

- `useLayoutSize()` returns readonly numeric `width` and `height` refs from one coherent accepted root-layout snapshot. Supported live TTYs expose finite values. `renderToString()` exposes its modeled finite values and uses `height === Infinity` only when the caller explicitly requests unbounded vertical layout.
- `useBoxMetrics()` reports one directly referenced Box's complete final parent-relative layout rectangle through readonly `width`, `height`, `left`, and `top` refs. The values are zero before a result is available, and `hasMeasured` distinguishes that state from a real zero-sized Box.
- The mounted non-TTY document host exposes the same fixed modeled 80×24 layout as default `renderToString()` and has no resize lifecycle. Physical terminal `columns` and `rows` remain private protocol facts rather than public author-facing layout names.

The renderer's Vue visibility bridge is host-based rather than a component allowlist. Box and both Text hosts implement the directive's display surface, so Vue carries `v-show` through arbitrary single-root custom-component chains and all current `@vue-tui/components` members without component-specific visibility logic. A Text with a current default slot keeps one concrete host root; a completely childless Text keeps its existing Comment root, and render-function changes between those shapes are reevaluated rather than cached. A top-level Text maps `v-show` to its Yoga display; a nested virtual Text omits its subtree from the enclosing Text's composition and invalidates the enclosing measurement and paint caches. Both forms remain mounted and reveal state updated while hidden. Rendered-target focus follows the same hidden ancestry. Normal Fragment roots, including single-child Fragments, and text component roots keep Vue's development-only non-element-root warning and ineffective directive; Vue unwraps only its specially marked development-root Fragment, while Comment roots remain silently ineffective. Static remains outside this bridge because mounted history cannot be retracted.

Third parties cannot derive accepted root bounds or final Yoga layout from Vue refs alone. They can derive responsive layouts and component policy from these two implemented primitives without access to Yoga nodes, surface coordinates, clipping fragments, or the render-session graph. General accepted-tree membership is not published as `useBoxPresence()` merely to reconstruct focus outside Runtime; the selected `useFocus(target)` overload keeps its narrower renderer-owned validity check internal. The superseded split layout hooks and `useBoxSize()` have been removed without aliases.

## Path 2: Inline history

### User task and resulting code

An Inline application needs completed records to become immutable terminal history while a live tail continues updating:

```vue
<Static v-for="entry in completed" :key="entry.id">
  <CompletedEntry :entry="entry" />
</Static>
<Text>{{ liveTail }}</Text>
```

`Static` remains the only value on `@vue-tui/runtime/inline`. Runtime alone can separate irreversible history bytes from the replaceable live region. It has an ordinary Vue slot and no collection-specific props or named types; iteration, keys, filtering, layout, conditional mounting, and remount identity are ordinary Vue composition.

The implementation keeps an instance open until its first non-empty eligible output or ordinary Vue unmount. Only a block represented by non-empty bytes in the current settlement transaction settles; acceptance commits once, releases the slot subtree through normal Vue lifecycle, and never rewrites accepted history. Ordinary conditional unmount cannot erase accepted bytes, and remount creates a new producer. Accepted non-TTY blocks append immediately, string rendering prefixes accepted blocks to the dynamic document, and a true Fullscreen surface throws and restores its resources.

Several simultaneously eligible blocks commit in rendered host-tree preorder; older history never moves and later eligibility always appends. `Static` may be reached through the root, components, Fragments, and ordinary Box layout, but its own host is out of dynamic layout flow and paints one isolated block. Presence in the Runtime tree makes it eligible regardless of ancestor or direct `v-show`; only ordinary lifecycle such as `v-if` determines whether the instance exists. The implementation still rejects nested Static and Static inside Text before output, but these malformed placements and their exact diagnostics or recovery are defensive behavior rather than public contracts. Runtime's batch sealing, cleanup isolation, teardown settlement, retry prevention, and first-cause bookkeeping remain internal evidence under the general Vue, stream, mount, and app-lifecycle contracts.

## Path 3: normalized input and minimum focus without routing policy

> **Current input target, 2026-07-26:** The branch uses the vouched nested `TuiInputEvent`, `TuiKey`, and `TuiKeyName` facts, ignores handler results, defaults `exitOnCtrlC` to `false`, and retains `useStdin()` as the complete independently owned low-level escape. `useInput()` is a normal subscription on every mounted `Readable`: available bytes are normalized and delivered, while missing raw-mode capability or an input source that produces nothing does not reject the subscription. The focus paragraphs below record the selected minimum focus target. See the [event decision](./runtime-public-api-decisions.md#useinput-exposes-one-tagged-text-key-and-paste-event-contract), [delivery decision](./runtime-public-api-decisions.md#useinput-is-a-live-broadcast-subscription-without-propagation-results), and [low-level decision](./runtime-public-api-decisions.md#usestdin-remains-a-complete-low-level-input-escape).

### User task

Applications need facts such as inserted text, a complete paste, Enter, Escape, arrows, or Ctrl+C without parsing terminal byte protocols:

```ts
useInput(
  (event) => {
    if (event.type === "text") query.value += event.text;
    if (event.type === "key" && event.key.name === "escape") closeOverlay();
    if (event.type === "key" && event.key.character === "c" && event.key.ctrl) {
      cancelCurrentOperation();
    }
  },
  { isActive: () => overlayOpen.value },
);
```

### Boundary decision

- Retain `useInput(handler, { isActive? })`, `TuiInputEvent`, `TuiKey`, and `TuiKeyName`. Runtime classifies complete paste before non-empty insertion text before a reliable logical key. Text may include a complete nested key, key-only input requires it, and paste has no key. A key has exactly one normalized semantic name or logical character and six explicit modifiers. Protocol, raw sequence, parser token, codepoint, base-layout identity, locks, release, and unsupported input remain private.
- Resolve a direct or live-ref handler when input arrives, default reactive `isActive` to true, broadcast every event to every active subscription, and ignore returns. Repeat is delivered normally and release is not. Focus, ordering, priority, propagation, and routing remain application policy. `exitOnCtrlC` defaults false; true exits before delivering that exact key, while paste never triggers it.
- Retain `useStdin()` and `UseStdinReturn` with exactly the mounted `Readable`, a raw-mode capability Boolean, and `setRawMode(enabled)`. Each call owns one idempotent hold with Vue scope cleanup, independently of other calls and managed input. A live host treats an already-raw stream or exposed `setRawMode()` method as the capability instead of requiring an independently trustworthy `isTTY` claim. Raw-only use does not start the parser, change encoding, or negotiate Kitty or bracketed paste. Direct listeners are caller-owned and have no ordering, deduplication, protocol-filtering, or byte-exact composition guarantee with managed input. The mounted document host still exposes the exact stream for direct observation but reports no raw support and never changes raw state, while string rendering uses an isolated inert stream.
- Remove public parser phase, byte sequence, source/fidelity, codepoint, base-layout identity, input availability, external forwarding, focus scopes, route decisions, `usePaste()`, and `useRawInput()`.

Retain two explicit `useFocus` overloads in one per-app unique-owner controller. `useFocus()` creates a logical identity whose automatic validity follows its Vue scope; another successful focus acquisition can still replace its ownership. `useFocus(target)` additionally binds that identity's validity to one rendered target and its rendered ancestors. The target is not the identity and supplies no navigation or input route. Hidden or detached targeted focus clears without restoration. Remove the public manager, string lookup, traversal, scopes, modal trapping, focused subscriptions, external forwarding, restoration, and automatic Tab behavior.

Every mounted host supports managed input from its selected `Readable`. Runtime attaches its parser for an active subscription and delivers normalized events when bytes arrive; an ignored, ended, or otherwise silent stdin simply produces no events. On a live output host, an exposed raw-mode API is acquired as an optional enhancement with the existing terminal-protocol lifecycle, while absence of that API leaves parsing active without raw mode. The mounted document host likewise delivers available input but acquires no raw mode or negotiated input protocols; `useStdin()` exposes the exact mounted stream with no Runtime raw-mode capability there. String rendering provides isolated inert shared services and has no input lifecycle.

## Path 4: editable text and physical caret

Keyboard editing is application composition today: store text and an insertion index in Vue state, update them from `useInput()`, and render the visible marker as Text. A third-party package can implement that without privilege.

Exact physical terminal-caret placement cannot be implemented correctly from the accepted public facts because it needs final glyph mapping, clipping, output origin, focus, and commit timing. The old cell-coordinate `useCursor()` and focus-bound `useCaret()` exposed unstable renderer policy, so both and the semantic caret controller are removed. Runtime retains only generic terminal-cursor visibility and restoration required by ordinary frame ownership. Physical caret placement is explicitly outside this foundation until a real editor proves a smaller semantic Text-position primitive.

## Path 5: lifecycle, output ownership, and integrations

### User task and resulting code

The app owner chooses the host, can await a committed frame when coordinating a test or outer process, and can await complete restoration:

```ts
const app = createApp(App);
app.mount({
  mode: "inline",
  stdout,
  stdin,
  stderr,
  patchConsole: true,
  exitOnCtrlC: false,
});

await app.waitUntilRenderFlush();
app.unmount();
await app.waitUntilExit();
```

Inside the tree, the smaller operation is enough:

```ts
const { exit } = useApp();
exit(); // normal
exit(error); // waitUntilExit() rejects with this Error
```

### Boundary decision

- `MountOptions` contains exactly `stdout?: Writable`, `stdin?: Readable`, `stderr?: Writable`, `mode`, `patchConsole`, and `exitOnCtrlC`. Omitted streams select the corresponding process streams and omitted mode selects Inline. Explicit Fullscreen on a live TTY requires positive terminal dimensions and otherwise throws synchronously before setup or mutation. Non-TTY stdout selects the same supported document host for either mode rather than throwing or pretending to own a live Inline screen. The complete `patchConsole` contract and default-off Ctrl+C convenience are vouched.
- The mode union is expressed on `MountOptions["mode"]` rather than through a separate root alias. There is no presentation union because there is no screen-reader presentation.
- `TuiApp.mount()` validates deterministic options, streams, ownership, and Fullscreen capability before mutation. Such a preflight failure, including busy stdout, throws synchronously without consuming the app. Once acquisition or setup begins, a failure consumes the attempt, throws the original error synchronously, completes rollback, and rejects `waitUntilExit()` with the same object. Vue-side rollback is aligned with Vue rather than extended past it. Vue records container ownership only at the end of a successful patch, so when `app.mount()` itself throws there is nothing Vue can unmount, and plain Vue consequently runs no component cleanup at all for a failed initial mount — neither for a root `setup()` throw nor for a child one. Runtime matches that exactly: it does not write `app._ceVNode`, patch `EffectScope.prototype`, or seed the container ownership link to force a traversal Vue never authorized. When `app.mount()` returned and a later Runtime step fails, the ordinary Vue unmount still runs. Resource safety does not depend on any of this: the render-owned Yoga allocation ledger frees every allocation either way, alongside the ordinary terminal, stream, console, raw-mode, and stdout-ownership restoration. Evidence: [`vue-error-propagation.sequential.test.tsx`](../../packages/runtime-tests/integration/lifecycle/vue-error-propagation.sequential.test.tsx) and [`render-to-string-rollback.sequential.test.tsx`](../../packages/runtime-tests/integration/render-to-string-rollback.sequential.test.tsx) pin the aligned behavior, and [`yoga-lifecycle.sequential.test.tsx`](../../packages/runtime-tests/integration/lifecycle/yoga-lifecycle.sequential.test.tsx) proves the allocation ledger frees the allocations.
- `TuiApp.waitUntilRenderFlush()` is an always-callable app-owner output barrier. It resolves immediately when no work exists before mount or after exit, waits for accepted render and output work while mounted, and waits for already-started teardown output without duplicating the exit result. Component code does not receive it through `useApp()`.
- `TuiApp.waitUntilExit()` resolves `void` after normal teardown, restoration, and accepted output, or rejects with the first fatal `Error` by identity after that same completion point. Later stream and cleanup failures do not replace an earlier real cause, including a genuine `AggregateError`.
- `useApp()` exposes only `exit(error?: Error)`. Exit payloads, `clear()`, and component-level flush are removed.
- `patchConsole` defaults on, accepts `false` as the escape hatch, and uses a normal active-application registration stack around one physical process-console patch. Runtime installs protection before user component execution, releases each registration after that application's Vue cleanup, and forwards intercepted content without filtering it.
- `maxFps`, `onRender`, and terminal protocol options remain private Runtime or repository-test mechanisms. Output cadence is no longer an option at all: host facts decide it, because a TTY surface is always live and a non-TTY surface is always the final document host. The incremental-output mechanism and the `liveUpdates` cadence override were deleted with the redundancy cleanup. Clipboard transports and screen-reader implementation paths were removed entirely. Direct coordinated stdout/stderr composables and their flow-control result are absent from supported package entries; narrow repository-only hooks remain solely to verify output-coordinator ordering and backpressure.

`TuiApp` projects the public keys available from the consumer's installed Vue `App` type, including `config`, `use`, `mixin`, `component`, `directive`, `provide`, `runWithContext`, and `unmount`; Vue 3.5 consumers also receive `onUnmount` while the minimum supported Vue 3.4 surface does not. Runtime excludes every underscore-prefixed private app field and `TuiNode`, redefines `mount`, adds the two barriers, and returns the actual user root instance.

Inline, Fullscreen, errors, signals, job-control suspend/resume, HMR, console output, and raw terminal modes share one resource-ownership teardown. Preflight resolves defaults, protocol state, stdout host class, mode, stdout ownership, and live-TTY Fullscreen capability before mutation; acquisition reserves stdout, establishes reverse-order rollback, installs observers and console protection, runs setup, attaches demanded stdin parsing, acquires only the raw-mode and protocol resources actually exposed by a live host, and then paints. A later inactive-to-active transition repeats that optional acquisition; mounted document hosts attach parsing without raw or protocol resources. Mounted streams remain borrowed and reusable: Runtime never ends or destroys them, removes its listeners, and restores only state it changed. Active stdout/stderr failures and an actual stdin `error` during managed demand enter first-cause lifecycle settlement, while normal stdin EOF or close simply ends future input delivery. The mounted non-TTY document path emits no terminal-management bytes or intermediate dynamic frames, appends accepted Static and coordinated output immediately, writes the current dynamic document once on clean teardown with only a missing non-empty line ending added, and suppresses a stale successful frame on error. Inline and Fullscreen requests share this implemented fixed-80×24 document host. `presentation`, `INK_SCREEN_READER`, and internal transcript helpers no longer alter this resolution.

### Official tooling bridges are narrow privileged internals

- The supported `@vue-tui/runtime/devtools` and `@vue-tui/runtime/testing` package entries are removed.
- The mechanisms are necessary: the Vite adapter connects private HMR state, while the test bridge coordinates production input parsing, accepted content commits, deterministic suspension and resume, and internal settlement through the app flush barrier.
- `@vue-tui/vite` imports `connectDevtools()` through `@vue-tui/runtime/internal/devtools`; `@vue-tui/testing` imports `createTestHostBridge()` and its bridge-only types through `@vue-tui/runtime/internal/testing`. These are unsupported, version-coupled implementation channels rather than third-party extension contracts.
- The Vite bridge accepts one active dev session and one mounted app. A full reload replaces the old app without settling application exit, while programmatic `server.close()` disconnects the hot channel, normally unmounts the app, waits for terminal restoration and exit settlement, then closes Vite. Failed and successful update batches are correlated by Vite's exact file-change timestamp rather than a wall-clock suppression window. Vite error logging remains enabled for failures that have no HMR payload, and the default Runtime console patch coordinates those writes with the terminal frame; explicitly disabling console patching remains the application's escape from that protection. Focused unit, live-Vite, and real-PTY regressions cover session reuse, concurrent rejection, full reload, genuine exit, programmatic close, stable error display and recovery, exact entry matching, terminal restoration, and the narrow `@vue-tui/vite` root export.
- Package exports, packed declarations, tarball checks, clean consumers, and official package tests distinguish those two narrow internal entries from the supported public surface. No broad internal barrel is published.
- `@vue-tui/runtime/package.json` is the supported metadata path used to locate the version-matched visual-development guide shipped with Runtime without depending on the `dist` layout.
- The current broad `/internal` and `/fullscreen` paths are not package exports. Fullscreen remains a mount mode, not a second component or composable universe.

Mounted handoff to `$EDITOR`, `less`, or `fzf` remains deferred. Existing suspend/resume machinery handles process job control, but no real consumer establishes a stable arbitrary-command handoff API.

## Path 6: pointer, scrolling, selection, and clipboard

Keyboard scrolling is public composition: a component exposes `scrollBy()` or an application-owned offset, and `useInput()` decides when to call it. Nested scroll propagation is application policy; a Boolean method result can indicate whether the inner view moved.

Pointer hit testing, capture, drag, arbitrary existing-Text selection, physical selection highlighting, and OSC 52 clipboard ownership require final paint facts or terminal resource ownership. The experimental APIs bundled those facts with application routing and policy, so they and their unused hit-map, capture, selection, clipboard, and mouse-reporting implementations are removed rather than retained as a hidden architecture.

Applications can implement explicit copy actions with their own selected string and injected clipboard adapter. They cannot implement correct arbitrary painted-Text selection or pointer targeting from this foundation; those capabilities are explicitly outside the minimum deliverable rather than falsely approximated with layout rectangles. `CellPoint`, `ElementTarget`, `/fullscreen`, mouse hooks, selection hooks, clipboard hooks, and `MountOptions.clipboard` are removed.

## Bounded public-only extensibility result

The implemented foundation demonstrates public-only extensibility without claiming that every interaction feature is currently public. Existing third-party-style and first-party public-only code establishes the replaceable higher layer: the coding-agent example edits source state and renders a visible caret marker; ScrollBox combines accepted Box measurements with application-owned keyboard policy; the focus-hub proof implements registration, names, cleanup, hidden-target skipping, traversal, and focus-gated input entirely above Runtime; `useStdin()` supports an independently owned raw listener; Vue app injection supplies a custom known-string clipboard adapter; and reactive Box/Text, `/inline` Static, patched console output, and app barriers cover normal coordinated output tasks.

| Capability         | Public-only behavior available now                                                      | Additive Runtime work only if selected later                                            |
| ------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Caret and editing  | Source-owned text, insertion state, normalized input, and a rendered marker             | Physical caret at a semantic Text position                                              |
| Pointer            | Application-provided or fixed-layout signals only; no terminal pointer promise          | Target-bound parsed pointer delivery, reporting ownership, and capture                  |
| Selection          | Source-owned keyboard selection and rendered styling                                    | Arbitrary selection across accepted wrapped, clipped, and wide painted Text             |
| Clipboard          | Application-injected adapter for a known selected string                                | OSC 52 transport coordinated with Runtime output and lifecycle                          |
| External input     | One semantic higher-layer router, or a separate exact raw listener through `useStdin()` | Simultaneous byte-transparent child-PTY forwarding beside managed parsing and protocols |
| Coordinated output | Reactive rendering, Static history, patched console output, and lifecycle barriers      | Arbitrary plugin-defined exact terminal protocol writes during a retained live frame    |

The unavailable column does not justify exporting generic geometry, routing, clipboard, or output-coordinator state. Runtime retains only the accepted rendered-target, Box-measurement, focus, parser, terminal-input, output, and transaction mechanisms used by current contracts. Semantic caret, hit-map, capture, selection, clipboard, mouse-reporting, and selected-route topology were removed. A future selected feature must add the narrow Runtime-owned mechanism its real application path proves necessary. PTY lifecycle and VT emulation remain application or specialized-engine responsibilities, so neither simultaneous byte-transparent forwarding nor a general protocol-write transaction is an assumed requirement of this foundation.

## Superseded previous candidate ledger — do not use

The tables in this section preserve an earlier candidate inventory only. They are superseded by the [current API contract](./api-contract.md#the-contract--exports-from-supported-package-entry-points-and-their-user-consumable-types), and none of their names, options, host behavior, or dispositions should be read as current. In particular, the current foundation has no `RenderMode` or `RenderPresentation` export, ARIA surface, `presentation` option, `/fullscreen`, `/internal`, or Fullscreen fallback.

### Root values and associated named types

| Public API                                                                | Concrete task                                        | Why Runtime must provide it                                          | Third-party alternative                                       | Hosts and absence/lifecycle                                       | Decision                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- |
| `createApp`; `TuiApp`; `MountOptions`; `RenderMode`; `RenderPresentation` | Mount and own a live Vue terminal app                | Creates the renderer and owns terminal resources                     | None can reproduce ownership safely                           | Live Inline, Fullscreen, TTY, and streams; one real mount attempt | Retain                    |
| `renderToString`; `RenderToStringOptions`                                 | Produce one synchronous width-bound document         | Runs the same renderer without live resources                        | A wrapper can call it, not recreate it                        | String only; synchronous cleanup and failure                      | Retain                    |
| `Box`; `BoxProps`; `Color`; `AriaRole`; `AriaState`                       | Layout, paint, clip, hide, and describe regions      | Runtime owns Yoga and terminal cells                                 | Higher components compose Box                                 | Every rendering host; closed validated props                      | Retain                    |
| `Text`; `TextProps`                                                       | Render styled, wrapped, accessible terminal text     | Runtime owns graphemes, ANSI state, and cell width                   | Higher components compose Text                                | Every rendering host; screen-reader substitutes semantics         | Retain                    |
| `useApp`; `UseAppReturn`                                                  | End the current app normally or with an Error        | Runtime owns teardown and error settlement                           | Cannot safely emulate inside a component                      | Live hosts; `exit()` unavailable in string rendering              | Retain, reduced to `exit` |
| `useInput`; `TuiInputEvent`; `TuiKeyName`                                 | Receive normalized text, paste, and finite key facts | Runtime owns byte parsing and optional terminal input modes          | Focus/routing composes above it                               | Any mounted `Readable`; `isActive` owns demand                    | Retain, reduced           |
| `useStdin`; `UseStdinReturn`                                              | Reach the exact mounted raw stream                   | Runtime selects the host stream                                      | Host owner can retain its stream, shared components cannot    | Live and inert string contexts; no semantic guarantees            | Retain escape hatch       |
| `useFocus`; focus return and target types                                 | Select one logical or rendered-bound input owner     | Runtime owns the shared controller and rendered validity transaction | App policy composes `isFocused` with `useInput({ isActive })` | Implemented across live, string, non-TTY, and suspended hosts     | Retain, reduced           |
| `useLayoutWidth`                                                          | Read accepted root width                             | Runtime owns layout input and resize acceptance                      | Cannot derive reliably from process stdout                    | Numeric readonly ref on every host                                | Retain                    |
| `useViewportHeight`                                                       | Gate behavior requiring finite visual rows           | Runtime resolves whether a visual viewport exists                    | Cannot infer from layout width or raw rows                    | Ref on visual TTY surfaces, otherwise `null`                      | Retain                    |
| `useBoxSize`; `BoxSize`                                                   | Size one accepted direct Box                         | Runtime owns accepted paint and ref identity                         | Layout guesses are not equivalent                             | Visual paint only; readonly nullable ref                          | Retain                    |
| `useBoxPresence`                                                          | General accepted-tree membership                     | The private fact exists, but focus needs a narrower transaction      | No retained public task justifies the generic boolean         | Current implementation only                                       | Remove                    |

### Subpaths

| Subpath                         | Values                 | Named types                                                   | Decision                                                        |
| ------------------------------- | ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `@vue-tui/runtime/inline`       | `Static`               | None                                                          | Retain; Runtime-only irreversible Inline history                |
| `@vue-tui/runtime/devtools`     | `connectDevtools`      | None                                                          | Current only; move to privileged internal package entry         |
| `@vue-tui/runtime/testing`      | `createTestHostBridge` | `TestHostBridge`, `TestHostBridgeOptions`, `TestContentFrame` | Current only; move to privileged internal package entry         |
| `@vue-tui/runtime/package.json` | Package metadata       | None                                                          | Retain standard metadata access                                 |
| `@vue-tui/runtime/fullscreen`   | None                   | None                                                          | Remove; mode is selected at mount                               |
| `@vue-tui/runtime/internal`     | None                   | None                                                          | Keep broad path absent; add only required narrow internal paths |

### Mount options

| Option         | Semantics                                           | Failure and lifecycle                                                         | Decision |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| `stdout`       | Exact output stream owned by this mount             | Invalid/unwritable ownership fails before or during acquisition with rollback | Retain   |
| `stdin`        | Exact input stream used by raw and managed input    | Missing raw capability or absent data does not invalidate `useInput()`        | Retain   |
| `stderr`       | Exact fatal and patched-console error stream        | Output failures preserve the original app error and continue restoration      | Retain   |
| `mode`         | Requests Inline or Fullscreen terminal ownership    | Fullscreen may degrade to final stream behavior when no live surface exists   | Retain   |
| `presentation` | Selects visual paint or a screen-reader transcript  | Exact finite validation; explicit value overrides environment default         | Retain   |
| `patchConsole` | Opt in or out of Runtime-coordinated console output | Defaults true; `false` opts out; active applications nest; no content filter  | Retain   |

### App methods

| Method                           | Semantics                                                                           | Decision                                         |
| -------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `mount(options?)`                | Validate, acquire, render, and return the Vue component instance                    | Retain with minimum options                      |
| `unmount()`                      | Synchronously start idempotent teardown                                             | Retain inherited Vue method                      |
| `waitUntilRenderFlush()`         | Await already-accepted render and output work; resolve immediately when none exists | Retain on host-owned app handle only             |
| `waitUntilExit()`                | Await complete restoration; resolve void or reject with the authoritative Error     | Retain                                           |
| Vue app methods listed in Path 5 | Plugins, DI, registration, context, and unmount hooks                               | Retain unchanged as Vue composition              |
| `clear()`                        | Destructively reset a mounted surface                                               | Remove; choose Fullscreen or clear outside mount |

## Evidence and completion gate

The implementation retains the renderer, Yoga, input parser, broadcast subscription registry, output coordinator, terminal resource controllers, HMR, and suspension mechanisms required by accepted contracts. It removes the unused selected-route topology, semantic caret, broad geometry, hit-testing, capture, selection, clipboard, and mouse-reporting clusters rather than preserving them merely because they had tests.

Local validation covers formatting, package and example builds, warning-free lint, package and PTY-fixture type checks, clean packed consumers on the supported Vue lines, and the Runtime, Testing, Components, integration, PTY, Vite, and example suites. Exact counts belong in the review handoff because removing rejected experimental mechanisms also removes their tests. The clean consumer resolves the packed `@vue-tui/runtime/package.json`, reads the shipped version-matched visual guide, checks the current root and supported subpath exports, accepts only the two narrowly named official-tooling entries under `/internal`, and rejects the broad `/internal`, former `/devtools` and `/testing`, and removed `/fullscreen` paths. Application-facing higher layers and examples have no Runtime-internal imports, while official Vite and Testing packages alone use their version-coupled privileged bridges.

The clean consumer additionally exercises accepted-Static cleanup and subsequent keyed reorder/removal on both supported Vue lines, rejects every hidden or superseded mount string before side effects, and proves that the testing bridge does not expose repository-only mount controls through a caller-owned `mount` wrapper. Bounded reviews challenged the earlier candidate and the final reduced boundary; focused regressions cover the corrected same-app input broadcast and tooling-subpath descriptions.

The current Inline-history visual loop exposed and removed a non-function-slot warning in its raw TSX fixture. The rerun's inspected PNG showed `DONE 0`, deferred history, `DONE 1`, `DONE 2`, and only the newest `TAIL 2` in the normal buffer; application exit was zero, terminal attributes matched exactly, and an observed follow-up shell command succeeded. Earlier phase-specific visual loops cover the ordinary application, Box/Text surface, and host-based visibility paths. Layout and resize coherence for multi-panel Fullscreen surfaces is covered by in-repository layout, geometry, and PTY tests rather than external application consumers.

The 2026-07-24 bounded review supplied technical evidence for the selected application-facing surface. In-repository ScrollBox and layout tests justify the two narrow layout primitives; the shipped-guide lookup justifies package metadata; and the public-only compositions above distinguish replaceable higher-layer behavior from future additive Runtime interaction features. The separately published Vite and Testing packages justify retaining their narrow bridge behavior, but not treating that behavior as a third-party public Runtime contract. Yunfei accepted current rendered-tree Static ordering and mounted eligibility, then corrected the tooling classification. The Runtime public foundation is complete: ownership model and application-facing API require no further design for this phase; official devtools and testing bridges are privileged internal implementation channels. Caret, pointer, selection, clipboard, screen-reader, the later `@vue-tui/use` package, and component work remain outside this Runtime foundation. PR merge and release remain separate maintainer decisions.

## Per-API implementation evidence

Relocated here on 2026-07-25 from the item-by-item Runtime API review. These are the focused tests and current dispositions for each reviewed surface.

### `createApp` and `TuiApp`

- A packed public-only consumer on the minimum supported Vue version proves `rootProps`, `app.use()`, `app.provide()`, `app.config.errorHandler`, component and directive registration, `runWithContext()`, mount, unmount, and the two barriers without Runtime internals or Vue 3.5-only assumptions.
- Declaration checks prove Vue's supported public app operations remain available while `_container`, other private app fields, and `TuiNode` are absent.
- Normal and dev-overlay mounts return the actual user root instance, including an exposed user method; the testing bridge does not re-expose a wrapper proxy.
- A busy stdout throws synchronously without consuming the app, mutating terminal state, or touching the existing owner; the app can mount after the owner releases the stream.
- A consumed mount failure restores resources, throws synchronously, and rejects `waitUntilExit()` with the same failure.
- No-boundary initial and later component-error tests match Vue with and without user `onErrorCaptured` and `app.config.errorHandler` behavior.
- A partial-mount regression proves terminal restoration and complete Yoga-node release. If host allocation is unsafe, a narrow allocation transaction fixes rollback without restoring component-error policy.
- Existing Inline, Fullscreen, non-TTY, string, terminal restoration, and packed-consumer journeys remain green after obsolete error-overview tests are replaced with Vue and Runtime-boundary tests.

### `renderToString`

The implementation retains the synchronous result, Static prefix, inert input services, and cleanup-after-error mechanisms while replacing the columns-only option and implicit unbounded height with the accepted width-and-height model. Public `useLayoutSize()` reports the same modeled dimensions inside shared components.

### `Box` and `Text`

An earlier state of this branch publicly declared nearly the complete Ink Box/Text surface and tested it extensively. The minimum-API pass mainly removed declarations, validators, examples, and public tests; the Yoga setters, spacing reconciliation, text modifiers, wrap implementation, border painter, clipping, and ANSI machinery largely remain private. The audit therefore selected from implemented and previously exercised mechanisms rather than proposing a renderer rewrite.

The current implementation exposes exactly the reviewed fields and named authoring types. Eager validators enforce the bounded numeric, color, percentage, and unknown-attribute grammar before host creation; shorthand and axis-specific layout props reset and reconcile from current props; overflow uses the reviewed axis precedence; and layout and paint enforce the global cell-allocation bound.

Text now performs per-logical-line grapheme-safe wrapping or truncation, applies nested three-state modifiers, and resolves foreground and background defaults independently. Type fixtures, clean consumers, representative applications, string and final-stream tests, and terminal-visible clipping and style acceptance cover the result. Percentage height, the old permissive arbitrary-string grammar, private host types, `BoxLayoutStyle`, custom border objects, ARIA, and deleted advanced border decoration remain absent.

### Mount host contract

The implemented public streams use base Node `Readable` and `Writable` protocols, `exitOnCtrlC` defaults to `false`, empty final non-TTY output writes no bytes, and invalid `exit` input throws without choosing an exit result. Stream leasing, ordered output, reverse rollback, active-use failure detection, and first-cause settlement implement the borrowing and lifecycle rules above. A non-TTY stdout now selects the same fixed-80×24 document host for both mode requests and exposes that model through `useLayoutSize()`.

- Declaration and clean-consumer checks accept process streams, `PassThrough`, file streams, sockets, and other ordinary Node `Readable` and `Writable` values without casts; Web streams remain rejected without explicit adaptation.
- Inline and Fullscreen non-TTY tests cover the shared fixed-80×24 layout, final output, empty output, existing line endings, Static and console behavior, available managed input without raw or protocol acquisition, and clean versus error teardown without screen-control bytes or stale-frame replay.
- Fullscreen preflight tests retain the missing-live-TTY-dimensions, busy-stdout, no-user-setup, no-console-or-terminal-mutation, and retry-after-non-consuming-failure guarantees while separately proving that non-TTY stdout selects the document host.
- Borrowing tests prove Runtime never ends or destroys caller streams and restores only listeners and state it changed.
- Failure tests cover synchronous write throws, callback errors, `EPIPE`, premature output close with and without an `Error`, backpressure, active-input stdin errors, non-fatal stdin EOF, first-cause precedence, failure during clean teardown, and final barrier settlement.
- Acquisition tests prove reverse rollback at each resource boundary, optional raw-mode acquisition, and later inactive-to-active input transitions after stdin has ended.
- Untyped exit tests prove synchronous `TypeError`, continued operation when caught, normal outer error handling when uncaught, and no validation after teardown has started.

### `useStdin`

The public hook returns the exact base `Readable`, capability flag, and per-hook raw-mode setter. Each call owns one independent idempotent hold while Runtime's private reconciliation composes those holds with managed input, suspension, shared streams, and borrowed-stream baseline restoration.

The string host supplies and cleans up its isolated inert input stream. Internal ingress, parser, Kitty negotiation, and paste framing remain inaccessible to JavaScript as well as TypeScript consumers. The former routing topology, mouse pipeline, and rich availability object were removed rather than hidden.

- Public and packed-consumer types expose exactly the three accepted fields with `stdin: Readable`; no internal context field is reachable.
- Two `useStdin()` calls, active `useInput()`, and two apps sharing a stream cannot release one another's raw ownership. Repeated booleans are idempotent and scope cleanup releases forgotten holds.
- Raw-only use does not attach the Runtime parser, change stream encoding, or negotiate Kitty or bracketed paste. Its direct listener receives what the mounted stream delivers.
- Inline, Fullscreen, non-TTY, externally pre-raw input, suspension, resume, HMR, normal unmount, error teardown, and acquisition or restoration failure preserve the accepted ownership and borrowed-stream contracts.
- `renderToString()` uses only its inert isolated stream, reports no raw support, never observes `process.stdin`, and cleans the stream and hook scope on success or failure.
- Documentation distinguishes the safe normalized `useInput()` path from the intentionally unmanaged composition of direct stream listeners.

### `useFocus`

The existing private per-app controller, unique ownership, rendered-target transaction, and ancestor-visibility invalidation are reusable mechanisms. The pre-decision public experiment was not the target contract: it required a target, accepted `scope`, `disabled`, `tabIndex`, and `autoFocus`, exposed manager and routing behavior, returned booleans from its methods, and resolved an arbitrary component by selecting its first rendered descendant. Those policies and that resolver were not preserved merely because they had tests.

The completed implementation adds the targetless registration path without creating a second controller; changes the public handle to the accepted read-only `Ref` and void operations; removes navigation, restoration, scopes, manager, string lookup, focused-input routing, disabled policy, and automatic focus; and replaces first-descendant selection with the accepted component-root normalization. The private controller remains only for unique ownership and target validity. `useBoxPresence()` is removed rather than becoming a public prerequisite.

- Several targetless and targeted calls in one or several component scopes prove one current identity per app and atomic replacement across both forms.
- Targetless focus survives ancestor `v-show` while its owning scope remains alive, and ends when that scope is disposed.
- Component targets cover direct Box and Text refs, nested single-root custom components, true multi-root Fragments, empty Fragments, Comment roots, direct and ancestor `v-show`, `v-if` removal, valid-to-valid root replacement, detach, unmount, wrong values, and cross-app refs without exposing or selecting a first descendant.
- Targeted focus clears under the accepted boundary rules; reappearance never restores it or the previous owner. An unavailable `focus()` leaves the existing owner untouched and creates no pending request.
- Explicit `onMounted(() => focus.focus())` works for an eligible target without turning a request made while unavailable into pending restoration.
- Input examples prove `isFocused` composes with `useInput({ isActive })` while unrelated broadcast subscriptions remain unaffected.
- Public declarations and Vue 3.4 and 3.5 clean-consumer fixtures distinguish the overloads, expose the exact named types, document target's narrow role, accept inferred custom-component template refs, and expose no manager, VNode, or renderer node.
- Inline TTY, Fullscreen TTY, mounted document rendering, string rendering, suspend/resume, cleanup, mount rollback, and retained disposed-handle tests cover the accepted lifecycle contexts. Mounted-document output remains non-interactive even if its logical focus state is exercised by shared component code.
