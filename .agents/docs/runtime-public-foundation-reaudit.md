# Runtime public foundation re-audit

## Status and authority

This is the implementation and technical evidence record for the public boundary currently present on PR #265. On 2026-07-22 Yunfei reopened that surface for item-by-item review. The [Runtime public API decision ledger](./runtime-public-api-decisions.md) is the authoritative inventory of his stated selections and the Open queue; its unstamped entries still await review and vouch. This record's unstamped retain, remove, completed, and target language describes the previous candidate and is not acceptance. The PR remains unmerged and unreleased.

The goal is not to publish every mechanism already implemented. `@vue-tui/runtime` publishes only facts and operations that require ownership of the terminal, Vue renderer, accepted layout or paint, normalized terminal input, or lifecycle resources. Application policy remains ordinary Vue code or an optional higher layer. No `@vue-tui/use` package is required by this phase.

Earlier vouches do not bypass the item-by-item review when their assumptions changed. In particular, the former accessibility props and transcript path are now removed rather than retained as current or hidden Runtime support; [accessibility-api](./accessibility-api.md) preserves only the historical evidence.

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
const help = renderToString(Help, { columns: 80 });
```

### Boundary decision

- Retain `createApp`, `renderToString`, `Box`, and `Text`. Only Runtime can create the Vue custom renderer, own Yoga nodes, paint terminal cells, sanitize ANSI, and release the tree coherently.
- Retain the exact closed `BoxProps` and `TextProps` contracts already established by Path 0. Their named types let components describe Runtime-validated inputs without copying the grammar.
- Retain `Color` as the shared stable color domain of those primitives. The experimental `AriaRole` and `AriaState` domains were removed with screen-reader presentation.
- Remove `Newline`, `Spacer`, and `useAnimation`; ordinary Text, Box, and Vue timers implement them without Runtime access.
- Keep Transform, Yoga hosts, ANSI runs, and renderer nodes private. No current application justifies a transform API; the screen-reader linearizer was deleted instead of retained privately.

All supported rendering hosts use the same Box/Text visual vocabulary. Inline and Fullscreen paint terminal cells, non-TTY and final-output mounts emit documents, and string rendering returns a document without terminal resources. `renderToString()` accepts only `{ columns?: number }`, defaults to 80, and fails synchronously after cleanup.

## Path 1: layout, viewport, and Box facts

### User problem

The old `useWindowSize()`, `useLayoutSize()`, `useRenderSession()`, `useBoxMetrics()`, and `useElementGeometry()` made ordinary code carry physical-terminal, host-resolution, and paint-fragment details. Most applications need a width, an optional row bound, or one accepted Box fact.

### Runtime primitives

```ts
const width = useLayoutWidth(); // Readonly<Ref<number>>
const viewportHeight = useViewportHeight(); // Readonly<Ref<number>> | null
const size = useBoxSize(boxRef); // Readonly<Ref<{width; height} | null>>
```

- `useLayoutWidth()` is numeric on every host. Runtime alone knows the width actually accepted by root layout; string and widthless stream hosts use 80 unless a document width was supplied.
- `useViewportHeight()` returns a ref only when the render tree has a finite viewport. Inline and Fullscreen TTYs have one; string and unbounded stream documents return `null` once at setup.
- `useBoxSize()` reports the full size of one directly referenced Box after an accepted paint. It returns `null` before acceptance, while hidden or detached, and on string hosts. A clipped Box retains its full accepted size.

Third parties cannot derive accepted layout from Vue refs alone. They can derive responsive layouts and component policy from these three facts without access to Yoga nodes, surface coordinates, clipping fragments, or the render-session graph. General accepted-tree membership is not published as `useBoxPresence()` merely to reconstruct focus outside Runtime; the selected `useFocus(target)` overload keeps its narrower renderer-owned validity check internal.

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

The accepted target keeps an instance open until its first non-empty eligible output, commits that block once, releases the slot subtree through normal Vue unmount lifecycle, and never rewrites accepted history. Ordinary conditional unmount cannot erase accepted bytes, and remount creates a new producer. A true Fullscreen surface throws and restores its resources. The current implementation still consumes an output-free eligible render; that gap is tracked in [TODOs](./todos.md#runtime-public-api-review). Non-TTY, string, exact ordering, hidden-ancestor, and placement semantics remain Open.

## Path 3: normalized input and minimum focus without routing policy

> **Current input target, 2026-07-24:** The branch now uses the vouched nested `TuiInputEvent`, `TuiKey`, and `TuiKeyName` facts, ignores handler results, defaults `exitOnCtrlC` to `false`, and restores `useStdin()` as the complete independently owned low-level escape. The focus paragraphs below record the selected minimum focus target. See the [event decision](./runtime-public-api-decisions.md#useinput-exposes-one-tagged-text-key-and-paste-event-contract), [delivery decision](./runtime-public-api-decisions.md#useinput-is-a-live-broadcast-subscription-without-propagation-results), and [low-level decision](./runtime-public-api-decisions.md#usestdin-remains-a-complete-low-level-input-escape).

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
- Retain `useStdin()` and `UseStdinReturn` with exactly the mounted `Readable`, a raw-mode capability Boolean, and `setRawMode(enabled)`. Each call owns one idempotent hold with Vue scope cleanup, independently of other calls and managed input. Raw-only use does not start the parser, change encoding, or negotiate Kitty or bracketed paste. Direct listeners are caller-owned and have no ordering, deduplication, protocol-filtering, or byte-exact composition guarantee with managed input; non-TTY streams remain observable, and string rendering uses an isolated inert stream.
- Remove public parser phase, byte sequence, source/fidelity, codepoint, base-layout identity, input availability, external forwarding, focus scopes, route decisions, `usePaste()`, and `useRawInput()`.

Retain two explicit `useFocus` overloads in one per-app unique-owner controller. `useFocus()` creates a logical identity whose automatic validity follows its Vue scope; another successful focus acquisition can still replace its ownership. `useFocus(target)` additionally binds that identity's validity to one rendered target and its rendered ancestors. The target is not the identity and supplies no navigation or input route. Hidden or detached targeted focus clears without restoration. Remove the public manager, string lookup, traversal, scopes, modal trapping, focused subscriptions, external forwarding, restoration, and automatic Tab behavior.

Inline and Fullscreen TTY hosts support managed input. A non-controllable or non-TTY stdin remains available as a raw stream, but activating managed input fails before terminal mutation. String rendering provides inert shared services and has no input lifecycle.

## Path 4: editable text and physical caret

Keyboard editing is application composition today: store text and an insertion index in Vue state, update them from `useInput()`, and render the visible marker as Text. A third-party package can implement that without privilege.

Exact physical terminal-caret placement cannot be implemented correctly from the accepted public facts because it needs final glyph mapping, clipping, output origin, focus, and commit timing. The old cell-coordinate `useCursor()` and focus-bound `useCaret()` exposed unstable renderer policy, so both are removed. The internal cursor ownership and restoration mechanism remains. Physical caret placement is explicitly outside this foundation until a real editor proves a smaller semantic Text-position primitive.

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

- `MountOptions` contains exactly `stdout?: Writable`, `stdin?: Readable`, `stderr?: Writable`, `mode`, `patchConsole`, and `exitOnCtrlC`. Omitted streams select the corresponding process streams and omitted mode selects Inline. Explicit Fullscreen requires a TTY stdout with positive terminal dimensions and otherwise throws synchronously before setup or mutation without falling back to Inline. The complete `patchConsole` contract and default-off Ctrl+C convenience are vouched.
- The mode union is expressed on `MountOptions["mode"]` rather than through a separate root alias. There is no presentation union because there is no screen-reader presentation.
- `TuiApp.mount()` validates deterministic options, streams, ownership, and Fullscreen capability before mutation. Such a preflight failure, including busy stdout, throws synchronously without consuming the app. Once acquisition or setup begins, a failure consumes the attempt, throws the original error synchronously, completes rollback, and rejects `waitUntilExit()` with the same object.
- `TuiApp.waitUntilRenderFlush()` is an always-callable app-owner output barrier. It resolves immediately when no work exists before mount or after exit, waits for accepted render and output work while mounted, and waits for already-started teardown output without duplicating the exit result. Component code does not receive it through `useApp()`.
- `TuiApp.waitUntilExit()` resolves `void` after normal teardown, restoration, and accepted output, or rejects with the first fatal `Error` by identity after that same completion point. Later stream and cleanup failures do not replace an earlier real cause, including a genuine `AggregateError`.
- `useApp()` exposes only `exit(error?: Error)`. Exit payloads, `clear()`, and component-level flush are removed.
- `patchConsole` defaults on, accepts `false` as the escape hatch, and uses a normal active-application registration stack around one physical process-console patch. Runtime installs protection before user component execution, releases each registration after that application's Vue cleanup, and forwards intercepted content without filtering it.
- Output cadence, `maxFps`, `onRender`, incremental painting, clipboard transports, and terminal protocol options remain private. Screen-reader booleans and their implementation paths were removed entirely. Direct coordinated stdout/stderr composables and their flow-control result exposed the output scheduler and are removed.

`TuiApp` projects the public keys available from the consumer's installed Vue `App` type, including `config`, `use`, `mixin`, `component`, `directive`, `provide`, `runWithContext`, and `unmount`; Vue 3.5 consumers also receive `onUnmount` while the minimum supported Vue 3.4 surface does not. Runtime excludes every underscore-prefixed private app field and `TuiNode`, redefines `mount`, adds the two barriers, and returns the actual user root instance.

Inline, Fullscreen, errors, signals, job-control suspend/resume, HMR, console output, and raw terminal modes share one resource-ownership teardown. Preflight resolves defaults, protocol state, mode, stdout ownership, and Fullscreen capability before mutation; acquisition reserves stdout, establishes reverse-order rollback, installs observers and console protection, runs setup, validates demanded stdin, and only then acquires terminal and input state and paints. Managed stdin is rechecked when demand later becomes active. Mounted streams remain borrowed and reusable: Runtime never ends or destroys them, removes its listeners, and restores only state it changed. Active stdout/stderr failure and stdin loss during managed demand enter first-cause lifecycle settlement, while input-free stdin EOF remains non-fatal. Inline non-TTY output emits no terminal-management bytes or intermediate dynamic frames, appends accepted Static and coordinated output immediately, writes the current dynamic document once on clean teardown with only a missing non-empty line ending added, and suppresses a stale successful frame on error. `presentation`, `INK_SCREEN_READER`, and internal transcript helpers no longer alter this resolution.

### Public integration subpaths

- `@vue-tui/runtime/devtools` exports only `connectDevtools()`. Runtime must connect its private HMR state, but any Vite integration can call the same structural interface.
- `@vue-tui/runtime/testing` exports `createTestHostBridge()` plus `TestHostBridge`, `TestHostBridgeOptions`, and `TestContentFrame`. The bridge supplies only capabilities a test host cannot reproduce outside Runtime: production input parsing, content-commit observation, deterministic suspension, and the app-owner flush barrier.
- `@vue-tui/testing` and `@vue-tui/vite` consume only these supported subpaths. They have no privileged `/internal` import.
- `/internal` and `/fullscreen` are not package exports. Fullscreen is a mount mode, not a second component or composable universe.

Mounted handoff to `$EDITOR`, `less`, or `fzf` remains deferred. Existing suspend/resume machinery handles process job control, but no real consumer establishes a stable arbitrary-command handoff API.

## Path 6: pointer, scrolling, selection, and clipboard

Keyboard scrolling is public composition: a component exposes `scrollBy()` or an application-owned offset, and `useInput()` decides when to call it. Nested scroll propagation is application policy; a Boolean method result can indicate whether the inner view moved.

Pointer hit testing, capture, drag, arbitrary existing-Text selection, physical selection highlighting, and OSC 52 clipboard ownership require final paint facts or terminal resource ownership. The experimental APIs bundled those facts with application routing and policy, so they are not public. Their sound hit-map, capture, selection, and clipboard mechanisms remain private evidence rather than compatibility commitments.

Applications can implement explicit copy actions with their own selected string and injected clipboard adapter. They cannot implement correct arbitrary painted-Text selection or pointer targeting from this foundation; those capabilities are explicitly outside the minimum deliverable rather than falsely approximated with layout rectangles. `Text.inverse`, `CellPoint`, `ElementTarget`, `/fullscreen`, mouse hooks, selection hooks, clipboard hooks, and `MountOptions.clipboard` are removed.

## Previous candidate public ledger

### Root values and associated named types

| Public API                                                                | Concrete task                                        | Why Runtime must provide it                                          | Third-party alternative                                       | Hosts and absence/lifecycle                                       | Decision                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- |
| `createApp`; `TuiApp`; `MountOptions`; `RenderMode`; `RenderPresentation` | Mount and own a live Vue terminal app                | Creates the renderer and owns terminal resources                     | None can reproduce ownership safely                           | Live Inline, Fullscreen, TTY, and streams; one real mount attempt | Retain                    |
| `renderToString`; `RenderToStringOptions`                                 | Produce one synchronous width-bound document         | Runs the same renderer without live resources                        | A wrapper can call it, not recreate it                        | String only; synchronous cleanup and failure                      | Retain                    |
| `Box`; `BoxProps`; `Color`; `AriaRole`; `AriaState`                       | Layout, paint, clip, hide, and describe regions      | Runtime owns Yoga and terminal cells                                 | Higher components compose Box                                 | Every rendering host; closed validated props                      | Retain                    |
| `Text`; `TextProps`                                                       | Render styled, wrapped, accessible terminal text     | Runtime owns graphemes, ANSI state, and cell width                   | Higher components compose Text                                | Every rendering host; screen-reader substitutes semantics         | Retain                    |
| `useApp`; `UseAppReturn`                                                  | End the current app normally or with an Error        | Runtime owns teardown and error settlement                           | Cannot safely emulate inside a component                      | Live hosts; `exit()` unavailable in string rendering              | Retain, reduced to `exit` |
| `useInput`; `TuiInputEvent`; `TuiKeyName`                                 | Receive normalized text, paste, and finite key facts | Runtime owns byte parsing and terminal input modes                   | Focus/routing composes above it                               | Managed TTY input only; `isActive` owns demand                    | Retain, reduced           |
| `useStdin`; `UseStdinReturn`                                              | Reach the exact mounted raw stream                   | Runtime selects the host stream                                      | Host owner can retain its stream, shared components cannot    | Live and inert string contexts; no semantic guarantees            | Retain escape hatch       |
| `useFocus`; focus return and target types                                 | Select one logical or rendered-bound input owner     | Runtime owns the shared controller and rendered validity transaction | App policy composes `isFocused` with `useInput({ isActive })` | Exact live, string, and non-TTY host semantics remain Open        | Retain, reduced           |
| `useLayoutWidth`                                                          | Read accepted root width                             | Runtime owns layout input and resize acceptance                      | Cannot derive reliably from process stdout                    | Numeric readonly ref on every host                                | Retain                    |
| `useViewportHeight`                                                       | Gate behavior requiring finite visual rows           | Runtime resolves whether a visual viewport exists                    | Cannot infer from layout width or raw rows                    | Ref on visual TTY surfaces, otherwise `null`                      | Retain                    |
| `useBoxSize`; `BoxSize`                                                   | Size one accepted direct Box                         | Runtime owns accepted paint and ref identity                         | Layout guesses are not equivalent                             | Visual paint only; readonly nullable ref                          | Retain                    |
| `useBoxPresence`                                                          | General accepted-tree membership                     | The private fact exists, but focus needs a narrower transaction      | No retained public task justifies the generic boolean         | Current implementation only                                       | Remove                    |

### Subpaths

| Subpath                         | Values                 | Named types                                                   | Decision                                                       |
| ------------------------------- | ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `@vue-tui/runtime/inline`       | `Static`               | None                                                          | Retain; Runtime-only irreversible Inline history               |
| `@vue-tui/runtime/devtools`     | `connectDevtools`      | None                                                          | Retain; narrow replaceable HMR integration seam                |
| `@vue-tui/runtime/testing`      | `createTestHostBridge` | `TestHostBridge`, `TestHostBridgeOptions`, `TestContentFrame` | Retain; narrow third-party-accessible test host seam           |
| `@vue-tui/runtime/package.json` | Package metadata       | None                                                          | Retain standard metadata access                                |
| `@vue-tui/runtime/fullscreen`   | None                   | None                                                          | Remove; mode is selected at mount                              |
| `@vue-tui/runtime/internal`     | None                   | None                                                          | Remove from package exports; repository source remains private |

### Mount options

| Option         | Semantics                                           | Failure and lifecycle                                                         | Decision |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| `stdout`       | Exact output stream owned by this mount             | Invalid/unwritable ownership fails before or during acquisition with rollback | Retain   |
| `stdin`        | Exact input stream used by raw and managed input    | Non-controllable input is fine until managed input is activated               | Retain   |
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

The implementation retains the renderer, Yoga, input parser, output coordinator, terminal resource controllers, hit testing, selection, clipboard, HMR, and suspension mechanisms where they remain useful internally. It changes what packages promise, not every underlying algorithm.

Final local evidence on 2026-07-19 satisfies that gate. `vp run ready` passed formatting, all nine package/example builds, warning-free lint, package and PTY-fixture type checks, a clean Vue 3.4.38 and TypeScript 6.0.3 tarball consumer, Runtime, Testing, Components, integration, PTY, and example suites. The packed Runtime exposes only the root, `/inline`, `/devtools`, `/testing`, and package metadata; it contains no private `internal` entry file, and imports of `/internal` and `/fullscreen` are rejected. Official higher layers and examples have no Runtime-internal imports; repository-only tests use an unpacked private build entry where exact internal symbol identity is required.

The basic-template application also passed the repository's real-PTY visual loop. The initial and incremented PNGs were inspected, `+` changed the counter, `q` exited, the post-exit shell was observed, and terminal attributes before and after the app were identical. The bounded adversarial review found two stale current-facing documentation claims, which were corrected; the same reviewer then passed the package boundary and user-facing surface.

The local evidence above proves that the previous candidate is implemented coherently; it does not prove that its public boundary is accepted or complete. The Runtime foundation remains under review while the decision ledger has Open entries, including whether future caret, pointer, arbitrary Text selection, or terminal clipboard work can be added without redesigning Runtime ownership or data flow.
