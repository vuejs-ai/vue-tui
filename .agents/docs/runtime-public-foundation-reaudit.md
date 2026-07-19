# Runtime public foundation re-audit

## Status and authority

This is the completed local boundary record for PR #265. The earlier API is experimental evidence, not a compatibility target. The implementation, packed-package boundary, local repository validation, terminal-visible review, and bounded adversarial review now reflect the target below. The PR remains unmerged and unreleased.

The goal is not to publish every mechanism already implemented. `@vue-tui/runtime` publishes only facts and operations that require ownership of the terminal, Vue renderer, accepted layout or paint, normalized terminal input, or lifecycle resources. Application policy remains ordinary Vue code or an optional higher layer. No `@vue-tui/use` package is required by this phase.

Maintainer-vouched behavior that does not conflict with this clean boundary remains in force, including the typed accessibility props, shared-stdin behavior, multiple Inline Static regions, same-stdout mount arbitration, and the acknowledged incidental `TuiNode` appearance through Vue's private `App._container` type. The latter is not supported authoring API.

## User-visible result

The pre-audit branch asked users to understand Runtime's parser, routing, paint geometry, focus manager, pointer pipeline, clipboard transports, output coordinator, scheduler controls, and lifecycle result channel. The resulting foundation asks users to understand only four things:

1. Render with `Box`, `Text`, `createApp()`, or `renderToString()`.
2. Read the few layout facts Runtime alone knows.
3. Subscribe to normalized input and keep focus or routing policy in Vue state.
4. Let the app owner mount, flush, exit, and await restoration.

```ts
import { createApp } from "@vue-tui/runtime";

const app = createApp(App);
app.mount({ mode: "fullscreen", presentation: "visual" });
await app.waitUntilExit();
```

```ts
import { shallowRef } from "vue";
import { Box, useBoxPresence, useInput } from "@vue-tui/runtime";

const panel = shallowRef<InstanceType<typeof Box> | null>(null);
const present = useBoxPresence(panel);

useInput((event) => {
  if (!present.value) return;
  routeThroughApplicationFocus(event);
});
```

There is no public focus manager, renderer session, physical caret, pointer route, selection service, clipboard transport, arbitrary stdout transaction, frame-rate knob, `/fullscreen`, or `/internal` package entry.

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
- Retain `Color`, `AriaRole`, and `AriaState` because they are shared stable domains of those primitives.
- Remove `Newline`, `Spacer`, and `useAnimation`; ordinary Text, Box, and Vue timers implement them without Runtime access.
- Keep Transform, screen-reader linearization, Yoga hosts, ANSI runs, and renderer nodes private. No current application justifies a transform API.

All four rendering hosts use the same accepted Box/Text layout vocabulary. Visual Inline and Fullscreen paint terminal cells, visual non-TTY and final-output mounts emit documents, screen-reader presentation emits a linear transcript, and string rendering returns a visual document without terminal resources. `renderToString()` accepts only `{ columns?: number }`, defaults to 80, and fails synchronously after cleanup.

## Path 1: layout, viewport, and Box facts

### User problem

The old `useWindowSize()`, `useLayoutSize()`, `useRenderSession()`, `useBoxMetrics()`, and `useElementGeometry()` made ordinary code carry physical-terminal, host-resolution, and paint-fragment details. Most applications need a width, an optional row bound, or one accepted Box fact.

### Runtime primitives

```ts
const width = useLayoutWidth(); // Readonly<Ref<number>>
const viewportHeight = useViewportHeight(); // Readonly<Ref<number>> | null
const size = useBoxSize(boxRef); // Readonly<Ref<{width; height} | null>>
const present = useBoxPresence(boxRef); // Readonly<Ref<boolean>>
```

- `useLayoutWidth()` is numeric on every host. Runtime alone knows the width actually accepted by root layout; string and widthless stream hosts use 80 unless a document width was supplied.
- `useViewportHeight()` returns a ref only when the render tree has a finite visual viewport. Inline and Fullscreen visual TTYs have one; string, screen-reader, and unbounded stream documents return `null` once at setup.
- `useBoxSize()` reports the full size of one directly referenced Box after an accepted visual paint. It returns `null` before acceptance, while hidden or detached, and on string or screen-reader hosts. A clipped Box retains its full accepted size.
- `useBoxPresence()` reports whether a direct Box belongs to the last accepted live tree, independently of zero size or clipping. It supplies the renderer-only fact needed by public focus composition.

Third parties cannot derive accepted layout or tree presence from Vue refs alone. They can derive responsive layouts, focus membership, and component policy from these four facts without access to Yoga nodes, surface coordinates, clipping fragments, or the render-session graph. Those broader mechanisms remain private.

## Path 2: Inline history

### User task and resulting code

An Inline application needs completed records to become immutable terminal history while a live tail continues updating:

```vue
<Static v-for="entry in completed" :key="entry.id">
  <CompletedEntry :entry="entry" />
</Static>
<Text>{{ liveTail }}</Text>
```

`Static` remains the only value on `@vue-tui/runtime/inline`. Runtime alone can separate irreversible history bytes from the replaceable live region and preserve ordering across commits. It has an ordinary Vue slot and no collection-specific props or named types; iteration, keys, filtering, and layout are application policy.

Static works in Inline TTY, non-TTY/final output, screen-reader transcript, and string documents. Effective visual Fullscreen rejects it because alternate-screen history is not durable. Hidden instances stay open until present; accepted instances never replay. The renderer's static channel remains internal.

## Path 3: normalized input without interaction policy

### User task

Applications need facts such as inserted text, a complete paste, Enter, Escape, arrows, or Ctrl+C without parsing terminal byte protocols:

```ts
useInput(
  (event) => {
    if (event.kind === "text") query.value += event.text;
    if (event.kind === "key" && event.name === "escape") closeOverlay();
    if (event.kind === "key" && event.character === "c" && event.ctrl) {
      cancelCurrentOperation();
      return { preventDefault: true };
    }
  },
  { isActive: () => overlayOpen.value },
);
```

### Boundary decision

- Retain `useInput(handler, { isActive? })`, `TuiInputEvent`, and `TuiKeyName`. Runtime must decode UTF-8, bracketed paste, escape ambiguity, and negotiated key protocols and must acquire and restore raw mode around actual demand.
- A handler normally returns nothing. The exact `{ preventDefault: true }` result suppresses only Runtime's delayed Ctrl+C exit default for that event. It does not stop sibling subscriptions, report application handling, or control external forwarding.
- Retain `useStdin()` and `UseStdinReturn` as the raw escape hatch to the exact stream selected by the host. Raw bytes have no Runtime event semantics and are not guaranteed to compose with managed input.
- Remove parser phase, byte sequence, source/fidelity, release/repeat, codepoint, input availability, external forwarding, focus, scopes, and route decisions from the public surface.

Focus identity, traversal, modal trapping, and propagation can be implemented in a public higher layer with Vue providers/state, one `useInput()` subscription, and `useBoxPresence()` for rendered membership. Inline and Fullscreen TTY hosts support managed input. A non-controllable or non-TTY stdin remains available as a raw stream, but activating managed input fails before terminal mutation. String rendering provides inert shared services and has no input lifecycle.

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
  presentation: "visual",
  stdout,
  stdin,
  stderr,
  patchConsole: true,
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

- `MountOptions` contains exactly `stdout`, `stdin`, `stderr`, `mode`, `presentation`, and `patchConsole`.
- `RenderMode` is `"inline" | "fullscreen"`; `RenderPresentation` is `"visual" | "screen-reader"`.
- `TuiApp.mount()` validates the requested host before mutation. One app has one real mount attempt; a busy-stdout arbitration no-op does not consume it.
- `TuiApp.waitUntilRenderFlush()` is an app-owner barrier available only while mounted. Component code does not receive it through `useApp()`.
- `TuiApp.waitUntilExit()` resolves `void` after normal restoration, rejects with the first application `Error`, and reports otherwise-hidden cleanup failures on a normal exit with `AggregateError`.
- `useApp()` exposes only `exit(error?: Error)`. Exit payloads, `clear()`, and component-level flush are removed.
- `patchConsole` remains because only Runtime can serialize console output around a live frame. A module-level owner stack prevents one app from removing another app's console sink.
- Output cadence, `maxFps`, `onRender`, incremental painting, screen-reader booleans, clipboard transports, and terminal protocol options remain private. Direct coordinated stdout/stderr composables and their flow-control result exposed the output scheduler and are removed.

The inherited Vue app surface (`config`, `use`, `mixin`, `component`, `directive`, `provide`, `runWithContext`, `onUnmount`, and `unmount`) remains Vue's contract. Runtime redefines only `mount` and adds the two barriers. The vouched incidental host type on Vue's underscore field is unsupported.

Inline, Fullscreen, errors, signals, job-control suspend/resume, HMR, console output, and raw terminal modes share one resource-ownership teardown. An explicit `presentation: "visual"` overrides the screen-reader environment variable. Default live output follows whether stdout is a TTY rather than whether the process happens to run in CI. A non-TTY mount produces final stream output and does not pretend it acquired a visual terminal surface.

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

## Exhaustive retained public ledger

### Root values and associated named types

| Public API                                                                | Concrete task                                        | Why Runtime must provide it                        | Third-party alternative                                    | Hosts and absence/lifecycle                                       | Decision                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- |
| `createApp`; `TuiApp`; `MountOptions`; `RenderMode`; `RenderPresentation` | Mount and own a live Vue terminal app                | Creates the renderer and owns terminal resources   | None can reproduce ownership safely                        | Live Inline, Fullscreen, TTY, and streams; one real mount attempt | Retain                    |
| `renderToString`; `RenderToStringOptions`                                 | Produce one synchronous width-bound document         | Runs the same renderer without live resources      | A wrapper can call it, not recreate it                     | String only; synchronous cleanup and failure                      | Retain                    |
| `Box`; `BoxProps`; `Color`; `AriaRole`; `AriaState`                       | Layout, paint, clip, hide, and describe regions      | Runtime owns Yoga and terminal cells               | Higher components compose Box                              | Every rendering host; closed validated props                      | Retain                    |
| `Text`; `TextProps`                                                       | Render styled, wrapped, accessible terminal text     | Runtime owns graphemes, ANSI state, and cell width | Higher components compose Text                             | Every rendering host; screen-reader substitutes semantics         | Retain                    |
| `useApp`; `UseAppReturn`                                                  | End the current app normally or with an Error        | Runtime owns teardown and error settlement         | Cannot safely emulate inside a component                   | Live hosts; `exit()` unavailable in string rendering              | Retain, reduced to `exit` |
| `useInput`; `TuiInputEvent`; `TuiKeyName`                                 | Receive normalized text, paste, and finite key facts | Runtime owns byte parsing and terminal input modes | Focus/routing composes above it                            | Managed TTY input only; `isActive` owns demand                    | Retain, reduced           |
| `useStdin`; `UseStdinReturn`                                              | Reach the exact mounted raw stream                   | Runtime selects the host stream                    | Host owner can retain its stream, shared components cannot | Live and inert string contexts; no semantic guarantees            | Retain escape hatch       |
| `useLayoutWidth`                                                          | Read accepted root width                             | Runtime owns layout input and resize acceptance    | Cannot derive reliably from process stdout                 | Numeric readonly ref on every host                                | Retain                    |
| `useViewportHeight`                                                       | Gate behavior requiring finite visual rows           | Runtime resolves whether a visual viewport exists  | Cannot infer from layout width or raw rows                 | Ref on visual TTY surfaces, otherwise `null`                      | Retain                    |
| `useBoxSize`; `BoxSize`                                                   | Size one accepted direct Box                         | Runtime owns accepted paint and ref identity       | Layout guesses are not equivalent                          | Visual paint only; readonly nullable ref                          | Retain                    |
| `useBoxPresence`                                                          | Know whether one Box is in the accepted live tree    | Runtime owns accepted tree membership              | Size cannot distinguish every host/state                   | Live hosts; false before acceptance/after detach                  | Retain                    |

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
| `patchConsole` | Opt in or out of Runtime-coordinated console output | Defaults true; multiple apps have independent sink lifetimes                  | Retain   |

### App methods

| Method                           | Semantics                                                                       | Decision                                         |
| -------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| `mount(options?)`                | Validate, acquire, render, and return the Vue component instance                | Retain with minimum options                      |
| `unmount()`                      | Synchronously start idempotent teardown                                         | Retain inherited Vue method                      |
| `waitUntilRenderFlush()`         | While mounted, await current Vue, console, renderer, and output work            | Retain on host-owned app handle only             |
| `waitUntilExit()`                | Await complete restoration; resolve void or reject with the authoritative Error | Retain                                           |
| Vue app methods listed in Path 5 | Plugins, DI, registration, context, and unmount hooks                           | Retain unchanged as Vue composition              |
| `clear()`                        | Destructively reset a mounted surface                                           | Remove; choose Fullscreen or clear outside mount |

## Evidence and completion gate

The implementation retains the renderer, Yoga, input parser, output coordinator, terminal resource controllers, hit testing, selection, clipboard, HMR, and suspension mechanisms where they remain useful internally. It changes what packages promise, not every underlying algorithm.

Final local evidence on 2026-07-19 satisfies that gate. `vp run ready` passed formatting, all nine package/example builds, warning-free lint, package and PTY-fixture type checks, a clean Vue 3.4.38 and TypeScript 6.0.3 tarball consumer, Runtime, Testing, Components, integration, PTY, and example suites. The packed Runtime exposes only the root, `/inline`, `/devtools`, `/testing`, and package metadata; it contains no private `internal` entry file, and imports of `/internal` and `/fullscreen` are rejected. Official higher layers and examples have no Runtime-internal imports; repository-only tests use an unpacked private build entry where exact internal symbol identity is required.

The basic-template application also passed the repository's real-PTY visual loop. The initial and incremented PNGs were inspected, `+` changed the counter, `q` exited, the post-exit shell was observed, and terminal attributes before and after the app were identical. The bounded adversarial review found two stale current-facing documentation claims, which were corrected; the same reviewer then passed the package boundary and user-facing surface.

The foundation is complete only for the supported capabilities above. Remaining work should be application behavior, components, and optional public-only utilities. A future physical caret, pointer, arbitrary Text selection, or terminal clipboard feature must first prove a smaller Runtime-only primitive and can be added without invalidating this surface.
