# Readonly render session

> **Status:** completed F1.3 public-API proposal, unstamped. This record selects one target readonly session shape and maps it to every accepted host class. It does not claim that the public API, the clean-slate mount surface, or the remaining F1 runtime behavior is implemented.

## Outcome and scope

The runtime will own one authoritative render-session service per mounted application, deterministic test render, or synchronous string-render call. Components read a readonly reactive projection through `useRenderSession()`. They do not reconstruct the environment from mount options, process globals, raw streams, or renderer internals.

The representative before/after result is:

- **Before:** a coding-agent transcript, monitor, or workbench component cannot tell whether a Fullscreen request became a fixed viewport, an Inline screen-reader transcript, or a stream fallback. `useWindowSize()` can also disagree with the dimensions actually used by `renderToString()`.
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

CI is not a fallback reason. CI only changes the default live-update policy; an explicit override still resolves according to the actual output host. `debug` is also not a session fact: it is a diagnostic observation mechanism and must not make application components change product behavior or manufacture a capability.

## Output and layout semantics

`output` uses three independent axes instead of one name for every writer/presentation combination:

| Field            | Values                              | Meaning                                                                                                                                               |
| ---------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `destination`    | `terminal`, `stream`, or `document` | Whether output owns a live TTY surface, emits bytes without acquiring a terminal surface, or is returned synchronously.                               |
| `dynamicUpdates` | `live`, `at-teardown`, or `none`    | When the dynamic frame is emitted. Static/history bytes may still be emitted immediately under `at-teardown`; only the latest dynamic frame waits.    |
| `presentation`   | `visual` or `screen-reader`         | Which renderer presentation is active. This reports the selected transcript path, not detection of a user's hardware or assistive-technology process. |

The effective mode supplies terminal-surface semantics without another seven-value enum. Terminal plus effective Inline is the main-screen relative live region; terminal plus effective Fullscreen is the fixed alternate-screen viewport; terminal plus screen-reader presentation is the main-screen transcript. Stream plus `at-teardown` is the pinned Ink-like final-output policy, while stream plus live is the explicit visual or transcript updater that may emit ANSI bytes but owns no terminal surface. Document plus none is synchronous string rendering; the public function is visual, while the internal accessibility helper deliberately selects screen-reader presentation.

History and exit behavior follow those combinations. Inline visual or transcript output may become terminal-owned history and remains on normal exit. Fullscreen history stays in application state; exit restores the previous main screen and prints no final frame. Stream bytes belong to the stream, and a document belongs to its caller.

`dimensions.terminal` is the real or deliberately modeled terminal window size. It is `null` for a non-TTY stream and string rendering; a hardcoded `80×24` fallback must not masquerade as a detected terminal. `dimensions.layout` is the root area the renderer actually promises to lay out. `layout.rows: null` means the surface is not row-bounded. A numeric row value is a renderer-enforced bound: exact height for Fullscreen, maximum live-region height for the target Inline renderer. Both objects update together on an accepted resize before the next committed layout.

The live resolver uses one exact size chain. A positive `stdout.columns`/`stdout.rows` pair is authoritative. If either is missing, it tries the same controlling-terminal probe used by the pinned Ink baseline. A successful positive pair may establish terminal dimensions when stdout claims TTY; otherwise only a positive probed column value supplies layout width. If no positive layout width exists, layout columns default to 80. The default is a layout choice, never a detected terminal. Visual TTY mode acquisition requires a positive terminal pair; without one it falls back to final stream output as `"terminal-size-unavailable"`. Test and string hosts receive deliberate sizes and never run this live process-global probe.

This distinction follows Ratatui's useful separation between backend terminal size and the current frame render area. It also removes the current `renderToString()` defect in which layout uses the supplied columns while `useWindowSize()` reads the developer's real `process.stdout` and may register a real resize listener.

## Capability semantics

Capabilities describe semantic guarantees, not internal data structures or raw environment guesses:

- `stableOrigin` is a known structural fact. It is true only for a fixed Fullscreen viewport. It does not mean mouse input is available.
- `elementHitTesting` is the known structural fact that the renderer currently maintains element rectangles in the same coordinate space as its output. It does not imply raw input, terminal mouse protocol support, capture, or a public pointer operation; F6 combines those independent facts later.
- `suspension` is the known structural fact that the host supports vue-tui's coordinated restore-before-stop and re-establish-after-continue lifecycle. It does not report whether the process happens to be stopped at the instant of a read. F1.7 completes this behavior before the field is exported, so no speculative `unknown` state is needed.

`dimensions` and renderer-owned hit-testing state are reactive where their underlying facts can change; `host`, `mode`, `output`, and suspension support stay immutable for one render session.

Raw-input support remains an independent internal resolver input, not an F1.3 public field. Its current TTY marker cannot answer whether an application can safely register input before the first raw-mode acquisition, and publishing it would duplicate `useStdin().isRawModeSupported` with incompatible boolean and tri-state meanings. F3 designs one truthful input-availability and acquisition contract; F1 only ensures output resolution never decides it implicitly.

## Exhaustive host mapping

The following table maps the accepted host matrix to the public facts. `elementHitTesting` and `suspension` use independent host and capability rules; they are not inferred from `output.dynamicUpdates`. Stdin and raw-input state remains separate inside the resolver for F3.

| Host conditions                                     | `mode` result                                          | Output destination / dynamic updates / presentation | Terminal / layout dimensions                                                            | Stable origin / element hit testing |
| --------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------- |
| Live updates disabled, including CI default         | Requested mode → `null`, `live-updates-disabled`       | stream / at-teardown / resolved presentation        | TTY terminal pair when resolved, otherwise `null`; resolved layout columns, rows `null` | false / false                       |
| Explicit live visual updates, non-TTY stdout        | Requested mode → `null`, `stdout-not-tty`              | stream / live / visual                              | Terminal `null`; resolved layout columns, rows `null`                                   | false / false                       |
| Explicit live screen-reader updates, non-TTY stdout | Requested mode → `null`, `stdout-not-tty`              | stream / live / screen reader                       | Terminal `null`; resolved layout columns, rows `null`                                   | false / false                       |
| Live visual TTY without usable terminal dimensions  | Requested mode → `null`, `terminal-size-unavailable`   | stream / at-teardown / visual                       | Terminal `null`; resolved/default layout columns, rows `null`                           | false / false                       |
| Live visual TTY, Inline requested                   | Inline → Inline, no fallback                           | terminal / live / visual                            | Current terminal size; layout rows `null` until F1.6, then bounded                      | false / renderer-derived            |
| Live visual TTY, Fullscreen requested               | Fullscreen → Fullscreen, no fallback                   | terminal / live / visual                            | Current terminal size; identical fixed layout size                                      | true / renderer-derived             |
| Live screen-reader TTY, Inline requested            | Inline → Inline, no fallback                           | terminal / live / screen reader                     | Terminal pair when known; resolved layout columns, rows `null`                          | false / false                       |
| Live screen-reader TTY, Fullscreen requested        | Fullscreen → Inline, `screen-reader-transcript`        | terminal / live / screen reader                     | Terminal pair when known; resolved layout columns, rows `null`                          | false / false                       |
| Deterministic test                                  | Same resolution as the production preset being modeled | Same modeled production output                      | Deliberately modeled terminal and layout sizes                                          | Derived from modeled renderer       |
| Public synchronous string                           | `null`                                                 | document / none / visual                            | Terminal `null`; supplied/default columns, rows `null`                                  | false / false                       |
| Internal screen-reader string helper                | `null`                                                 | document / none / screen reader                     | Terminal `null`; supplied/default columns, rows `null`                                  | false / false                       |

Normal `debug: false` output owns these semantics. A diagnostic frame observer can inspect commits without becoming another host or output surface. If the existing public `debug` path cannot preserve this contract, its target disposition must be resolved during the mount implementation rather than exposing the discrepancy as application state.

## Reactivity and lifetime

The internal session state is resolved once after mount-option validation and before stream reservation, terminal mutation, or Vue setup. The readonly public projection is provided through typed Vue injection before the root component mounts.

- `useRenderSession()` returns the same object identity throughout one mounted render tree. Calling it without the provided render context throws a clear error.
- In-place component HMR preserves the object. A full application reload tears down the old session and creates a new one.
- Resize changes `dimensions` before the corresponding layout commit. Renderer-owned hit-testing state may change with the render path. Immutable mode, output, and suspension fields never change in place.
- External `SIGTSTP` does not rewrite `mode.effective` to `null`: it temporarily releases terminal state, then re-establishes the same resolved surface after `SIGCONT` and refreshes dimensions. No JavaScript executes while the process is stopped.
- `renderToString()` provides a temporary string session to the component tree for the duration of the synchronous call, then disposes it without exposing a live handle.
- A retained object after component teardown is only a final readonly snapshot and receives no further updates. Operations must never treat possession of the facts object as proof that a session is still mounted.

The first public runtime surface deliberately does not add `app.session`. Current representative applications adapt inside their Vue tree, and adding a live external handle would force mount-before, failed-mount, teardown, and remount semantics without a demonstrated consumer. This is an additive extension if a real bootstrap or embedding scenario needs it. `@vue-tui/testing` is different: assertions necessarily run outside component setup, so its `RenderResult` exposes the same readonly session snapshot as `session`.

## Current API disposition

vue-tui is experimental, so these are direct target dispositions rather than compatibility plans:

| Current API                       | Target disposition | Reason                                                                                                                                                      |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useApp()`                        | Retain             | It exposes lifecycle operations (`exit`, render flush), not environment facts. String-host invocation is explicitly unavailable rather than silently no-op. |
| `useWindowSize()`                 | Replace            | `useLayoutSize()` derives readonly refs from session layout dimensions, keeps convenient destructuring reactive, and never independently detects globals.   |
| `useIsScreenReaderEnabled()`      | Remove             | `session.output.presentation` states the active rendering path without presenting screen reader as a third mode or claiming hardware/user detection.        |
| Internal `AppContext` fact fields | Replace internally | Streams and operations may remain internal services, but all public session facts must come from one resolver and one reactive state object.                |
| `useStdin()`                      | Unchanged in F1.3  | F1 does not publish a competing raw-input fact. F3 decides one acquisition/availability contract and this hook's direct target disposition together.        |
| `useStdout()` / `useStderr()`     | Unchanged in F1.3  | Low-level stream operations are not copied into the facts object. Their final escape-hatch disposition is separate from session resolution.                 |

`useLayoutSize()` is the one selected convenience projection because responsive layout is already used by first-party code and peers, while scalar destructuring from a reactive session object would lose Vue dependency tracking. Template access auto-unwraps its readonly refs; TSX and setup code use `.value`. Any later projection must likewise derive from the same service and state exactly which semantic facts it returns.

## Testing and string-host contract

`@vue-tui/testing` must stop constructing an implicit environment through `debug: true`, `interactive`, and fake streams that always claim TTY. Its target host control uses a finite production-like preset: TTY or stream output, requested mode, visual or screen-reader presentation, final or explicitly live stream updates where applicable, input-host class, and deliberate dimensions. The resolver rejects impossible combinations instead of accepting an arbitrary bag of internal booleans. Omission models a visual Inline TTY session. The component receives the modeled production `host: "live"`; only `RenderResult` identifies the deterministic test observation environment.

The test result exposes three different observations:

- `session`: the readonly facts visible to the component;
- content frames: renderer output before terminal-control emulation;
- emulated terminal screen: the final cell surface after applying output bytes.

A final-stream test uses the real final-output policy, not `debug: true` plus `interactive: false`. A Fullscreen test may model effective Fullscreen and its capabilities without writing to the developer's real alternate screen. Application code behaves from the modeled production facts and cannot branch on a public test host.

Public `renderToString()` continues to reject rendering mode and screen-reader presentation at the type level. Its session is always string/document/visual with no dynamic updates, uses only the supplied or default columns, has no terminal size or bounded rows, and reports every terminal-only capability unavailable. JavaScript or `any` passing the recognizable internal `isScreenReaderEnabled` option to the public function fails synchronously rather than activating a hidden host. The unsupported `renderToStringWithScreenReader()` internal helper remains deliberate and provides string/document/screen-reader facts to its component tree. Neither path reads or subscribes to `process.stdin`, `process.stdout`, or `terminal-size` through a no-op context. `useApp()` remains injectable so a shared component may create callbacks during setup, but `exit()` throws a clear unavailable-operation error synchronously and `waitUntilRenderFlush()` returns a rejected promise if invoked in a string render. Neither silently pretends to operate on a mounted app. F1.5 implements these direct target behaviors and migrates the existing accessibility tests to the shared session service.

## Rejected alternatives

### Add facts to `useApp()`

Rejected because lifecycle commands and environment state have different responsibilities. A string tree may inject the operation shape for component portability, but invoking an unavailable lifecycle command fails explicitly rather than adding lifecycle state to the facts API.

### Publish the renderer or internal context

Rejected because it exposes mutable screen, mouse, stream, Yoga, scheduler, and controller state. OpenTUI demonstrates the convenience of one injected renderer and the cost: components can mutate screen mode and mouse policy and become coupled to implementation details. vue-tui keeps the one-service mechanism but exposes only its readonly semantic projection.

### Publish many independently resolved hooks

Rejected as the source of contradictory snapshots. Ink's focused hooks remain useful ergonomic evidence, but Ink does not expose its resolved interactive/alternate-screen state, so consumers still infer behavior from raw streams. Any future convenience hook derives from the same session object.

### One exhaustive union for the whole session

Rejected for the public surface. A complete cross-product union can make every impossible combination unrepresentable, but it forces application code to narrow a large value for ordinary responsive layout and replaces the whole object on each resize or capability update. The selected shape uses small discriminated values for the coupled facts (`mode` and `output`) and structured reactive fields for independent facts.

## Implementation sequence

The selected public shape is implemented behind the runtime boundary before it is exported:

1. F1.4 creates the clean-slate live mount resolver and internal session service. Current Inline honestly reports unbounded layout rows until its renderer contract changes.
2. F1.5 gives deterministic tests, public `renderToString()`, and the internal screen-reader string helper the same service; it rejects hidden public-option passthrough and replaces implicit debug/fake-stream host construction.
3. F1.6 makes the accepted Inline row bound and history ownership true, after which `dimensions.layout.rows` changes from `null` to the enforced maximum.
4. F1.7 completes suspension, fatal-error, exit, and restoration behavior represented by the session.
5. F1.8 exports `useRenderSession()` and `useLayoutSize()`, replaces or removes superseded public hooks, and runs the exhaustive public/type/package/PTY/CI closure gates.

Publishing the live subset after F1.4 was rejected: the same component would receive no truthful session under `renderToString()`, and current Inline would have to claim a row bound it does not enforce. One internal resolver may land incrementally; one public contract ships only when every advertised host agrees.

## Implementation constraints and evidence

The implementation checkpoints that follow F1.3 must collectively:

1. create one pure resolver whose output drives both runtime behavior and public session facts;
2. validate the accepted `mode` contract before creating the session or mutating the terminal;
3. prevent old `fullscreen`, `interactive`, `debug`, and raw stream fields from becoming alternate public truth sources;
4. make live, test, and string hosts use deliberate dimensions instead of independently reading process globals;
5. provide the session before Vue setup, replace `useWindowSize()` with the derived `useLayoutSize()`, and remove `useIsScreenReaderEnabled()` from exports, implementation, docs, examples, and type guards;
6. type-check template and TSX consumers of every discriminated branch;
7. test that readonly writes leave state unchanged, plus stable identity, resize, setup misuse, HMR, teardown snapshots, and every host-table row;
8. use real PTY evidence for the effective Inline, Fullscreen, transcript fallback, non-TTY, resize, suspend/resume, and restoration claims;
9. keep content frames and emulated terminal screens separate in `@vue-tui/testing`;
10. verify the packed public surface in a clean consumer and pass `vp run ready` plus a fresh `CI=true vp run ci`.

F1.3 chooses the target contract only. The public export must not ship until its resolver and every advertised host value agree with actual runtime behavior.
