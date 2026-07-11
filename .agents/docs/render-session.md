# Readonly render session

> **Status:** completed F1 contract, unstamped. F1.3 selected the public API, F1.4 implemented the private live source, F1.5 completed deterministic-test/string-host authority, F1.6 completed Inline ownership, F1.7 completed lifecycle behavior, and F1.8 published the verified public projection and focused layout hook. No VOUCHED stamp was added.

## Outcome and scope

The runtime owns one authoritative render-session service per mounted application, deterministic test render, or synchronous string-render call. Components read a readonly reactive projection through `useRenderSession()`. They do not reconstruct the environment from mount options, process globals, raw streams, or renderer internals.

The representative before/after result is:

- **Before:** a coding-agent transcript, monitor, or workbench component could not tell whether a Fullscreen request became a fixed viewport, an Inline screen-reader transcript, or a stream fallback. The former `useWindowSize()` also exposed numbers without their surface meaning.
- **After:** the same component reads one internally consistent value containing the requested/effective mode resolution, actual output facts, host, layout dimensions, and semantic structural capabilities. A test asserts the same value without making the component branch on a private testing flag.

This is a facts API, not an operations API. Exit and render-flush operations stay in `useApp()`. Input routing, focus, element geometry, pointer registration, terminal protocol queries, and renderer escape hatches remain owned by their later foundations.

## Public contract

The selected full-facts name is `useRenderSession()`. `useSession()` is too broad for applications that also contain model, agent, database, SSH, or PTY sessions. `useTerminalSession()` is false for non-TTY streams, deterministic tests, and synchronous string rendering. `useRenderSession()` names the shared lifetime without implying a mutable renderer. `useLayoutSize()` is the focused projection for the repeated responsive-layout case; it derives from the same service rather than resolving the environment again.

```ts
import type { Ref } from "vue";

export type RenderMode = "inline" | "fullscreen";

export type RenderModeResolution =
  | {
      readonly requested: "inline";
      readonly effective: "inline";
      readonly fallback: null;
    }
  | {
      readonly requested: "fullscreen";
      readonly effective: "fullscreen";
      readonly fallback: null;
    }
  | {
      readonly requested: "fullscreen";
      readonly effective: "inline";
      readonly fallback: "screen-reader-transcript";
    }
  | {
      readonly requested: RenderMode;
      readonly effective: null;
      readonly fallback: "live-updates-disabled" | "stdout-not-tty" | "terminal-size-unavailable";
    };

export type RenderOutput =
  | {
      readonly destination: "terminal";
      readonly dynamicUpdates: "live";
      readonly presentation: "visual" | "screen-reader";
    }
  | {
      readonly destination: "stream";
      readonly dynamicUpdates: "live" | "at-teardown";
      readonly presentation: "visual" | "screen-reader";
    }
  | {
      readonly destination: "document";
      readonly dynamicUpdates: "none";
      readonly presentation: "visual" | "screen-reader";
    };

export interface RenderSize {
  readonly columns: number;
  readonly rows: number;
}

export interface RenderLayoutSize {
  readonly columns: number;
  readonly rows: number | null;
}

export type RenderSession =
  | {
      readonly host: "live";
      readonly mode: RenderModeResolution;
      readonly output: Exclude<RenderOutput, { readonly destination: "document" }>;
      readonly dimensions: {
        readonly terminal: RenderSize | null;
        readonly layout: RenderLayoutSize;
      };
      readonly capabilities: {
        readonly stableOrigin: boolean;
        readonly elementHitTesting: boolean;
        readonly suspension: boolean;
      };
    }
  | {
      readonly host: "string";
      readonly mode: null;
      readonly output: Extract<RenderOutput, { readonly destination: "document" }>;
      readonly dimensions: {
        readonly terminal: null;
        readonly layout: {
          readonly columns: number;
          readonly rows: null;
        };
      };
      readonly capabilities: {
        readonly stableOrigin: false;
        readonly elementHitTesting: false;
        readonly suspension: false;
      };
    };

export function useRenderSession(): RenderSession;

export interface UseLayoutSizeReturn {
  readonly columns: Readonly<Ref<number>>;
  readonly rows: Readonly<Ref<number | null>>;
}

export function useLayoutSize(): UseLayoutSizeReturn;
```

Every nested field is readonly in the public type, and the runtime returns Vue's readonly projection over one internal reactive object. Property access therefore works directly in setup, computed values, TSX, and templates without `.value`. A write through the public object cannot change internal state; Vue warns in development rather than throwing, so tests assert unchanged state instead of expecting an exception.

The synchronous string host uses `mode: null` because it does not accept a mode request. A live session always contains one normalized requested mode in `mode`; omission has already become an Inline request before the render tree runs. A deterministic test presents the modeled production session to the component, so its public `host` is `"live"`; test-only observation stays on `RenderResult` and cannot make application behavior diverge merely because it is under test.

### Template and TSX use

An SFC reads structured facts directly and uses the focused layout projection when it wants destructurable reactive scalars:

```vue
<script setup lang="ts">
import { Text, useLayoutSize, useRenderSession } from "@vue-tui/runtime";

const session = useRenderSession();
const { columns, rows } = useLayoutSize();
</script>

<template>
  <Text>{{ columns }} columns · {{ rows ?? "unbounded" }} rows</Text>
  <Text v-if="session.mode?.fallback">Fallback: {{ session.mode.fallback }}</Text>
</template>
```

TSX uses `.value` for the focused refs and narrows the string/live session union through `host`:

```tsx
import { defineComponent } from "vue";
import { Text, useLayoutSize, useRenderSession } from "@vue-tui/runtime";

export const EnvironmentSummary = defineComponent(() => {
  const session = useRenderSession();
  const { columns, rows } = useLayoutSize();

  return () => (
    <Text>
      {session.host === "string" ? "document" : (session.mode.effective ?? "no terminal mode")}
      {` · ${columns.value}×${rows.value ?? "unbounded"}`}
      {` · dynamic ${session.output.dynamicUpdates}`}
    </Text>
  );
});
```

Directly destructuring `const { columns } = session.dimensions.layout` would copy a number and lose Vue tracking. `useLayoutSize()` exists specifically to avoid that ordinary trap; it is a projection of the same session service, not a second resolver.

## Why mode resolution is one discriminated value

The allowed mode combinations are finite. Keeping them in one union prevents combinations such as Fullscreen effective with a non-TTY fallback or Inline requested with a screen-reader fallback. The outer `RenderSession` union separately makes a string render with a terminal-mode request or terminal-only capability impossible. The type does not encode the complete cross-product of every output and capability; the single runtime resolver owns those remaining correlations.

Resolution uses this fixed priority:

1. When live output updates are disabled, no terminal mode becomes effective and the fallback is `"live-updates-disabled"`, regardless of whether stdout is a TTY.
2. When live updates are enabled but stdout is not a TTY, no terminal mode becomes effective and the fallback is `"stdout-not-tty"`.
3. When visual live output claims a TTY but no positive columns and rows can be resolved, no terminal mode becomes effective, output becomes final stream output, and the fallback is `"terminal-size-unavailable"`.
4. On a TTY screen-reader path, an Inline request remains effective Inline. A Fullscreen request becomes effective Inline with `"screen-reader-transcript"` because the runtime uses the main screen and never enters the alternate screen. Transcript layout needs a resolved column width but not a fixed row count.
5. On a visual TTY with usable dimensions, the normalized request becomes effective without fallback.

CI is not a fallback reason. CI only changes the default live-update policy; an explicit override still resolves according to the actual output host. Deterministic observation is not a session fact: the internal render observer reports commits to a host such as `@vue-tui/testing` without changing application behavior or manufacturing a capability. The removed `debug` option cannot create a second output path.

## Output and layout semantics

`output` uses three independent axes instead of one name for every writer/presentation combination:

| Field            | Values                              | Meaning                                                                                                                                               |
| ---------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `destination`    | `terminal`, `stream`, or `document` | Whether output owns a live TTY surface, emits bytes without acquiring a terminal surface, or is returned synchronously.                               |
| `dynamicUpdates` | `live`, `at-teardown`, or `none`    | When the dynamic frame is emitted. Static/history bytes may still be emitted immediately under `at-teardown`; only the latest dynamic frame waits.    |
| `presentation`   | `visual` or `screen-reader`         | Which renderer presentation is active. This reports the selected transcript path, not detection of a user's hardware or assistive-technology process. |

The effective mode supplies terminal-surface semantics without another seven-value enum. Terminal plus effective Inline is the main-screen relative live region; terminal plus effective Fullscreen is the fixed alternate-screen viewport; terminal plus screen-reader presentation is the main-screen transcript. Stream plus `at-teardown` is the pinned Ink-like final-output policy, while stream plus live is the explicit visual or transcript updater that may emit ANSI bytes but owns no terminal surface. Document plus none is synchronous string rendering; the public function is visual, while the internal accessibility helper deliberately selects screen-reader presentation.

History and exit behavior follow those combinations. Inline visual or transcript output may become terminal-owned history and remains on normal exit. Fullscreen history stays in application state; exit restores the previous main screen and prints no final frame. Stream bytes belong to the stream, and a document belongs to its caller.

`dimensions.terminal` is the real or deliberately modeled terminal window size. It is `null` for a non-TTY stream and string rendering; a hardcoded `80×24` fallback must not masquerade as a detected terminal. `dimensions.layout` is the root area the renderer actually promises to lay out. `layout.rows: null` means the surface is not row-bounded. A numeric row value is a renderer-enforced bound: exact height for Fullscreen and maximum live-region height for visual Inline. On a live-update surface, both objects update together on an accepted resize or continuation refresh before the next committed layout. A final-output surface retains its mount-time dimensions because it has no runtime resize lifecycle.

The live resolver uses one exact size chain. A positive `stdout.columns`/`stdout.rows` pair is authoritative. If that pair is incomplete, a complete positive pair from the same controlling-terminal probe used by the pinned Ink baseline may replace it; the resolver never splices one stdout field and one probed field into a claimed viewport. Process-global probing runs only for `process.stdout` or `process.stderr`. An arbitrary custom TTY must provide its own complete pair, while a deterministic internal host may supply an explicit modeled probe. A valid partial width can still inform an unbounded layout when no terminal pair is claimed. If no positive layout width exists, layout columns default to 80. The default is a layout choice, never a detected terminal. Visual TTY mode acquisition requires one coherent positive terminal pair; without one it falls back to final stream output as `"terminal-size-unavailable"`. Test and string hosts receive deliberate sizes and never run this live process-global probe.

This distinction follows Ratatui's useful separation between backend terminal size and the current frame render area. `renderToString()` uses the supplied document columns for `useLayoutSize()` and reports `rows: null` without reading the developer's `process.stdout` or registering a process resize listener.

## Capability semantics

Capabilities describe semantic guarantees, not internal data structures or raw environment guesses:

- `stableOrigin` is a known structural fact. It is true only for a fixed Fullscreen viewport. It does not mean mouse input is available.
- `elementHitTesting` is the known structural fact that the renderer currently maintains element rectangles in the same coordinate space as its output. It does not imply raw input, terminal mouse protocol support, capture, or a public pointer operation; F6 combines those independent facts later.
- `suspension` is the known structural fact that the host supports vue-tui's coordinated restore-before-stop and re-establish-after-continue lifecycle. It does not report whether the process happens to be stopped at the instant of a read. F1.7 completed this behavior before the field is exported, so no speculative `unknown` state is needed.

`dimensions` is the only public session field that changes during the current F1 lifecycle. `host`, `mode`, `output`, and the complete `capabilities` object are immutable for one render session. In particular, `elementHitTesting` describes whether this resolved render path maintains a hit map; it is not a live report of whether a particular element is currently measurable.

Suspension support is a host-lifecycle fact, independent of effective mode, output destination, and dynamic-update cadence. A final stream has no output surface to restore, but a supported live host can still release and reacquire raw input and terminal protocols. Production live sessions report support on non-Windows hosts and unavailability on Windows; deterministic modeled live sessions report support so tests can drive the same boundary; string sessions report unavailability.

Raw-input support remains an independent internal resolver input, not an F1.3 public field. Its current TTY marker cannot answer whether an application can safely register input before the first raw-mode acquisition, and publishing it would duplicate `useStdin().isRawModeSupported` with incompatible boolean and tri-state meanings. F3 designs one truthful input-availability and acquisition contract; F1 only ensures output resolution never decides it implicitly.

## Exhaustive host mapping

The following table maps the accepted host matrix to the public facts. `elementHitTesting` and `suspension` use independent host and capability rules; they are not inferred from `output.dynamicUpdates`. In the table, `host-derived` suspension means true on supported non-Windows production hosts and false on Windows. Stdin and raw-input state remains separate inside the resolver for F3.

| Host conditions                                     | `mode` result                                          | Output destination / dynamic updates / presentation | Terminal / layout dimensions                                                            | Stable origin / element hit testing | Suspension   |
| --------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------- | ------------ |
| Live updates disabled, including CI default         | Requested mode → `null`, `live-updates-disabled`       | stream / at-teardown / resolved presentation        | TTY terminal pair when resolved, otherwise `null`; resolved layout columns, rows `null` | false / false                       | host-derived |
| Explicit live visual updates, non-TTY stdout        | Requested mode → `null`, `stdout-not-tty`              | stream / live / visual                              | Terminal `null`; resolved layout columns, rows `null`                                   | false / false                       | host-derived |
| Explicit live screen-reader updates, non-TTY stdout | Requested mode → `null`, `stdout-not-tty`              | stream / live / screen reader                       | Terminal `null`; resolved layout columns, rows `null`                                   | false / false                       | host-derived |
| Live visual TTY without usable terminal dimensions  | Requested mode → `null`, `terminal-size-unavailable`   | stream / at-teardown / visual                       | Terminal `null`; resolved/default layout columns, rows `null`                           | false / false                       | host-derived |
| Live visual TTY, Inline requested                   | Inline → Inline, no fallback                           | terminal / live / visual                            | Current terminal size; identical numeric layout rows enforced as a maximum              | false / false                       | host-derived |
| Live visual TTY, Fullscreen requested               | Fullscreen → Fullscreen, no fallback                   | terminal / live / visual                            | Current terminal size; identical fixed layout size                                      | true / renderer-derived             | host-derived |
| Live screen-reader TTY, Inline requested            | Inline → Inline, no fallback                           | terminal / live / screen reader                     | Terminal pair when known; resolved layout columns, rows `null`                          | false / false                       | host-derived |
| Live screen-reader TTY, Fullscreen requested        | Fullscreen → Inline, `screen-reader-transcript`        | terminal / live / screen reader                     | Terminal pair when known; resolved layout columns, rows `null`                          | false / false                       | host-derived |
| Deterministic test                                  | Same resolution as the production preset being modeled | Same modeled production output                      | Deliberately modeled terminal and layout sizes                                          | Derived from modeled renderer       | true         |
| Public synchronous string                           | `null`                                                 | document / none / visual                            | Terminal `null`; supplied/default columns, rows `null`                                  | false / false                       | false        |
| Internal screen-reader string helper                | `null`                                                 | document / none / screen reader                     | Terminal `null`; supplied/default columns, rows `null`                                  | false / false                       | false        |

Normal output owns these semantics. The internal render observer can inspect structured commits without becoming another host, output surface, or resolver input. Own `debug` keys on live mounts and deterministic render options fail before component setup; unthrottled scheduling remains independently available as `maxFps: 0` where an internal or focused test needs it.

## Reactivity and lifetime

The internal session state is resolved once after mount-option validation and before stream reservation, terminal mutation, or Vue setup. The readonly public projection is provided through typed Vue injection before the root component mounts.

- `useRenderSession()` returns the same object identity throughout one mounted render tree. Calling it without the provided render context throws a clear error.
- In-place component HMR preserves the object. A full application reload tears down the old session and creates a new one.
- Resize changes `dimensions` before the corresponding layout commit. Immutable host, mode, output, and capability fields never change in place.
- External `SIGTSTP` does not rewrite `mode.effective` to `null`: on a supported process host it temporarily releases terminal state, stops the process with `SIGSTOP`, then re-establishes the same resolved surface after `SIGCONT` with fresh dimensions when available or the last coherent size otherwise. The refresh also updates and repaints a live stream even though its layout remains row-unbounded. No JavaScript executes while the process is stopped.
- `renderToString()` provides a temporary string session to the component tree for the duration of the synchronous call, then disposes it without exposing a live handle.
- `@vue-tui/testing` exposes the same readonly session snapshot on `RenderResult`. `unmount()` tears down the app while retaining the restored emulator for assertions; idempotent `dispose()` additionally releases every modeled stream and emulator resource, automatic test cleanup calls the same disposer, and mount failure disposes immediately. Operations that require the emulator or live host fail clearly after disposal, while `lastFrame()`, retained content frames, and session facts remain readonly observations.
- A retained object after component teardown is only a final readonly snapshot and receives no further updates. Operations must never treat possession of the facts object as proof that a session is still mounted.

The first public runtime surface deliberately does not add `app.session`. Current representative applications adapt inside their Vue tree, and adding a live external handle would force mount-before, failed-mount, teardown, and remount semantics without a demonstrated consumer. This is an additive extension if a real bootstrap or embedding scenario needs it. `@vue-tui/testing` is different: assertions necessarily run outside component setup, so its `RenderResult` exposes the same readonly session snapshot as `session`.

## Current API disposition

vue-tui is experimental, so these are direct target dispositions rather than compatibility plans:

| Current API                         | Target disposition               | Reason                                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useApp()`                          | Retain                           | It exposes lifecycle operations (`exit`, render flush), not environment facts. String-host invocation is explicitly unavailable rather than silently no-op.                                                   |
| Former `useWindowSize()`            | Removed                          | `useLayoutSize()` derives readonly refs from session layout dimensions, keeps convenient destructuring reactive, represents unbounded rows as `null`, and never independently detects globals.                |
| Former `useIsScreenReaderEnabled()` | Removed                          | `session.output.presentation` states the active rendering path without presenting screen reader as a third mode or claiming hardware/user detection.                                                          |
| Internal `AppContext` fact fields   | Replace internally               | Streams and operations may remain internal services, but all public session facts must come from one resolver and one reactive state object.                                                                  |
| `useStdin()`                        | Unchanged in F1.3                | F1 does not publish a competing raw-input fact. F3 decides one acquisition/availability contract and this hook's direct target disposition together.                                                          |
| `useStdout()` / `useStderr()`       | Retained; F1.6 refined `write()` | Coordinated TTY writes accept geometry-safe styled lines, redirected/non-TTY output stays byte-exact, and the returned streams remain raw escape hatches. These operations are not copied into session facts. |

`useLayoutSize()` is the one selected convenience projection because responsive layout is already used by first-party code and peers, while scalar destructuring from a reactive session object would lose Vue dependency tracking. Template access auto-unwraps its readonly refs; TSX and setup code use `.value`. Any later projection must likewise derive from the same service and state exactly which semantic facts it returns.

## Testing and string-host contract

`@vue-tui/testing` now uses a finite production-like host contract rather than constructing an implicit environment from renderer booleans. `RenderOptions` combines a finite `TestHost`—requested mode, visual or screen-reader presentation, live or teardown updates, TTY or stream stdout, and TTY or non-TTY stdin—with deliberate positive columns/rows. Unknown fields, impossible values, and removed `liveUpdates` or `debug` render options fail before component setup. Omission models a visual Inline TTY session at 100×100. The same production resolver supplies the component's `host: "live"` session with suspension support; only `RenderResult` identifies deterministic observation.

The test result exposes three different observations:

- `session`: the readonly facts visible to the component;
- content frames: structured `{ dynamic, staticOutput }` renderer commits that retain SGR styling but exclude output-writer lifecycle and screen-update controls;
- emulated terminal screen: an xterm snapshot after applying stdout and stderr bytes, including active buffer, visible rows, normal-buffer scrollback, dimensions, and cursor.

A final-stream test uses the real final-output policy: new Static output is visible immediately and only the latest dynamic frame appears at clean teardown; fatal teardown suppresses that retained success and writes the error to stderr. A Fullscreen test may model effective Fullscreen and its capabilities without writing to the developer's real alternate screen. `terminal.suspend()` releases modeled terminal ownership and `terminal.resume()` refreshes dimensions, re-establishes and repaints the same resolved live-update surface—including a row-unbounded live stream—before input is reacquired; the deterministic control does not stop the JavaScript event loop. On a live-update surface, resizing updates the modeled streams, emulator, authoritative session, and resulting frame in order; a final-output surface retains production's lack of a runtime resize handler even though the test emulator itself can be resized. `unmount()` keeps the restored screen inspectable, idempotent `dispose()` releases every host resource and disables further host operations, and automatic cleanup calls that same disposer; console patching stays disabled so overlapping deterministic renders never mutate process-global console methods. Application code behaves from the modeled production facts and cannot branch on a public test host.

Public `renderToString()` rejects rendering mode and screen-reader presentation at the type level and rejects recognizable JavaScript/`any` passthrough before reading later option fields or mounting Vue. Its session is always string/document/visual with no dynamic updates, uses only the supplied or default columns, has no terminal size or bounded rows, and reports every terminal-only capability unavailable. The internal `renderToStringWithScreenReader()` helper deliberately fixes presentation to screen-reader and provides string/document/screen-reader facts; it rejects legacy presentation flags rather than accepting a hidden selector. Both paths use isolated inert non-TTY stdin/stdout/stderr services, so direct writes are discarded, `useLayoutSize()` reads the document width and nullable row bound from the shared session, and neither renderer reads or subscribes to process streams or terminal probing. `useApp()` remains injectable for shared component setup, but `exit()` throws a clear unavailable-operation error synchronously and `waitUntilRenderFlush()` returns a rejected promise if invoked. Session, streams, event listeners, Vue scope, and Yoga state are disposed on success and error. Neither host silently pretends to operate on a mounted app.

## Rejected alternatives

### Add facts to `useApp()`

Rejected because lifecycle commands and environment state have different responsibilities. A string tree may inject the operation shape for component portability, but invoking an unavailable lifecycle command fails explicitly rather than adding lifecycle state to the facts API.

### Publish the renderer or internal context

Rejected because it exposes mutable screen, mouse, stream, Yoga, scheduler, and controller state. OpenTUI demonstrates the convenience of one injected renderer and the cost: components can mutate screen mode and mouse policy and become coupled to implementation details. vue-tui keeps the one-service mechanism but exposes only its readonly semantic projection.

### Publish many independently resolved hooks

Rejected as the source of contradictory snapshots. Ink's focused hooks remain useful ergonomic evidence, but Ink does not expose its resolved interactive/alternate-screen state, so consumers still infer behavior from raw streams. Any future convenience hook derives from the same session object.

### One exhaustive union for the whole session

Rejected for the public surface. A complete cross-product union can make every impossible combination unrepresentable, but it forces application code to narrow a large value for ordinary responsive layout and replaces the whole object on each resize. The selected shape uses small discriminated values for the coupled facts (`mode` and `output`), an immutable capability snapshot, and structured reactive dimensions.

## Implementation sequence

The selected public shape is implemented behind the runtime boundary before it is exported:

1. F1.4 creates the clean-slate live mount resolver and internal session service; it initially reports visual Inline rows as unbounded until F1.6 changes the renderer contract.
2. F1.5 gives deterministic tests, public `renderToString()`, and the internal screen-reader string helper the same service; it rejects hidden public-option passthrough, replaces implicit test-host construction with finite modeled axes, separates render observation from terminal emulation, and removes `debug`. The implementation and closure gates are complete.
3. F1.6 makes the accepted Inline row bound and history ownership true: `dimensions.layout.rows` is now the enforced maximum for visual Inline, while screen-reader and stream surfaces remain unbounded.
4. F1.7 completed suspension, fatal-error, exit, and restoration behavior represented by the session.
5. F1.8 exported `useRenderSession()` and `useLayoutSize()`, removed the superseded public hooks, migrated repository consumers and documentation, and passed the exhaustive public/type/package/PTY/visual/CI closure gates.

Publishing the live subset after F1.4 was rejected: the same component would receive no truthful session under `renderToString()`, and current Inline would have to claim a row bound it does not enforce. One internal resolver may land incrementally; one public contract ships only when every advertised host agrees.

F1.4 selects `liveUpdates?: boolean` as the public output-cadence override and removes own `interactive` keys synchronously. CI and stdout TTY state choose only its omission default. The resolved live surface, rather than the requested mode or another boolean, now drives alternate-screen entry, fixed viewport layout, transcript fallback, hit-map construction, update cadence, and resize dimensions. The internal service is provided before root setup, has stable identity, replaces dimensions atomically, and stops updating after teardown. F1.5 extended that service to both string presentations and deterministic modeled hosts. F1.8 now exposes the shared readonly projection directly and removes the two narrower hooks instead of maintaining parallel public interpretations.

The live adapter uses a provenance-aware terminal-size probe because `terminal-size@4` hides whether `80×24` was detected or synthesized. A complete positive stdout pair wins; otherwise a complete sourced pair replaces it atomically, and partial fields are never combined across sources into a claimed viewport. Custom streams cannot borrow process-global dimensions. The 80-column layout default never establishes terminal dimensions, and a layout without a coherent terminal row bound reports `rows: null`. A visual TTY without a coherent positive pair becomes final stream output with `terminal-size-unavailable`. Fullscreen plus screen-reader presentation becomes an effective Inline main-screen transcript and acquires neither alternate screen nor targeted mouse. The adapted probe retains the upstream MIT notice in the published runtime tarball.

F1.5 removes the public `debug` mount option directly. Recognizable own keys fail before terminal inspection, and `@vue-tui/testing` rejects the former render option before setup. Deterministic content observation now uses a symbol-keyed internal observer whose presence does not affect surface resolution, output cadence, scheduling, console ownership, or application-visible session facts. This is a clean-slate removal rather than a compatibility alias; the project remains experimental.

Durable F1.5 evidence lives in the testing package's host, observation, emulator, cleanup, disposal, console-isolation, presentation-environment, and public-type tests; the runtime mount-mode and public-type removed-option guards; and the string renderer's host-session, process-isolation, unavailable-operation, error-cleanup, and accessibility integration tests. Focused and full integration, PTY, type, fixture, clean tarball consumer, Inline and Fullscreen visual-controller, terminal-restoration, fresh CI, and independent-review gates passed before F1.6 became Active.

Durable F1.6 evidence lives in runtime writer, cursor, sanitization, layout, transform, screen-reader, resize, clear, coordinated-output, teardown, and deterministic-host tests; real PTY fixtures cover partial rows, bounded overflow, Static and coordinated first writes, resize-abandoned history, repeated clear, and cursor-aware teardown. Full repository, fresh CI, package-content, clean-consumer, Inline and Fullscreen visual-controller, terminal-restoration, and independent-review gates passed before F1.7 became Active.

Durable F1.7 evidence lives in the process-suspension unit tests; focused lifecycle, cleanup-failure, suspension-transaction, alternate-screen, error-race, fatal-output, mouse, paste, Kitty, deterministic-host, and disposal tests; subprocess regressions for `process.exit()` during an initial commit and a teardown final commit; and Inline/Fullscreen real-PTY suspension fixtures. Mount and repaint use nested lifecycle transactions so an ordinary synchronous listener or stream write cannot run teardown or settlement halfway through acquisition or output; re-entrant requests are honored after every owned resource has had its cleanup turn. A non-returning `process.exit()` or signal-exit callback bypasses that deferral, performs immediate synchronous restoration, and skips final user rendering and Vue lifecycle hooks. Fatal stderr is a narrow durability fallback for Inline and transcript surfaces whose rich error was clipped, lost with stdout, or failed during its first physical write, and is the primary durable report after Fullscreen restoration and on final streams. Focused regressions, full `vp run ready`, fresh `CI=true vp run ci`, 158 real-PTY tests, package-content inspection, a clean Vue 3.4/TypeScript 6 runtime-and-testing tarball consumer, image-reviewed Inline and Fullscreen suspend/resume/resize/exit journeys, exact terminal and termios restoration, and independent review passed.

Durable F1.8 evidence lives in the public render-session and layout-size integration tests, exact root-export and named-type guards, SFC and TSX fixtures, Vite HMR identity coverage, deterministic-host session tests, and visual and screen-reader string-render tests. The resize coordinator updates session dimensions, waits for Vue consumers, coalesces newer generations, and performs one authoritative paint; continuation keeps input released until the newest terminal or row-unbounded live-stream geometry has painted. Full `vp run ready` passed with 432 runtime, 67 testing, 19 components, 26 Vite, 1411 integration, 158 real-PTY, and 6 example tests; a fresh `CI=true vp run ci` passed. Package inspection and a clean Vue 3.4.38/TypeScript 6.0.3 consumer proved the exact public exports, strict TSX/SFC declarations, no `/internal` declaration leak, rapid-resize coalescing, and resize-during-continuation ordering. Agent-driven Inline and Fullscreen resize/interaction/exit journeys were image-reviewed, exited with code zero, and exactly restored terminal modes and termios. Independent API, consumer, concurrency, lifecycle, and terminal reviews passed.

## Implementation constraints and evidence

The implementation checkpoints that follow F1.3 must collectively:

1. create one pure resolver whose output drives both runtime behavior and public session facts;
2. validate the accepted `mode` contract before creating the session or mutating the terminal;
3. reject removed `fullscreen`, `alternateScreen`, `interactive`, and `debug` mount fields, keep deterministic observation internal and orthogonal, and prevent raw stream fields from becoming alternate public truth sources;
4. make live, test, and string hosts use deliberate dimensions instead of independently reading process globals;
5. provide the session before Vue setup, replace `useWindowSize()` with the derived `useLayoutSize()`, and remove `useIsScreenReaderEnabled()` from exports, implementation, docs, examples, and type guards;
6. type-check template and TSX consumers of every discriminated branch;
7. test that readonly writes leave state unchanged, plus stable identity, resize, setup misuse, HMR, teardown snapshots, and every host-table row;
8. use real PTY evidence for the effective Inline, Fullscreen, transcript fallback, non-TTY, resize, suspend/resume, and restoration claims;
9. keep content frames and emulated terminal screens separate in `@vue-tui/testing`;
10. verify the packed public surface in a clean consumer and pass `vp run ready` plus a fresh `CI=true vp run ci`.

F1.3 chose the target contract. F1.8 verified that its resolver and every advertised host value agree with actual runtime behavior across all required gates, so F1 is complete. F2 may consume the public facts but owns rendered-target lifetime separately.
