import Yoga from "yoga-layout";
import {
  type Component,
  type ComponentPublicInstance,
  type App as VueApp,
  defineComponent,
  h,
  nextTick,
  onErrorCaptured,
  shallowRef,
} from "vue";
import { createRenderer } from "vue";
import { writeSync as fsWriteSync } from "node:fs";
import isInCi from "is-in-ci";
import { onExit } from "signal-exit";
import patchConsoleFn from "patch-console";
import ansiEscapes from "ansi-escapes";
import wrapAnsi from "wrap-ansi";
import {
  getSharedStdinIngress,
  type SharedStdinIngress,
  type SharedStdinSubscription,
} from "./io/stdin-ingress.ts";
import type { NormalizedInputFact } from "./io/normalized-input.ts";
import {
  captureInternalInputRoutePlan,
  dispatchInternalInput,
  type InternalInputRouteCandidate,
} from "./io/input-route-policy.ts";
import {
  createInternalInputRoutingRuntime,
  type InternalInputRoutingDemandLease,
  type InternalInputTopologySnapshot,
} from "./io/input-route-runtime.ts";
import {
  classifyLiveInputAvailability,
  createInputAvailabilityRef,
} from "./io/input-availability.ts";
import {
  createKittyKeyboardController,
  type KittyKeyboardOptions,
  type StartKittyQueryResponseDetection,
} from "./io/kitty-keyboard.ts";
import { createRoot, type TuiRoot, type TuiNode } from "./host/nodes.ts";
import { calculateLayoutWithContentGuards } from "./host/layout-guards.ts";
import { attachYoga, detachYoga } from "./host/yoga.ts";
import { buildNodeOps } from "./host/node-ops.ts";
import { createCommitScheduler } from "./scheduler.ts";
import { createAnimationScheduler } from "./animation-scheduler.ts";
import { acquireRuntimeResource, changeRuntimeResource } from "./resource-tracker.ts";
import { paint } from "./paint/paint.ts";
import { renderScreenReaderOutput } from "./paint/screen-reader.ts";
import { sanitizeAnsiMultiline } from "./paint/sanitize-ansi.ts";
import {
  findStatics,
  prepareStaticOutput,
  type PreparedStaticOutput,
} from "./paint/static-channel.ts";
import { createFrameWriter } from "./io/frame-writer.ts";
import {
  createOutputCoordinator,
  type CoordinatedWriteResult,
  type OutputCoordinator,
} from "./io/output-coordinator.ts";
import { hideCursorEscape, nextLineEscape } from "./io/cursor-helpers.ts";
import { INTERNAL_RENDER_OBSERVER, type InternalRenderObserver } from "./io/render-observer.ts";
import { bsu, esu, shouldSynchronize } from "./io/write-synchronized.ts";
import {
  createFullscreenMouseController,
  type FullscreenMouseController,
  type FullscreenMouseInputSnapshot,
  type PreparedMouseFrame,
} from "./mouse/controller.ts";
import { setFullscreenMouseController } from "./mouse/context.ts";
import {
  INTERNAL_TEST_INPUT_HOST,
  createInternalTestMouseFact,
  type InternalTestInputHost,
  type InternalTestMouseEvent,
} from "./io/test-input-host.ts";
import {
  AppContextKey,
  StdinContextKey,
  AnimationSchedulerKey,
  type AppContext,
  type SgrMouseMode,
  type StdinContext,
} from "./context.ts";
import {
  InternalRenderSessionKey,
  createLiveRenderSessionService,
  needsTerminalSizeProbe,
  normalizeRequestedMode,
  resolveLiveDimensions,
  resolveLiveSurface,
  validateLiveUpdates,
  type InternalRenderSessionService,
  type ResolvedLiveDimensions,
  type RenderMode,
} from "./render-session.ts";
import {
  INTERNAL_TERMINAL_SIZE_PROBE,
  probeControllingTerminalSize,
  type TerminalSizeProbe,
  type TerminalSizeProbeResult,
} from "./terminal-size-probe.ts";
import {
  devState,
  DevStateKey,
  isDevConnected,
  notifyDevExit,
  registerDevApp,
  resetDevState,
  unregisterDevApp,
} from "./hmr.ts";
import { createDevOverlayWrapper } from "./overlay.ts";
import { createRenderedTargetController, setRenderedTargetController } from "./rendered-target.ts";
import {
  createInternalGeometryService,
  setInternalGeometryService,
  type InternalGeometryPaintFrame,
} from "./geometry/geometry-service.ts";
import {
  createInternalFocusController,
  type InternalFocusController,
} from "./focus/focus-controller.ts";
import { InternalFocusControllerKey } from "./focus/focus-context.ts";
import {
  createInternalCaretController,
  type InternalCaretController,
  type InternalPreparedCaretFrame,
} from "./caret/caret-controller.ts";
import { InternalCaretControllerKey } from "./caret/caret-context.ts";
import {
  ErrorOverview,
  formatErrorForStderr,
  isErrorInput,
  messageForNonError,
} from "./components/error-overview.ts";
import {
  INTERNAL_SUSPENSION_HOST,
  processSuspensionHost,
  type SuspensionHost,
} from "./process-suspension.ts";
import {
  createInternalClipboardService,
  normalizeClipboardTransport,
  type ClipboardTransport,
  type InternalClipboardService,
} from "./clipboard/clipboard-service.ts";
import { InternalClipboardServiceKey } from "./clipboard/context.ts";
import {
  createInternalTextSelectionController,
  type InternalTextSelectionController,
} from "./selection/selection-controller.ts";
import { InternalTextSelectionControllerKey } from "./selection/context.ts";
import type { InternalSelectionPaintFrame } from "./selection/selection-paint.ts";

export interface MountOptions {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
  /**
   * Select the terminal screen model requested by this application.
   * Omission requests Inline. A host that cannot acquire a live terminal
   * surface still produces stream output without pretending the mode became
   * effective.
   *
   * @default 'inline'
   */
  mode?: RenderMode;
  /**
   * Override whether the dynamic output region updates while the app is
   * mounted. This is an output policy, not a statement about stdin or logical
   * interaction support.
   *
   * By default, live updates are disabled in CI and when stdout is not a TTY.
   * Setting this to true may emit ANSI update bytes to a non-TTY stream, but it
   * cannot acquire a terminal screen mode there.
   *
   * @default true outside CI when stdout is a TTY; false otherwise
   */
  liveUpdates?: boolean;
  /**
   * Patch `console.*` methods to route output through the TUI frame
   * coordinator (writeToStdout / writeToStderr) so that console.log
   * calls don't corrupt the rendered UI.
   *
   * @default true
   */
  patchConsole?: boolean;
  /**
   * Callback invoked after each render commit with timing information.
   */
  onRender?: (info: { renderTime: number }) => void;
  /**
   * Maximum frames per second. Controls the render-throttle window
   * (`ceil(1000 / maxFps)` ms) that throttles both the commit scheduler and
   * the useAnimation tick coalescing. Defaults to 30 (≈34ms), matching Ink.
   *
   * Ignored in screen-reader mode and when non-positive (commits are immediate).
   * @default 30
   */
  maxFps?: number;
  /**
   * Enable screen reader mode. When enabled, the commit scheduler bypasses
   * throttling (immediate commits) so every frame is flushed without delay.
   *
   * @default true when `process.env["INK_SCREEN_READER"] === "true"`, otherwise false
   */
  isScreenReaderEnabled?: boolean;
  /**
   * Enable relative line-diffing for Inline rendering. Fullscreen instead
   * replaces changed rows through automatic absolute cursor addressing after
   * a valid baseline, independently of this option; lifecycle and uncertain
   * output boundaries still repaint its complete fixed viewport.
   *
   * @default false
   */
  incrementalRendering?: boolean;
  /**
   * Configure kitty keyboard protocol support for enhanced keyboard input.
   * Enables additional modifiers (super, hyper, capsLock, numLock) and
   * disambiguated key events in terminals that support the protocol.
   *
   * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
   */
  kittyKeyboard?: KittyKeyboardOptions;
  /**
   * Configure the one clipboard transport owned by this mounted application.
   * OSC 52 can report only that a request was written; a custom transport may
   * report a confirmed copy.
   */
  clipboard?: ClipboardTransport;
}

// Extends `App<TuiNode>` (the renderer's real app type) so `TuiApp` inherits Vue's full app
// surface — `use`/`component`/`provide`/`config`/… — for free.
//
// This DOES surface the internal `TuiNode` host-node type in the published `.d.ts`: Vue's
// `App<HostElement>` uses the generic only in `mount(rootContainer: HostElement)` (which we
// `Omit`+redefine) and the internal `_container: HostElement | null`, so `TuiNode` rides out
// on `_container`. That is KNOWN AND ACCEPTED — not a big deal: `_container` is a Vue-internal
// field consumers never touch, so the exposure is purely cosmetic (zero functional/usability
// impact), and a type-only surface isn't held to strict SemVer, so it imposes no real public
// contract. Hiding it (`App<unknown>`, or a `Pick<App, …>` allowlist) was considered and
// deliberately skipped: it's ceremony for a cosmetic gain on a pre-1.0 library. Please don't
// re-flag this. See .agents/docs/api-contract.md.
export interface TuiApp extends Omit<VueApp<TuiNode>, "mount"> {
  mount(options?: MountOptions): ComponentPublicInstance;
  waitUntilExit(): Promise<unknown>;
  waitUntilRenderFlush(): Promise<void>;
  clear(): void;
}

type RootProps = Record<string, unknown>;

const FULLSCREEN_STATIC_ERROR =
  "[vue-tui] <Static> cannot render on an effective visual Fullscreen surface. Use Inline mode for terminal history, or keep history in application state (for example, ScrollBox).";
// Screen-reader Inline can remain live without a coherent terminal row count.
// A large relative move is clamped by terminal emulators at the bottom margin,
// giving resize recovery a truthful bottom boundary without inventing 24 rows.
const TERMINAL_BOTTOM_CLAMP_ROWS = 9999;

function hasRawInputCapability(stdin: NodeJS.ReadStream): boolean {
  return classifyLiveInputAvailability(stdin).status === "available";
}

function supportsTerminalMouse(): boolean {
  return process.env["TERM"] !== "dumb";
}

// Module-level registry: maps each NodeJS.WriteStream to the one live TuiApp
// that owns its renderer. Mirrors Ink's WeakMap<NodeJS.WriteStream, Ink> in
// instances.ts. Keyed weakly so closed/GC'd streams don't leak memory.
// Only the app that successfully wired a renderer (mountedAsOwner=true) owns
// the entry and removes it on teardown; a "no-op" second mount never touches it.
const liveInstances = new WeakMap<NodeJS.WriteStream, TuiApp>();

// `isErrorInput` (the cross-realm Error brand check) now lives in
// ./components/error-overview.ts, co-located with messageForNonError and shared
// with render-to-string.ts so the classification is a single source of truth.

type MaybeWritableStream = NodeJS.WriteStream & {
  writable?: boolean;
  writableEnded?: boolean;
  destroyed?: boolean;
  writableLength?: number;
  _writableState?: unknown;
};

function getWritableStreamState(stdout: MaybeWritableStream): {
  canWriteToStdout: boolean;
  hasWritableState: boolean;
} {
  return {
    canWriteToStdout: !stdout.destroyed && !stdout.writableEnded && (stdout.writable ?? true),
    hasWritableState: stdout._writableState !== undefined || stdout.writableLength !== undefined,
  };
}

const expectedManagedInputUnavailableError = Symbol("expected-managed-input-unavailable");

function createManagedInputUnavailableError(message: string, expectedAtMount: boolean): Error {
  const error = new Error(message);
  if (expectedAtMount) {
    Object.defineProperty(error, expectedManagedInputUnavailableError, { value: true });
  }
  return error;
}

function isExpectedManagedInputUnavailableError(error: Error): boolean {
  return (
    (error as Error & { [expectedManagedInputUnavailableError]?: boolean })[
      expectedManagedInputUnavailableError
    ] === true
  );
}

export function createApp(root: Component, rootProps?: RootProps | null): TuiApp {
  // exit promise — created at createApp time so waitUntilExit() works even
  // before mount (it just hangs until mount + exit).
  let exitResolve!: (result?: unknown) => void;
  let exitReject!: (e: Error) => void;
  const exitPromise = new Promise<unknown>((res, rej) => {
    exitResolve = res;
    exitReject = rej;
  });
  exitPromise.catch(() => {});

  // Exit-with-error function, wired after mount sets up appContext.
  // Used by the error boundary to route errors through exit().
  let exitWithError: (e: Error) => void = () => {};

  // Record-exit-error bridge, wired alongside exitWithError after mount. The
  // error boundary calls this SYNCHRONOUSLY (before the deferred exitWithError)
  // to set pendingExitError up front, so a racing unmount() that runs
  // resolveExit() before the deferred exit rejects with the thrown error instead
  // of resolving clean (BUG #2). Mirrors exitWithError's after-mount indirection
  // because pendingExitError/exitInitiated/teardownStarted are all in this scope.
  let recordExitError: (e: Error, silent?: boolean) => void = () => {};

  // First-call-wins guard for exit() (Ink parity G33). Ink's handleAppExit
  // returns early on `isUnmounted || isUnmounting`, so the FIRST exit() call
  // captures the value/error and initiates teardown while any subsequent
  // exit() is a complete no-op. This flag mirrors that guard: it is set
  // synchronously by the first exit() so a re-entrant exit() (e.g. fired from
  // inside an unmount-time write callback or a later Vue tick) cannot overwrite
  // the recorded value or re-resolve the exit promise with a later value.
  let exitInitiated = false;

  let mountedRoot: TuiRoot | null = null;
  let mountedWriter: ReturnType<typeof createFrameWriter> | null = null;
  let mountedStdinController: StdinController | null = null;
  let mountedAppContext: AppContext | null = null;
  let mountedResizeHandler: (() => void) | null = null;
  let releaseMountedResizeListener: (() => void) | null = null;
  let mountedResizeRefresh: Promise<void> | null = null;
  let mountedExitListener: (() => void) | null = null;
  let releaseMountedExitListener: (() => void) | null = null;
  // signal-exit unsubscribe fn (Ink parity G18). Registered at interactive
  // mount so SIGINT/SIGTERM/SIGHUP route to teardown(); called in teardown()
  // to remove the handler so it can't leak or double-run.
  let mountedUnsubscribeExit: (() => void) | null = null;
  let mountedBeforeExitHandler: (() => void) | null = null;
  let releaseMountedBeforeExitListener: (() => void) | null = null;
  let mountedUnsubscribeSuspension: (() => void) | null = null;
  let mountedDynamicUpdatesLive = true;
  let mountedRenderSession: InternalRenderSessionService | null = null;
  let mountedRenderedTargets: ReturnType<typeof createRenderedTargetController> | null = null;
  let mountedGeometry: ReturnType<typeof createInternalGeometryService> | null = null;
  let mountedMouseController: FullscreenMouseController | null = null;
  let mountedTestInputHostDetach: (() => void) | null = null;
  let mountedFocusController: InternalFocusController | null = null;
  let mountedCaretController: InternalCaretController | null = null;
  let mountedClipboard: InternalClipboardService | null = null;
  let mountedTextSelection: InternalTextSelectionController | null = null;
  let mountedBoundaryErrorsAreDurable = false;
  // Dev-only: the teardown registered with the HMR bridge so a full reload
  // (entry edit Vite can't hot-accept) unmounts THIS app before the runner
  // re-imports the entry. Held per-app so teardown() can unregister exactly its
  // own registration. null in production / when the dev integration is off.
  let mountedDevTeardown: (() => void) | null = null;
  let mountedGetLastOutput: (() => string) | null = null;
  let mountedNeedsTerminalLineAdvance: (() => boolean) | null = null;
  let mountedRestoreConsole: (() => void) | null = null;
  let mountedScheduler: ReturnType<typeof createCommitScheduler> | null = null;
  let mountedOutputCoordinator: OutputCoordinator | null = null;
  let mountedAnimationScheduler: ReturnType<typeof createAnimationScheduler> | null = null;
  let mountedCommit: (() => CoordinatedWriteResult) | null = null;
  let mountedCreateOutputStateRollback: (() => () => void) | null = null;
  let mountedAlternateScreen = false;
  let mountedFullscreenCursorHidden = false;
  let mountedClear: (() => void) | null = null;
  let mountedKittyController: ReturnType<typeof createKittyKeyboardController> | null = null;
  let mountedEmergencyKittyController: ReturnType<typeof createKittyKeyboardController> | null =
    null;
  let mountedEmergencyStdinController: StdinController | null = null;
  let mountedSynchronizedOutputReleases: Set<() => void> | null = null;
  let mountedAbandonPendingTerminalOutput:
    | ((options?: { readonly physicalStateUncertain?: boolean }) => void)
    | null = null;
  let mountedTerminalReconcile: Promise<void> | null = null;
  // True once Vue's original mount has begun. Pre-Vue terminal setup failures
  // still need our teardown, but calling Vue unmount before mount begins emits
  // an internal "app is not mounted" warning to the user's stderr.
  let vueMountStarted = false;
  // Tracks whether this app currently owns the liveInstances entry for its
  // stdout — set when a mount() actually wires a renderer, cleared when
  // teardown() evicts the entry. A mount() that hits the instance-reuse guard
  // wires nothing and leaves this (and all other mounted* state) untouched:
  // whether unmount()/teardown() have real work to do is derived from the
  // actually-wired state, never from a sticky "was ever guarded" flag (audit
  // e18 — a sticky flag let one guarded call disable teardown of a mount the
  // app DID wire).
  let mountedAsOwner = false;

  function setAlternateScreenOwned(owned: boolean): void {
    if (mountedAlternateScreen === owned) return;
    mountedAlternateScreen = owned;
    changeRuntimeResource("surfaceLeases", owned ? 1 : -1);
  }

  function setFullscreenCursorHidden(hidden: boolean): void {
    if (mountedFullscreenCursorHidden === hidden) return;
    mountedFullscreenCursorHidden = hidden;
    changeRuntimeResource("cursorLeases", hidden ? 1 : -1);
  }

  function acquireSynchronizedOutputLease(): () => void {
    const releaseResource = acquireRuntimeResource("synchronizedOutputLeases");
    const releases = mountedSynchronizedOutputReleases;
    let active = true;
    const release = (): void => {
      if (!active) return;
      active = false;
      releases?.delete(release);
      releaseResource();
    };
    releases?.add(release);
    return release;
  }

  function closeOutstandingSynchronizedOutput(): void {
    const releases = mountedSynchronizedOutputReleases;
    if (!releases || releases.size === 0) return;
    const appContext = mountedAppContext;
    if (appContext) writeBestEffort(appContext.stdout, esu, true);
    for (const release of releases) release();
  }

  function trackProcessListenerCleanup(cleanup: () => void): () => void {
    const release = acquireRuntimeResource("processListeners");
    let active = true;
    return () => {
      if (!active) return;
      cleanup();
      active = false;
      release();
    };
  }

  // The renderer's onCommit closure is wired at createApp time but only does
  // real work after mount swaps in scheduler.schedule. One renderer per app
  // even though it's not used until mount.
  let scheduledCommit: () => void = () => {};

  // Pending exit state — stored so resolveExit() can flush stdout before
  // settling the exit promise.
  let pendingExitError: unknown = undefined;
  let pendingExitResult: unknown = undefined;
  let pendingExitErrorIsSilent = false;
  let pendingExitErrorWasRendered = false;
  let pendingBoundaryError: Error | undefined;
  let pendingBoundaryFrameReady: Error | undefined;
  let pendingBoundaryFrameWriteFailed = false;
  let pendingFatalReport: string | null = null;
  let settlementStarted = false;

  function resolveExit() {
    if (settlementStarted) return;
    // A custom stream or renderer callback may synchronously call unmount()
    // from inside a terminal acquisition/repaint. Settling here would let the
    // exit promise resolve before the surrounding write has finished and before
    // the terminal has been restored. Record the request; the outermost
    // lifecycle transaction flushes it after teardown completes.
    if (lifecycleTransactionDepth > 0 || (teardownStarted && !teardownCompleted)) {
      pendingSettlement = true;
      return;
    }
    settlementStarted = true;
    // Nothing wired: this app never mounted a renderer (every mount() either
    // never happened or hit the instance-reuse guard, which wires nothing).
    // Settle the exit promise directly without any write-barrier so no stream
    // — in particular a guarded stream's owner — is ever touched. Apps that
    // DID wire a renderer always have mountedAppContext set, so a guarded
    // call can never reroute their exit settling away from the real stream.
    if (!mountedAppContext) {
      if (isErrorInput(pendingExitError)) {
        exitReject(pendingExitError);
      } else {
        exitResolve(pendingExitResult);
      }
      return;
    }
    const appContext = mountedAppContext;

    const stdout = (appContext?.stdout ?? process.stdout) as MaybeWritableStream;

    const finish = () => {
      if (isErrorInput(pendingExitError)) {
        exitReject(pendingExitError);
      } else {
        exitResolve(pendingExitResult);
      }
    };

    const report = pendingFatalReport;
    pendingFatalReport = null;
    void (async () => {
      try {
        if (!report || !appContext) {
          await writeOutputBarrier(stdout);
          return;
        }

        const stderr = appContext.stderr as MaybeWritableStream;
        // With distinct streams, first drain stdout restoration, then emit
        // stderr so a durable Fullscreen error cannot race ahead of leaving the
        // alternate screen. A shared stream needs only the report callback.
        if (stderr !== stdout) await writeOutputBarrier(stdout);
        await writeOutputBarrier(stderr, report);
      } finally {
        finish();
      }
    })();
  }

  async function writeOutputBarrier(stream: MaybeWritableStream, data = ""): Promise<void> {
    const { canWriteToStdout, hasWritableState } = getWritableStreamState(stream);
    if (!canWriteToStdout) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return;
    }

    const coordinator = mountedOutputCoordinator;
    if (!coordinator) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        try {
          if (hasWritableState) stream.write(data, done);
          else stream.write(data);
          if (!hasWritableState) setImmediate(done);
        } catch {
          setImmediate(done);
        }
      });
      return;
    }

    for (;;) {
      try {
        await coordinator.waitForIdle();
      } catch {
        // The failed remainder has already entered the fatal lifecycle path.
      }

      let resolveCallback!: () => void;
      const callback = new Promise<void>((resolve) => {
        resolveCallback = resolve;
      });
      let bodyRan = false;
      let result: CoordinatedWriteResult;
      try {
        result = coordinator.run(() => {
          bodyRan = true;
          coordinator.write(stream, data, hasWritableState ? resolveCallback : undefined);
        });
      } catch {
        setImmediate(resolveCallback);
        await callback;
        return;
      }
      if (result.status === "blocked") continue;
      if (!bodyRan) continue;
      if (!hasWritableState) setImmediate(resolveCallback);
      await callback;
      if (!result.writable) {
        try {
          await result.ready;
        } catch {
          // Exit settlement remains best-effort after a stream failure.
        }
      }
      return;
    }
  }

  function writeBestEffort(stream: NodeJS.WriteStream, data: string, sync = false): boolean {
    if (!getWritableStreamState(stream as MaybeWritableStream).canWriteToStdout) return false;
    try {
      if (sync) {
        // Signal-exit path (G18, Finding A): signal-exit re-raises the signal
        // IMMEDIATELY after this callback returns (`{alwaysLast:false}`), so a
        // bare async `stream.write()` can leave the restore bytes (show-cursor,
        // leave-alt-screen, disable-kitty) buffered and unflushed when the
        // process dies — the terminal stays corrupted. A synchronous fd write
        // guarantees the bytes hit the fd before the re-raise. Restore output is
        // tiny and this only runs on the rare abrupt-exit path. Fall back to fd
        // 1 (stdout) when the stream has no numeric fd (e.g. some wrapped TTYs).
        // The base WriteStream type doesn't declare `fd`; tty/fs streams do.
        // Never guess fd 1 for an arbitrary custom stream: deterministic hosts
        // and embedders may deliberately model a TTY without targeting the
        // process terminal.
        const streamFd = (stream as { fd?: number }).fd;
        if (typeof streamFd === "number") {
          fsWriteSync(streamFd, data);
        } else if (stream === process.stdout) {
          fsWriteSync(1, data);
        } else if (stream === process.stderr) {
          fsWriteSync(2, data);
        } else {
          stream.write(data);
        }
      } else if (mountedOutputCoordinator) {
        const result = mountedOutputCoordinator.continue(() => {
          mountedOutputCoordinator?.write(stream, data);
        });
        if (result.status === "blocked") return false;
      } else {
        stream.write(data);
      }
      return true;
    } catch {
      // Stream may already be destroyed during shutdown, or the fd may be
      // unwritable; restore is best-effort.
      return false;
    }
  }

  let teardownStarted = false;
  let teardownCompleted = false;
  let teardownExecutionStarted = false;
  let lifecycleTransactionDepth = 0;
  let pendingTeardown = false;
  let pendingTeardownSync = false;
  let pendingSettlement = false;
  let flushingDeferredLifecycle = false;
  let emergencyTerminalRestoreStarted = false;
  let teardownOutputWaitStarted = false;
  let teardownFinalCommitCompleted = false;

  function performEmergencyTerminalRestore(): void {
    if (emergencyTerminalRestoreStarted) return;
    emergencyTerminalRestoreStarted = true;
    mountedOutputCoordinator?.abort(
      new Error("Output transaction was interrupted by emergency terminal restoration."),
    );
    mountedAbandonPendingTerminalOutput?.();
    const runBestEffort = (operation: () => void): void => {
      try {
        operation();
      } catch {
        // A non-returning exit leaves no later retry opportunity. Continue with
        // every independent terminal resource even when one release fails.
      }
    };
    const appContext = mountedAppContext;

    closeOutstandingSynchronizedOutput();

    runBestEffort(() => mountedScheduler?.cancel());
    if (mountedMouseController) {
      const mouseController = mountedMouseController;
      mountedMouseController = null;
      setFullscreenMouseController(appContext!, null);
      runBestEffort(() => mouseController.beginSilentTeardown());
      runBestEffort(() => mouseController.dispose());
    }
    if (mountedTestInputHostDetach) {
      const detachTestInputHost = mountedTestInputHostDetach;
      mountedTestInputHostDetach = null;
      runBestEffort(detachTestInputHost);
    }
    const emergencyKittyController = mountedKittyController ?? mountedEmergencyKittyController;
    mountedKittyController = null;
    mountedEmergencyKittyController = null;
    if (emergencyKittyController) {
      runBestEffort(() => emergencyKittyController.dispose(true));
    }
    const emergencyStdinController = mountedStdinController ?? mountedEmergencyStdinController;
    mountedStdinController = null;
    mountedEmergencyStdinController = null;
    if (emergencyStdinController) {
      runBestEffort(() => emergencyStdinController.dispose(true));
    }

    if (mountedWriter && mountedDynamicUpdatesLive && appContext) {
      const writer = mountedWriter;
      const returnToBottom = writer.getCursorReturnToBottom();
      if (returnToBottom !== "") writeBestEffort(appContext.stdout, returnToBottom, true);
      if (mountedNeedsTerminalLineAdvance?.()) {
        writeBestEffort(appContext.stdout, nextLineEscape, true);
      }
      if (writer.isCursorHidden()) writeBestEffort(appContext.stdout, "\x1b[?25h", true);
      writer.reset({ cursorDirty: false, cursorHidden: false });
    }
    if (mountedAlternateScreen && appContext) {
      if (writeBestEffort(appContext.stdout, ansiEscapes.exitAlternativeScreen, true)) {
        setAlternateScreenOwned(false);
      }
    }
    if (mountedFullscreenCursorHidden && appContext) {
      if (writeBestEffort(appContext.stdout, "\x1b[?25h", true)) {
        setFullscreenCursorHidden(false);
      }
    }
  }

  function flushDeferredLifecycle(): void {
    if (lifecycleTransactionDepth > 0 || flushingDeferredLifecycle) return;
    flushingDeferredLifecycle = true;
    try {
      while (lifecycleTransactionDepth === 0) {
        if (pendingTeardown && teardownStarted && !teardownCompleted) {
          const sync = pendingTeardownSync;
          pendingTeardown = false;
          pendingTeardownSync = false;
          performTeardown(sync, false);
          continue;
        }

        if (pendingSettlement && (!teardownStarted || teardownCompleted)) {
          pendingSettlement = false;
          resolveExit();
          continue;
        }

        break;
      }
    } finally {
      flushingDeferredLifecycle = false;
    }
  }

  function enterLifecycleTransaction(): () => void {
    lifecycleTransactionDepth++;
    changeRuntimeResource("lifecycleTransactions", 1);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      lifecycleTransactionDepth--;
      changeRuntimeResource("lifecycleTransactions", -1);
      if (lifecycleTransactionDepth === 0) flushDeferredLifecycle();
    };
  }

  function runLifecycleTransaction<T>(operation: () => T): T {
    const leave = enterLifecycleTransaction();
    try {
      return operation();
    } finally {
      leave();
    }
  }

  // `sync` is set only when teardown is driven by the signal-exit callback
  // (G18, Finding A). On that path the restore escapes must be written
  // synchronously (fs.writeSync) so they reach the fd before signal-exit
  // re-raises the signal. The normal unmount()/exit() path keeps async writes.
  function teardown(sync = false, immediateTermination = false) {
    // Nothing wired: this app never mounted a renderer (never mounted, or
    // every mount() hit the instance-reuse guard, which wires nothing), so
    // teardown is a complete no-op — do not touch any stream or another
    // app's WeakMap entry. Derived from actual wired state, NOT a sticky
    // "was ever guarded" flag: a guarded mount() call is inert for that call
    // only and must never disable teardown of a mount this app DID wire
    // (double-fire on its own live stdout, a later mount on a free stdout,
    // or merely targeting another app's busy stream — audit e18).
    if (!mountedAppContext) return;
    if (teardownStarted) {
      // A later abrupt-exit request upgrades a deferred normal cleanup to the
      // synchronous restore path. Cleanup itself still runs exactly once.
      if (!teardownCompleted && sync) pendingTeardownSync = true;
      if (immediateTermination && teardownExecutionStarted && !teardownCompleted) {
        // process.exit() and terminating signals do not return to the active
        // teardown stack. Release the terminal-owning subset right now; the
        // interrupted normal cleanup cannot reach its later restore steps.
        performEmergencyTerminalRestore();
        return;
      }
      if (immediateTermination && !teardownCompleted && !teardownExecutionStarted) {
        const effectiveSync = sync || pendingTeardownSync;
        pendingTeardown = false;
        pendingTeardownSync = false;
        performTeardown(effectiveSync, true);
      }
      return;
    }
    teardownStarted = true;

    if (lifecycleTransactionDepth > 0 && !immediateTermination) {
      pendingTeardown = true;
      pendingTeardownSync ||= sync;
      return;
    }

    performTeardown(sync, immediateTermination);
  }

  function performTeardown(sync = false, immediateTermination = false) {
    if (teardownCompleted || teardownExecutionStarted) return;
    if (!mountedAppContext) {
      teardownCompleted = true;
      return;
    }
    const coordinator = mountedOutputCoordinator;
    if (sync || immediateTermination) {
      coordinator?.abort(new Error("Output transaction was interrupted by synchronous teardown."));
      mountedAbandonPendingTerminalOutput?.();
    }

    const waitForCoordinator = (): void => {
      if (!coordinator || teardownOutputWaitStarted) return;
      teardownOutputWaitStarted = true;
      void coordinator.waitForIdle().then(
        () => {
          teardownOutputWaitStarted = false;
          if (!teardownCompleted && !teardownExecutionStarted) {
            const effectiveSync = pendingTeardownSync;
            pendingTeardownSync = false;
            performTeardown(effectiveSync, false);
          }
        },
        () => {
          teardownOutputWaitStarted = false;
          if (!teardownCompleted && !teardownExecutionStarted) performTeardown(false, false);
        },
      );
    };

    // Freeze new work before waiting for an accepted transaction. The component
    // tree remains mounted so one final commit can still read the newest state.
    scheduledCommit = () => {};
    mountedScheduler?.cancel();
    mountedClear = null;
    if (!sync && !immediateTermination && coordinator?.isBlocked()) {
      waitForCoordinator();
      return;
    }

    const stdout = mountedAppContext.stdout;
    const stdoutWritable = getWritableStreamState(stdout as MaybeWritableStream).canWriteToStdout;
    if (
      !sync &&
      !immediateTermination &&
      !teardownFinalCommitCompleted &&
      !pendingExitErrorIsSilent &&
      mountedCommit &&
      stdoutWritable &&
      (mountedDynamicUpdatesLive || !isErrorInput(pendingExitError))
    ) {
      teardownFinalCommitCompleted = true;
      try {
        const finalCommit = mountedCommit();
        if (finalCommit.status === "blocked") {
          teardownFinalCommitCompleted = false;
          waitForCoordinator();
          return;
        }
        if (!finalCommit.writable) {
          waitForCoordinator();
          return;
        }
      } catch {
        // Final rendering is best-effort. Continue with terminal restoration.
      }
    } else {
      teardownFinalCommitCompleted = true;
    }

    const completeTeardown = (): void => {
      if (teardownCompleted) return;
      if (mountedAsOwner && mountedAppContext) {
        if (liveInstances.delete(mountedAppContext.stdout)) {
          changeRuntimeResource("streamReservations", -1);
        }
        mountedAsOwner = false;
      }
      mountedCreateOutputStateRollback = null;
      mountedEmergencyKittyController = null;
      mountedEmergencyStdinController = null;
      mountedAbandonPendingTerminalOutput = null;
      mountedTerminalReconcile = null;
      closeOutstandingSynchronizedOutput();
      mountedSynchronizedOutputReleases = null;
      teardownCompleted = true;
      flushDeferredLifecycle();
    };

    teardownExecutionStarted = true;
    if (sync || immediateTermination || !coordinator) {
      performTeardownNow(sync, immediateTermination);
      completeTeardown();
      return;
    }

    const rollbackRestoration = mountedCreateOutputStateRollback?.();
    try {
      const restoration = coordinator.run(() => performTeardownNow(sync, immediateTermination), {
        onUnhandedFailure: rollbackRestoration,
      });
      if (restoration.status === "blocked") {
        // A synchronous host re-entry can claim the gate between the idle check
        // and this call. No cleanup body ran, so retry after that owner drains.
        teardownExecutionStarted = false;
        waitForCoordinator();
        return;
      }
      if (restoration.writable) completeTeardown();
      else {
        void restoration.ready.then(completeTeardown, () => {
          rollbackRestoration?.();
          performEmergencyTerminalRestore();
          completeTeardown();
        });
      }
    } catch {
      // Restore the logical writer snapshot before using idempotent synchronous
      // terminal releases. A custom stream may throw before or after accepting
      // the captured restoration transaction, so the physical state is unknown.
      rollbackRestoration?.();
      performEmergencyTerminalRestore();
      completeTeardown();
    }
  }

  function performTeardownNow(sync: boolean, immediateTermination: boolean) {
    try {
      // Terminal cleanup is a best-effort transaction. One failed release must
      // never strand a later lease (for example a Kitty write must not prevent
      // leaving the alternate screen or restoring raw mode), and cleanup failure
      // must never replace the application's original fatal error.
      const runBestEffort = (operation: () => void): void => {
        try {
          operation();
        } catch {
          // Continue through every remaining release.
        }
      };
      const appContext = mountedAppContext!;

      if (mountedUnsubscribeSuspension) {
        const unsubscribe = mountedUnsubscribeSuspension;
        mountedUnsubscribeSuspension = null;
        runBestEffort(unsubscribe);
      }

      // Remove the signal-exit handler first (Ink parity G18, ink.tsx:765:
      // `this.unsubscribeExit()`). When teardown is triggered BY a signal,
      // signal-exit has already unloaded its own listeners, so this is a no-op;
      // when triggered by unmount()/exit(), it stops the handler from firing
      // later (no leak, no double-run — teardownStarted also guards re-entry).
      if (mountedUnsubscribeExit) {
        const unsubscribe = mountedUnsubscribeExit;
        mountedUnsubscribeExit = null;
        runBestEffort(unsubscribe);
      }

      const stdout = mountedAppContext?.stdout;
      const stdoutWritable = stdout
        ? getWritableStreamState(stdout as MaybeWritableStream).canWriteToStdout
        : false;
      // Restore console BEFORE Vue cleanup (matching Ink ink.tsx:779)
      if (mountedRestoreConsole) {
        const restoreConsole = mountedRestoreConsole;
        mountedRestoreConsole = null;
        runBestEffort(restoreConsole);
      }
      if (mountedMouseController) {
        runBestEffort(() => mountedMouseController?.beginSilentTeardown());
      }
      if (mountedTestInputHostDetach) {
        const detachTestInputHost = mountedTestInputHostDetach;
        mountedTestInputHostDetach = null;
        runBestEffort(detachTestInputHost);
      }
      if (vueMountStarted) {
        vueMountStarted = false;
        // A non-returning process/signal exit must not invoke application
        // lifecycle hooks: mount may still be on the stack, and user cleanup can
        // re-enter process.exit() before terminal restoration completes. Runtime
        // resources below are released directly instead.
        if (!immediateTermination) runBestEffort(originalUnmount);
      }
      if (mountedRenderedTargets) {
        const renderedTargets = mountedRenderedTargets;
        mountedRenderedTargets = null;
        setRenderedTargetController(appContext, null);
        runBestEffort(() => renderedTargets.dispose());
      }
      if (mountedCaretController) {
        const caretController = mountedCaretController;
        mountedCaretController = null;
        runBestEffort(() => caretController.dispose());
      }
      if (mountedMouseController) {
        const mouseController = mountedMouseController;
        mountedMouseController = null;
        setFullscreenMouseController(appContext, null);
        runBestEffort(() => mouseController.dispose());
      }
      if (mountedGeometry) {
        const geometry = mountedGeometry;
        mountedGeometry = null;
        setInternalGeometryService(appContext, null);
        runBestEffort(() => geometry.dispose());
      }
      if (mountedFocusController) {
        const focusController = mountedFocusController;
        mountedFocusController = null;
        runBestEffort(() => focusController.dispose());
      }
      if (mountedClipboard) {
        const clipboard = mountedClipboard;
        mountedClipboard = null;
        runBestEffort(() => clipboard.dispose());
      }
      if (mountedTextSelection) {
        const textSelection = mountedTextSelection;
        mountedTextSelection = null;
        runBestEffort(() => textSelection.dispose());
      }
      // Dispose the animation scheduler after Vue unmount: each useAnimation's
      // onScopeDispose has already unsubscribed, so this is an idempotent backstop.
      if (mountedAnimationScheduler) {
        const animationScheduler = mountedAnimationScheduler;
        runBestEffort(() => animationScheduler.dispose());
      }
      mountedAnimationScheduler = null;
      if (mountedKittyController) {
        // Disable-kitty is a restore escape: on the signal path it must flush
        // synchronously too (Finding A).
        const kittyController = mountedKittyController;
        mountedEmergencyKittyController = kittyController;
        mountedKittyController = null;
        runBestEffort(() => kittyController.dispose(sync));
      }
      if (!mountedDynamicUpdatesLive && mountedAppContext && !isErrorInput(pendingExitError)) {
        // The dynamic frame was deferred during rendering. The final commit()
        // above refreshed lastOutput to the current tree, so write that latest
        // frame now as `lastFrame + "\n"`.
        const lastFrame = mountedGetLastOutput?.() ?? "";
        writeBestEffort(mountedAppContext.stdout, lastFrame + "\n", sync);
      }
      // A viewport-filling Inline frame intentionally has no trailing newline
      // while it is live. Advance exactly once before restoring the cursor so a
      // following shell prompt cannot append to the frame's final row. NEL moves
      // to column zero even when the terminal does not translate LF to CRLF.
      if (mountedWriter && mountedDynamicUpdatesLive && mountedAppContext && stdoutWritable) {
        // A declared application caret may leave the physical cursor above the
        // bottom of either a short or full-height frame. Return to the writer's
        // actual bottom before establishing the post-app line; otherwise the
        // shell can overwrite retained application rows.
        const writer = mountedWriter;
        const returnToBottom = writer.getCursorReturnToBottom();
        if (returnToBottom !== "") {
          writeBestEffort(mountedAppContext.stdout, returnToBottom, sync);
        }
        if (mountedNeedsTerminalLineAdvance?.()) {
          writeBestEffort(mountedAppContext.stdout, nextLineEscape, sync);
        }
        if (sync) {
          if (writer.isCursorHidden()) {
            writeBestEffort(mountedAppContext.stdout, "\x1b[?25h", true);
          }
          writer.reset({ cursorDirty: false, cursorHidden: false });
        } else {
          runBestEffort(() => writer.done());
        }
      }
      if (mountedAlternateScreen && mountedAppContext) {
        if (writeBestEffort(mountedAppContext.stdout, ansiEscapes.exitAlternativeScreen, sync)) {
          setAlternateScreenOwned(false);
        }
      }
      if (mountedFullscreenCursorHidden && mountedAppContext) {
        if (writeBestEffort(mountedAppContext.stdout, "\x1b[?25h", sync)) {
          setFullscreenCursorHidden(false);
        }
      }
      if (mountedRoot) runBestEffort(() => detachYoga(mountedRoot!));
      mountedRoot = null;
      if (mountedResizeHandler && mountedAppContext) {
        const resizeHandler = mountedResizeHandler;
        runBestEffort(() => {
          mountedAppContext?.stdout.off("resize", resizeHandler);
          releaseMountedResizeListener?.();
          releaseMountedResizeListener = null;
        });
        mountedResizeHandler = null;
      }
      if (mountedExitListener) {
        const exitListener = mountedExitListener;
        runBestEffort(() => {
          process.off("exit", exitListener);
          releaseMountedExitListener?.();
          releaseMountedExitListener = null;
        });
        mountedExitListener = null;
      }
      if (mountedBeforeExitHandler) {
        const beforeExitHandler = mountedBeforeExitHandler;
        runBestEffort(() => {
          process.off("beforeExit", beforeExitHandler);
          releaseMountedBeforeExitListener?.();
          releaseMountedBeforeExitListener = null;
        });
        mountedBeforeExitHandler = null;
      }
      if (mountedStdinController) {
        // Pass sync through so the bracketed-paste-disable escape flushes
        // synchronously on the signal-exit path (Finding A), mirroring the
        // kitty/cursor/alt-screen restores above.
        const stdinController = mountedStdinController;
        mountedEmergencyStdinController = stdinController;
        mountedStdinController = null;
        runBestEffort(() => stdinController.dispose(sync));
      }
      if (mountedRenderSession) {
        const renderSession = mountedRenderSession;
        runBestEffort(() => renderSession.dispose());
      }
      mountedRenderSession = null;
      mountedNeedsTerminalLineAdvance = null;
      // Drop this app's full-reload registration so a stale teardown can't run on
      // the next reload. Identity-guarded inside unregisterDevApp: during a reload
      // the old app unregisters here before the new app registers.
      if (mountedDevTeardown) {
        const devTeardown = mountedDevTeardown;
        mountedDevTeardown = null;
        runBestEffort(() => unregisterDevApp(devTeardown));
      }

      if (
        !pendingExitErrorIsSilent &&
        isErrorInput(pendingExitError) &&
        (!pendingExitErrorWasRendered || !mountedBoundaryErrorsAreDurable)
      ) {
        const report = sanitizeAnsiMultiline(formatErrorForStderr(pendingExitError));
        const output = `${appContext.stderr.isTTY ? nextLineEscape : ""}${report}`;
        if (sync) {
          writeBestEffort(appContext.stderr, output, true);
        } else {
          pendingFatalReport = output;
        }
      }

      // Retain the context only until every cleanup operation above has had its
      // chance. resolveExit() still needs the streams for its write barrier, so it
      // deliberately observes this final readonly reference through the closure.
      mountedAppContext = appContext;
    } finally {
      // The caller releases stream ownership and settles lifecycle work only
      // after this restoration transaction has drained (or definitively failed).
    }
  }

  const renderer = createRenderer<TuiNode, TuiNode>(
    buildNodeOps({ onCommit: () => scheduledCommit() }),
  );

  const captureComponentError = (error: Error): boolean => {
    const silent = isExpectedManagedInputUnavailableError(error);
    recordExitError(error, silent);
    if (silent) mountedScheduler?.cancel();
    void nextTick(() => {
      exitWithError(error);
    });
    return silent;
  };

  if (isDevConnected()) {
    // initHmrBridge already ran inside connectDevtools() with a live hot.
    // Clear any dev status left in the module-global `devState` by a previous
    // app in this dev process, so this fresh app never renders a stale Build
    // Error / HMR-update overlay instead of its own content.
    resetDevState();
    root = createDevOverlayWrapper(root, rootProps ?? undefined);
    rootProps = undefined;
  }

  // Internal error boundary wrapper: catches all descendant errors (setup,
  // render, lifecycle) via onErrorCaptured, renders an ErrorOverview frame,
  // then routes the error through exit(). This prevents yoga WASM corruption
  // that would occur if errors propagated uncaught during Vue's render phase.
  const userRoot = root;
  const userRootProps = rootProps;
  const ErrorBoundaryRoot = defineComponent({
    name: "InternalErrorBoundary",
    setup() {
      // Two refs by design: `caught` is the ORIGINAL thrown value, passed to
      // ErrorOverview for a faithful display (Ink stores the raw value —
      // ErrorBoundary.tsx:18 — and ErrorOverview only renders a stack when the
      // value has one). `errored` marks that an error occurred (the value may be
      // a falsy primitive, so we can't test `caught` for truthiness). The
      // exit/reject machinery still receives a wrapped Error — semantics
      // unchanged.
      const caught = shallowRef<unknown>(null);
      const errored = shallowRef(false);
      const silentErrored = shallowRef(false);

      onErrorCaptured((err) => {
        // First-wins: only the FIRST captured error is recorded and routed to
        // exit(). If two descendants throw in the SAME synchronous flush, the
        // displayed `caught` and the rejected exit error must stay the SAME
        // error — `caught` is last-wins by assignment, while exit() is
        // first-wins, so without this guard the overview would show error #2
        // while waitUntilExit() rejects with error #1 (e17 display/reject
        // mismatch). Guarding on `errored` keeps both on the first thrown value.
        if (!errored.value && !silentErrored.value) {
          // Preserve a genuine Error — including a cross-realm one (fails
          // `instanceof Error`, passes the `[object Error]` brand check) — so the
          // ORIGINAL thrown error reaches exit()/waitUntilExit() unchanged,
          // matching Ink's ErrorBoundary (rejects with the thrown value itself).
          // A true non-Error throw (`throw "x"`, `throw 0`, `throw {message:'x'}`)
          // is wrapped with the SAME message ErrorOverview displays
          // (messageForNonError), so the shown and rejected messages agree (e17).
          const e = isErrorInput(err) ? err : new Error(messageForNonError(err));
          const silent = captureComponentError(e);
          if (silent) {
            silentErrored.value = true;
          } else {
            caught.value = err;
            errored.value = true;
          }
          // Record the exit error SYNCHRONOUSLY, but keep the teardown DEFERRED.
          // Two distinct concerns, decoupled:
          //   1. recordExitError(e) sets pendingExitError NOW (first-wins). A host
          //      that throws during a flush and then synchronously unmounts in the
          //      SAME task would otherwise have its racing unmount() run
          //      resolveExit() while pendingExitError is still undefined —
          //      resolving CLEAN and swallowing the error (the deferred-exit race,
          //      BUG #2). Recording it up front makes that resolveExit() reject
          //      with the thrown error.
          //   2. exitWithError(e) stays on nextTick so teardown is DEFERRED until
          //      AFTER the current flush. teardown() runs the final mountedCommit()
          //      that paints the ErrorOverview frame on live-output mounts,
          //      and the boundary's errored→true re-render must commit BEFORE that
          //      final commit. A synchronous exit here would let teardown's
          //      microtask run before the re-render, dropping the overview frame.
          //      Deferring keeps frame/paint timing byte-identical to main. (In the
          //      racing-unmount case the unmount sets teardownStarted, so this
          //      later exit() no-ops via the exitInitiated||teardownStarted guard;
          //      with no race it proceeds normally.)
        }
        return false; // stop propagation
      });

      return () => {
        if (silentErrored.value) return null;
        if (errored.value) {
          // Rendering this vnode only means the error frame is ready to paint.
          // Durability is recorded later, after the terminal write succeeds.
          pendingBoundaryFrameReady = pendingBoundaryError;
          return h(ErrorOverview, { error: caught.value });
        }
        return h(userRoot, userRootProps ?? undefined);
      };
    },
  });

  const baseApp = renderer.createApp(ErrorBoundaryRoot);
  const originalMount = baseApp.mount.bind(baseApp);
  const originalUnmount = baseApp.unmount.bind(baseApp);

  const app = baseApp as unknown as TuiApp;

  app.mount = function mount(options: MountOptions = {}): ComponentPublicInstance {
    // The mount contract is validated before reading stream getters, checking
    // stream ownership, or mutating Vue/terminal state. Removed-option errors
    // deliberately win over an invalid mode value.
    const requestedMode = normalizeRequestedMode(options);
    const liveUpdatesOverride = validateLiveUpdates(
      (options as { readonly liveUpdates?: unknown }).liveUpdates,
    );
    const clipboardTransport = normalizeClipboardTransport(
      (options as { readonly clipboard?: unknown }).clipboard,
    );
    const stdout = options.stdout ?? process.stdout;
    const stdin = options.stdin ?? process.stdin;
    const stderr = options.stderr ?? process.stderr;

    // Internal deterministic-test observer. It observes the resolved session
    // and renderer content commits without selecting another output path.
    const renderObserver = (options as { [INTERNAL_RENDER_OBSERVER]?: InternalRenderObserver })[
      INTERNAL_RENDER_OBSERVER
    ];
    const testInputHost = (options as { [INTERNAL_TEST_INPUT_HOST]?: InternalTestInputHost })[
      INTERNAL_TEST_INPUT_HOST
    ];
    const configuredTerminalSizeProbe = (
      options as { [INTERNAL_TERMINAL_SIZE_PROBE]?: TerminalSizeProbe }
    )[INTERNAL_TERMINAL_SIZE_PROBE];
    const suspensionHost =
      (options as { [INTERNAL_SUSPENSION_HOST]?: SuspensionHost })[INTERNAL_SUSPENSION_HOST] ??
      processSuspensionHost;
    // Process-global fallbacks describe the process's controlling terminal, not
    // an arbitrary custom WriteStream. A custom TTY must provide a complete
    // columns/rows pair; deterministic hosts can supply the internal modeled
    // probe explicitly.
    const terminalSizeProbe: TerminalSizeProbe =
      configuredTerminalSizeProbe ??
      (stdout === process.stdout || stdout === process.stderr
        ? probeControllingTerminalSize
        : () => ({ kind: "unavailable" }));
    const resumeTerminalSizeProbe: TerminalSizeProbe =
      configuredTerminalSizeProbe ??
      (stdout === process.stdout || stdout === process.stderr
        ? () =>
            probeControllingTerminalSize({
              // process.stdout/process.stderr dimensions are refreshed by
              // Node's pending SIGWINCH callback, which may run only after the
              // SIGTSTP handler resumes. Query the controlling terminal first
              // so continuation can repaint at the new size immediately.
              stdout: undefined,
              stderr: undefined,
              env: {},
            })
        : () => ({ kind: "unavailable" }));

    // Instance-reuse guard (Ink parity G14): if a live Vue TUI instance is
    // already rendering to this stdout, warn on stderr and skip wiring a second
    // competing renderer. The second mount is a deliberate no-op: the caller
    // must unmount() the first app before mounting on the same stream.
    // We write the warning directly to native process.stderr so an existing
    // alternate-screen renderer cannot swallow it via patchConsole.
    // The skip is scoped to THIS call only: it wires nothing, mutates no
    // per-app state, and returns an inert handle. unmount()/teardown()/
    // resolveExit() consult the actually-wired state (mountedAppContext /
    // mountedAsOwner), so a guarded call never affects the app's ability to
    // tear down a mount it really wired (audit e18: a sticky skip flag here
    // made the owner's double-fire — and even targeting someone else's busy
    // stream — permanently disable the app's own teardown).
    if (liveInstances.has(stdout)) {
      process.stderr.write(
        "Warning: this stdout already has a live app, so this mount() was ignored. To update the current view, change its reactive state instead of remounting; to mount another app, unmount() the existing one first.\n",
      );
      return {} as ComponentPublicInstance;
    }

    const requestedScreenReaderPresentation =
      options.isScreenReaderEnabled ?? process.env["INK_SCREEN_READER"] === "true";
    const stdoutFacts = {
      isTTY: Boolean(stdout.isTTY),
      columns: stdout.columns,
      rows: stdout.rows,
    } as const;
    const terminalProbe: TerminalSizeProbeResult = needsTerminalSizeProbe(stdoutFacts)
      ? terminalSizeProbe()
      : { kind: "unavailable" };
    const surface = resolveLiveSurface({
      requestedMode,
      liveUpdatesOverride,
      isCI: isInCi,
      presentation: requestedScreenReaderPresentation ? "screen-reader" : "visual",
      suspensionSupported: suspensionHost.supported,
      stdout: stdoutFacts,
      terminalProbe,
    });
    const renderSession = createLiveRenderSessionService(surface);
    renderObserver?.onSession?.(renderSession.session);
    const isScreenReaderEnabled = surface.session.output.presentation === "screen-reader";
    const dynamicUpdatesLive = surface.session.output.dynamicUpdates === "live";
    const fixedFullscreenSurface = surface.kind === "fullscreen-terminal";
    const boundedInlineSurface =
      surface.kind === "inline-terminal" && surface.session.output.presentation === "visual";
    const inlineTerminalSurface = surface.kind === "inline-terminal";
    const mouseProtocolAvailable = supportsTerminalMouse() || testInputHost?.supportsMouse === true;
    const targetedCaretOutputAvailable =
      dynamicUpdatesLive &&
      surface.session.output.destination === "terminal" &&
      surface.session.output.presentation === "visual";

    function readCurrentDimensions(preferFreshProbe = false): ResolvedLiveDimensions | null {
      const currentStdout = {
        isTTY: Boolean(stdout.isTTY),
        columns: stdout.columns,
        rows: stdout.rows,
      } as const;
      const currentProbe = preferFreshProbe
        ? resumeTerminalSizeProbe()
        : needsTerminalSizeProbe(currentStdout)
          ? terminalSizeProbe()
          : ({ kind: "unavailable" } as const);
      const dimensionsSource =
        preferFreshProbe && currentProbe.kind === "detected"
          ? {
              isTTY: currentStdout.isTTY,
              columns: currentProbe.size.columns,
              rows: currentProbe.size.rows,
            }
          : currentStdout;
      const next = resolveLiveDimensions(dimensionsSource, currentProbe);

      if (surface.kind === "fullscreen-terminal") {
        if (next.terminal === null) return null;
        return { ...next, layout: next.terminal };
      }
      if (boundedInlineSurface) {
        if (next.terminal === null) return null;
        return { ...next, layout: next.terminal };
      }
      return next;
    }

    const onRender = options.onRender;
    const incrementalRendering = options.incrementalRendering;
    const patchConsole = options.patchConsole;
    const kittyKeyboard = options.kittyKeyboard;
    // Default maxFps to 30 to match Ink (ink.tsx: `options.maxFps ?? 30`), so
    // the render throttle engages by default — without this the animation
    // coalescing (G02) never kicks in on an unthrottled path.
    const maxFps = options.maxFps ?? 30;
    mountedDynamicUpdatesLive = dynamicUpdatesLive;
    mountedBoundaryErrorsAreDurable = dynamicUpdatesLive && !fixedFullscreenSurface;

    const outputCoordinator = createOutputCoordinator({
      onDeferredError(error) {
        mountedAbandonPendingTerminalOutput?.({ physicalStateUncertain: true });
        // A prior BSU may already have been accepted while its matching ESU was
        // still queued behind the failed segment. Close that terminal mode
        // synchronously before the fatal lifecycle turn starts.
        closeOutstandingSynchronizedOutput();
        // A remainder write happens from the stream's later drain turn, outside
        // the original Vue/renderer stack. Route that failure through the same
        // fatal lifecycle boundary without leaving an unhandled rejection.
        queueMicrotask(() => {
          if (teardownStarted) return;
          const context = mountedAppContext;
          if (!context) return;
          context.exit(isErrorInput(error) ? error : new Error(messageForNonError(error)));
        });
      },
    });
    mountedOutputCoordinator = outputCoordinator;
    mountedSynchronizedOutputReleases = new Set();
    let terminalReconcileTurn: Promise<void> | null = null;
    let terminalReconcileRequested = false;
    let reconcileManagedTerminalOutput: () => void = () => {};

    function requestTerminalReconcile(): void {
      if (teardownStarted) return;
      if (terminalReconcileTurn) {
        terminalReconcileRequested = true;
        return;
      }
      terminalReconcileRequested = false;
      let turn!: Promise<void>;
      turn = outputCoordinator
        .waitForIdle()
        .then(
          () => {
            if (!teardownStarted) reconcileManagedTerminalOutput();
          },
          () => {},
        )
        .finally(() => {
          if (terminalReconcileTurn === turn) terminalReconcileTurn = null;
          if (mountedTerminalReconcile === turn) mountedTerminalReconcile = null;
          if (terminalReconcileRequested && !teardownStarted) requestTerminalReconcile();
        });
      terminalReconcileTurn = turn;
      mountedTerminalReconcile = turn;
      void turn.catch(() => {});
    }

    function writeRuntimeOutput(
      stream: NodeJS.WriteStream,
      data: string,
      callback?: () => void,
      onHandoff?: () => void,
    ): boolean {
      let writable = false;
      const result = outputCoordinator.continue(() => {
        writable = outputCoordinator.write(stream, data, callback, onHandoff);
      });
      if (result.status === "blocked") {
        throw new Error("Runtime output transaction is backpressured.");
      }
      // `false` from Node means accepted backpressure, not rejected bytes. The
      // output gate itself prevents a later transaction until drain.
      return writable;
    }

    function writeTerminalOutput(data: string, onHandoff?: () => void): boolean {
      let captured = false;
      let result: CoordinatedWriteResult;
      try {
        result = outputCoordinator.continue(() => {
          captured = outputCoordinator.write(stdout, data, undefined, onHandoff);
        });
      } catch (error) {
        mountedAbandonPendingTerminalOutput?.({ physicalStateUncertain: true });
        closeOutstandingSynchronizedOutput();
        throw error;
      }
      if (result.status === "blocked") {
        requestTerminalReconcile();
        return false;
      }
      if (!result.writable) requestTerminalReconcile();
      return captured;
    }

    function blockedCoordinatedWrite(): Extract<CoordinatedWriteResult, { status: "blocked" }> {
      return Object.freeze({ status: "blocked", ready: outputCoordinator.waitForIdle() });
    }

    function runOutputTransaction(
      body: () => void,
      options?: {
        readonly onFullyHanded?: () => void;
        readonly onUnhandedFailure?: (error: unknown) => void;
      },
    ): CoordinatedWriteResult {
      try {
        return outputCoordinator.run(body, options);
      } catch (error) {
        // The coordinator is idle again before a synchronous handoff error is
        // rethrown. If BSU reached the stream but ESU did not, close that mode
        // now rather than leaving recovery to whichever caller catches it.
        mountedAbandonPendingTerminalOutput?.({ physicalStateUncertain: true });
        closeOutstandingSynchronizedOutput();
        throw error;
      }
    }

    const acceptedCoordinatedWrite = Object.freeze({
      status: "accepted",
      writable: true,
    }) satisfies CoordinatedWriteResult;

    let leaveMountLifecycleTransaction: (() => void) | null = null;
    try {
      // Frame coordination state — tracks the last rendered output so
      // writeToStdout/writeToStderr can clear and restore the active frame.
      // Frame state: lastOutput is the most recent rendered frame string and
      // outputHeight is its line count (used by transcript erasure and lifecycle
      // bookkeeping). Inline history is emitted once and is never accumulated for
      // destructive whole-terminal replay.
      const frameState = {
        lastOutput: "",
        lastOutputToRender: "" as string | undefined,
        outputHeight: 0,
      };
      let fullscreenBaselineValid = false;
      let fullscreenBaselineColumns: number | null = null;
      let fullscreenBaselineRows: number | null = null;
      let fullscreenEnterPending = false;
      let fullscreenCursorHidePending = false;
      let inlineRegionStarted = false;
      let terminalSuspended = false;
      let pendingMountSuspension = false;
      let terminalResumeInProgress = false;
      let terminalResumePainting = false;
      let resizeEventGeneration = 0;
      let resizeHandledGeneration = 0;
      let resizePaintPending = false;
      let requestPendingResizeRefresh: () => void = () => {};
      let prepareResumeSurface: (() => (() => CoordinatedWriteResult) | null) | null = null;
      let suspendedFullscreenSurface = false;
      let suspendedInlineSurface = false;
      let rejectedFullscreenStatic = false;
      mountedAbandonPendingTerminalOutput = (abandonment) => {
        fullscreenEnterPending = false;
        fullscreenCursorHidePending = false;
        if (fixedFullscreenSurface && abandonment?.physicalStateUncertain) {
          fullscreenBaselineValid = false;
        }
        (mountedKittyController ?? mountedEmergencyKittyController)?.abandonPendingOutput();
        (mountedStdinController ?? mountedEmergencyStdinController)?.abandonPendingTerminalOutput(
          abandonment,
        );
        if (!abandonment?.physicalStateUncertain) requestTerminalReconcile();
      };
      type WriterCaretPosition = InternalPreparedCaretFrame["position"];
      interface WriterCaretOwner {
        readonly position: WriterCaretPosition;
      }
      let activeWriterCaretOwner: WriterCaretOwner | null = null;
      let writerCaretDeclaration: WriterCaretPosition;
      mountedGetLastOutput = () => frameState.lastOutput;
      mountedNeedsTerminalLineAdvance = () =>
        inlineTerminalSurface &&
        frameState.lastOutputToRender !== undefined &&
        frameState.lastOutputToRender !== "" &&
        !frameState.lastOutputToRender.endsWith("\n");

      function rejectUnsupportedFullscreenStatic(statics = findStatics(tuiRoot)): boolean {
        if (!fixedFullscreenSurface || statics.length === 0) return false;
        if (!rejectedFullscreenStatic) {
          // Static is terminal history, not fixed-viewport layout. Reject on
          // component presence (including an empty region) before preparation,
          // layout, observers, onRender, commit-time surface reacquisition, or
          // frame output.
          // Existing setup-owned terminal leases are released by the ordinary
          // fatal teardown before its durable stderr report is written.
          rejectedFullscreenStatic = true;
          mountedScheduler?.cancel();
          captureComponentError(new Error(FULLSCREEN_STATIC_ERROR));
        }
        return true;
      }

      const runSuspensionStep = (operation: () => void): void => {
        try {
          operation();
        } catch {
          // A failed resource must not prevent the remaining resources or other
          // mounted sessions from reaching their suspend boundary.
        }
      };

      function releaseOutputSurfaceForSuspension(rememberSurface: boolean): void {
        const writer = mountedWriter;
        mountedCaretController?.setOutputAvailable(false, { surfaceReleased: true });
        mountedTextSelection?.setSurfaceAvailable(false, { suspended: true });
        if (fixedFullscreenSurface) {
          fullscreenBaselineValid = false;
          mountedGeometry?.setSurfaceAvailable(false);
          if (rememberSurface) suspendedFullscreenSurface = mountedAlternateScreen;
          if (mountedAlternateScreen) {
            if (writeBestEffort(stdout, ansiEscapes.exitAlternativeScreen, true)) {
              setAlternateScreenOwned(false);
            }
          }
          if (mountedFullscreenCursorHidden) {
            if (writeBestEffort(stdout, "\x1b[?25h", true)) {
              setFullscreenCursorHidden(false);
            }
          }
          if (writer) {
            runSuspensionStep(() => writer.reset({ cursorDirty: false, cursorHidden: false }));
          }
          frameState.lastOutput = "";
          frameState.lastOutputToRender = "";
          frameState.outputHeight = 0;
          return;
        }

        if (!inlineTerminalSurface || !dynamicUpdatesLive || !writer) return;
        mountedGeometry?.setSurfaceAvailable(false);
        if (rememberSurface) suspendedInlineSurface = true;
        const returnToBottom = writer.getCursorReturnToBottom();
        if (returnToBottom !== "") writeBestEffort(stdout, returnToBottom, true);
        if (mountedNeedsTerminalLineAdvance?.()) {
          writeBestEffort(stdout, nextLineEscape, true);
        }
        const cursorWasHidden = writer.isCursorHidden();
        const cursorShown = !cursorWasHidden || writeBestEffort(stdout, "\x1b[?25h", true);
        runSuspensionStep(() =>
          writer.reset({
            cursorDirty: false,
            cursorHidden: cursorWasHidden && !cursorShown,
          }),
        );
        frameState.lastOutput = "";
        frameState.lastOutputToRender = "";
        frameState.outputHeight = 0;
        inlineRegionStarted = false;
      }

      function suspendSession(): void {
        if (teardownStarted || terminalSuspended) return;
        if (leaveMountLifecycleTransaction !== null && lifecycleTransactionDepth > 0) {
          // A hostile raw/stream callback can request suspension while mount is
          // only halfway through acquiring terminal resources. Finish the mount
          // transaction first, then release the complete resource set once.
          pendingMountSuspension = true;
          return;
        }
        outputCoordinator.abort(new Error("Output transaction was interrupted by suspension."));
        mountedAbandonPendingTerminalOutput?.();
        closeOutstandingSynchronizedOutput();
        runLifecycleTransaction(() => {
          terminalSuspended = true;
          terminalResumeInProgress = false;
          runSuspensionStep(() => mountedClipboard?.suspend());
          runSuspensionStep(() => mountedScheduler?.cancel());
          runSuspensionStep(() => mountedKittyController?.suspend(true));
          runSuspensionStep(() => mountedMouseController?.suspend());
          runSuspensionStep(() => mountedStdinController?.suspend(true));
          releaseOutputSurfaceForSuspension(true);
        });
      }

      async function resumeSession(): Promise<void> {
        if (pendingMountSuspension) {
          // The host resumed before the mount transaction reached its deferred
          // suspend boundary, so no physical transition is needed.
          pendingMountSuspension = false;
          return;
        }
        if (teardownStarted || !terminalSuspended || terminalResumeInProgress) return;
        let applyPreparedSurface: (() => CoordinatedWriteResult) | null = null;
        let resumeCoveredResizeGeneration = resizeHandledGeneration;
        let resumed = false;
        const prepareContinuedSurface = (): void => {
          resumeCoveredResizeGeneration = resizeEventGeneration;
          applyPreparedSurface = prepareResumeSurface?.() ?? null;
          if (!applyPreparedSurface) {
            const repaint = mountedCommit;
            if (!repaint) throw new Error("continued surface repaint is not ready");
            applyPreparedSurface = repaint;
          }
        };
        try {
          runLifecycleTransaction(() => {
            terminalResumeInProgress = true;
            const needsLiveRepaint =
              (fixedFullscreenSurface && suspendedFullscreenSurface) ||
              (inlineTerminalSurface && suspendedInlineSurface) ||
              dynamicUpdatesLive;
            if (needsLiveRepaint) {
              prepareContinuedSurface();
            }
          });

          // Session dimensions are reactive facts. Vue must first update every
          // component that consumed them before the host tree can be repainted
          // accurately. Keep input and terminal ownership suspended across this
          // microtask boundary.
          if (applyPreparedSurface) await nextTick();
          while (
            applyPreparedSurface &&
            !teardownStarted &&
            terminalSuspended &&
            resumeCoveredResizeGeneration !== resizeEventGeneration
          ) {
            runLifecycleTransaction(prepareContinuedSurface);
            await nextTick();
          }

          let retryForNewerResize = false;
          const waitForAcceptedOutput = async (
            result: CoordinatedWriteResult,
          ): Promise<boolean> => {
            if (result.status === "blocked") {
              await result.ready;
              return false;
            }
            if (!result.writable) await result.ready;
            return true;
          };
          do {
            if (retryForNewerResize) {
              runLifecycleTransaction(prepareContinuedSurface);
              await nextTick();
              while (
                !teardownStarted &&
                terminalSuspended &&
                resumeCoveredResizeGeneration !== resizeEventGeneration
              ) {
                runLifecycleTransaction(prepareContinuedSurface);
                await nextTick();
              }
            }
            retryForNewerResize = false;
            if (teardownStarted || !terminalSuspended || !terminalResumeInProgress) break;
            if (rejectUnsupportedFullscreenStatic()) break;

            const surfaceResult = runOutputTransaction(() => {
              runLifecycleTransaction(() => {
                if (fixedFullscreenSurface && suspendedFullscreenSurface) {
                  ensureFullscreenSurface();
                }
                mountedMouseController?.resume();
                mountedGeometry?.setSurfaceAvailable(!isScreenReaderEnabled);
                mountedTextSelection?.setSurfaceAvailable(
                  fixedFullscreenSurface && !isScreenReaderEnabled,
                );
              });
            });
            if (!(await waitForAcceptedOutput(surfaceResult))) {
              retryForNewerResize = true;
              continue;
            }
            if (teardownStarted) break;
            if (resumeCoveredResizeGeneration !== resizeEventGeneration) {
              retryForNewerResize = true;
              continue;
            }

            terminalResumePainting = true;
            try {
              const paint = applyPreparedSurface as (() => CoordinatedWriteResult) | null;
              if (paint) {
                const paintResult = runLifecycleTransaction(() => paint());
                if (!(await waitForAcceptedOutput(paintResult))) {
                  retryForNewerResize = true;
                  continue;
                }
              }
            } finally {
              terminalResumePainting = false;
            }
            if (teardownStarted) break;
            if (resumeCoveredResizeGeneration !== resizeEventGeneration) {
              retryForNewerResize = true;
              continue;
            }

            // Input is reacquired only after the output surface is complete. All
            // mode escapes share one gate transaction, so a false return delays
            // later setup instead of letting it overtake the repaint.
            const inputResult = runOutputTransaction(() => {
              runLifecycleTransaction(() => {
                mountedKittyController?.resume();
                mountedStdinController?.resume();
              });
            });
            if (!(await waitForAcceptedOutput(inputResult))) {
              runSuspensionStep(() => mountedKittyController?.suspend(true));
              runSuspensionStep(() => mountedStdinController?.suspend(true));
              retryForNewerResize = true;
              continue;
            }
            if (teardownStarted) break;
            if (resumeCoveredResizeGeneration !== resizeEventGeneration) {
              runSuspensionStep(() => mountedKittyController?.suspend(true));
              runSuspensionStep(() => mountedStdinController?.suspend(true));
              retryForNewerResize = true;
              continue;
            }

            runLifecycleTransaction(() => {
              terminalSuspended = false;
              mountedClipboard?.resume();
              suspendedFullscreenSurface = false;
              suspendedInlineSurface = false;
              resizeHandledGeneration = Math.max(
                resizeHandledGeneration,
                resumeCoveredResizeGeneration,
              );
              reconcileManagedTerminalOutput();
              resumed = true;
            });
          } while (
            retryForNewerResize &&
            !teardownStarted &&
            terminalSuspended &&
            terminalResumeInProgress
          );
          if (resumed) requestPendingResizeRefresh();
        } catch {
          if (!teardownStarted) {
            runLifecycleTransaction(() => {
              runSuspensionStep(() => mountedKittyController?.suspend(true));
              runSuspensionStep(() => mountedMouseController?.suspend());
              runSuspensionStep(() => mountedStdinController?.suspend(true));
              releaseOutputSurfaceForSuspension(false);
            });
          }
        } finally {
          terminalResumePainting = false;
          terminalResumeInProgress = false;
        }
      }

      function ensureInlineRegionStart() {
        if (!inlineTerminalSurface || inlineRegionStarted) return;
        // The runtime cannot know the caller's starting cursor column without an
        // asynchronous terminal query. Start on a new physical row so later
        // erase-line operations can never delete a pre-mount partial line. Delay
        // this until the first visible write so an empty app emits no initial NEL.
        writeRuntimeOutput(stdout, nextLineEscape);
        inlineRegionStarted = true;
      }

      function restoreLastOutput() {
        if (!dynamicUpdatesLive) return;
        // Clear() resets log-update's cursor state, so replay the latest cursor
        // intent before restoring output after external stdout/stderr writes.
        const caretPosition = activeWriterCaretOwner
          ? activeWriterCaretOwner.position
          : mountedCaretController?.writerPosition;
        // Use `||` (not `??`): an EMPTY lastOutputToRender — its initial value before
        // the first content commit, the value the resize-boundary path assigns,
        // and what an empty screen-reader frame leaves — must fall
        // back to `lastOutput + "\n"`, matching Ink (ink.tsx:507) and vue's own
        // mountedClear (render.ts:668). `??` only falls back for null/undefined, so an
        // empty string would pass through and restore nothing after an external write.
        withWriterCaretOwnership(caretPosition, () => {
          writer.write(frameState.lastOutputToRender || frameState.lastOutput + "\n");
        });
      }

      function writeCommittedInlineOutput(stream: NodeJS.WriteStream, data: string) {
        if (data !== "") ensureInlineRegionStart();
        writeRuntimeOutput(stream, data);
        // Coordinated output becomes terminal-owned history before the dynamic
        // region is restored. If the payload did not finish its row, NEL creates
        // the line boundary without relying on the terminal's LF/CRLF mode.
        if (
          inlineTerminalSurface &&
          data !== "" &&
          !data.endsWith("\n") &&
          (stream === stdout || Boolean(stream.isTTY))
        ) {
          writeRuntimeOutput(stream, nextLineEscape);
        }
      }

      function writeToStdout(data: string): CoordinatedWriteResult {
        // A late or suspended write is not retained. Its ready promise covers
        // only the current output gate; lifecycle availability must still be
        // re-checked by a caller that chooses to retry.
        if (teardownStarted || terminalSuspended) return blockedCoordinatedWrite();
        const rollback = createOutputStateRollback();
        return runOutputTransaction(
          () => {
            runLifecycleTransaction(() => {
              const outputData = stdout.isTTY ? sanitizeAnsiMultiline(data) : data;
              if (outputData === "") return;
              if (fixedFullscreenSurface) {
                repaintFullscreen(frameState.lastOutput, {
                  writeBefore: () => writeRuntimeOutput(stdout, outputData),
                  forceFull: true,
                });
                return;
              }
              if (isScreenReaderEnabled && dynamicUpdatesLive) {
                repaintTranscript(() => writeCommittedInlineOutput(stdout, outputData));
                return;
              }
              if (!dynamicUpdatesLive) {
                writeRuntimeOutput(stdout, outputData);
                return;
              }
              // Mirror the render path: wrap clear+write+restore in BSU/ESU when the
              // terminal supports synchronized updates, so the three-step sequence is
              // atomic and prevents tear/flicker (Ink parity G09, ink.tsx:687-698).
              runCoordinatedWrite(() => {
                writer.clear();
                writeCommittedInlineOutput(stdout, outputData);
              }, restoreLastOutput);
            });
          },
          { onUnhandedFailure: rollback },
        );
      }

      function writeToStderr(data: string): CoordinatedWriteResult {
        if (teardownStarted || terminalSuspended) return blockedCoordinatedWrite();
        const rollback = createOutputStateRollback();
        return runOutputTransaction(
          () => {
            runLifecycleTransaction(() => {
              const outputData = stderr.isTTY ? sanitizeAnsiMultiline(data) : data;
              if (outputData === "") return;
              if (fixedFullscreenSurface) {
                repaintFullscreen(frameState.lastOutput, {
                  writeBefore: () => writeRuntimeOutput(stderr, outputData),
                  forceFull: true,
                });
                return;
              }
              if (isScreenReaderEnabled && dynamicUpdatesLive) {
                repaintTranscript(() => writeCommittedInlineOutput(stderr, outputData));
                return;
              }
              if (!dynamicUpdatesLive) {
                writeRuntimeOutput(stderr, outputData);
                return;
              }
              // Per Ink ink.tsx:717-728: BSU/ESU are emitted on STDOUT (not stderr)
              // because synchronized-update mode is a stdout capability, while the
              // actual data goes to stderr. The sync gate also uses stdout's isTTY.
              runCoordinatedWrite(() => {
                writer.clear();
                writeCommittedInlineOutput(stderr, outputData);
              }, restoreLastOutput);
            });
          },
          { onUnhandedFailure: rollback },
        );
      }

      const appContext: AppContext = {
        exit(errorOrResult?: unknown) {
          // First-call-wins guard (Ink parity G33, mirrors handleAppExit's
          // `if (this.isUnmounted || this.isUnmounting) return;`): the FIRST
          // exit() captures its value/error and initiates teardown; any
          // SUBSEQUENT exit() is a no-op so it can neither overwrite the recorded
          // value nor re-resolve the exit promise with a later value.
          //
          // teardownStarted mirrors Ink's `isUnmounting` half of that guard:
          // app.unmount() runs teardown()+resolveExit() WITHOUT setting
          // exitInitiated, so a retained exit() (from useApp()) called re-entrantly DURING
          // unmount teardown (or any exit() after unmount) would otherwise pass
          // the exitInitiated check, overwrite pendingExitResult/pendingExitError
          // and queue a microtask — letting that late value win over the unmount.
          // Gating on teardownStarted too makes exit() a no-op once unmount/
          // teardown is in progress. At the FIRST exit() both flags are false, so
          // a normal exit-from-Vue-cycle still proceeds.
          if (exitInitiated || teardownStarted) return;
          exitInitiated = true;
          // Record the FIRST value/error synchronously (before the deferred
          // teardown microtask) so a re-entrant exit() — which is blocked above
          // anyway — and the eventual resolveExit() always settle on this value.
          if (isErrorInput(errorOrResult)) {
            // Don't clobber an error already recorded synchronously by
            // recordExitError() (the boundary captured first): first-wins keeps the
            // displayed and rejected error the SAME. pendingExitError is undefined on
            // a normal first exit(), so `??=` is identical to `=` in every other case.
            // (The race: a descendant throws Error1 → onErrorCaptured shows Error1 and
            // recordExitError sets pendingExitError=Error1 WITHOUT setting exitInitiated,
            // then app code calls exit(Error2) before the deferred exitWithError(Error1)
            // microtask runs — exitInitiated is still false so we reach here. `=` would
            // overwrite to Error2, making the overview show Error1 while waitUntilExit()
            // rejects Error2.)
            pendingExitError ??= errorOrResult;
          } else {
            pendingExitResult = errorOrResult;
          }
          // Defer teardown to a microtask: exit() is frequently called from
          // inside the Vue update cycle (useInput handler, setup(), errorHandler)
          // and unmounting synchronously would tear Vue down mid-flush.
          queueMicrotask(() => {
            try {
              teardown();
            } finally {
              resolveExit();
            }
          });
        },
        waitUntilRenderFlush,
        stdout,
        stderr,
        stdin,
        isRawModeSupported: hasRawInputCapability(stdin),
        setRawMode(mode: boolean) {
          if (
            typeof (stdin as { setRawMode?: (mode: boolean) => unknown }).setRawMode === "function"
          ) {
            (stdin as { setRawMode: (mode: boolean) => unknown }).setRawMode(mode);
          }
        },
        writeToStdout,
        writeToStderr,
      };
      const clipboard = createInternalClipboardService({
        transport: clipboardTransport,
        osc52Available:
          dynamicUpdatesLive &&
          surface.session.output.destination === "terminal" &&
          surface.session.output.presentation === "visual",
        osc52UnavailableReason: isScreenReaderEnabled ? "screen-reader" : "output-not-terminal",
        writeOsc52(text) {
          if (teardownStarted) throw new Error("clipboard transport is disposed");
          if (terminalSuspended) throw new Error("clipboard transport is suspended");
          const result = runOutputTransaction(() => {
            runLifecycleTransaction(() => {
              const payload = Buffer.from(text, "utf8").toString("base64");
              writeRuntimeOutput(stdout, `\x1b]52;c;${payload}\x07`);
            });
          });
          if (result.status === "blocked") {
            throw new Error("clipboard output is backpressured; retry after output is ready");
          }
        },
      });
      mountedClipboard = clipboard;
      mountedAppContext = appContext;
      // Reserve the stream only after every mount option and session fact needed
      // above has been read successfully. From this point teardown can always
      // find mountedAppContext and release the reservation on a setup failure.
      liveInstances.set(stdout, app);
      mountedAsOwner = true;
      changeRuntimeResource("streamReservations", 1);
      mountedRenderSession = renderSession;
      // From stream reservation through Vue's first render and final listener
      // wiring, a synchronous host callback may request teardown but may not run
      // it in the middle of terminal acquisition or before Vue finishes mount.
      leaveMountLifecycleTransaction = enterLifecycleTransaction();

      // Everything after stdout reservation is one mount transaction. Listener
      // registration happens before the first terminal acquisition, and any later
      // failure rolls back through the same complete teardown path.
      // process.exit() never returns after the synchronous `exit` event. It
      // therefore cannot wait for an enclosing render transaction to unwind;
      // restore immediately and skip user-facing final rendering callbacks.
      const exitListener = () => teardown(true, true);
      process.on("exit", exitListener);
      mountedExitListener = exitListener;
      releaseMountedExitListener = acquireRuntimeResource("processListeners");

      // Termination cleanup is independent from output cadence. A final-output
      // app can still acquire raw, paste, mouse, or explicit Kitty state through
      // input composables, so every real mount gets the same idempotent handler.
      // signal-exit re-raises the terminating signal as soon as this callback
      // returns, so this path has the same non-returning cleanup requirement as
      // process.exit().
      mountedUnsubscribeExit = trackProcessListenerCleanup(
        onExit(() => teardown(true, true), { alwaysLast: false }),
      );

      // Install job-control interception before raw mode, Kitty, cursor, or the
      // alternate screen can be acquired. The stable delegates above inspect
      // only resources that have become available so far, so even a signal in a
      // partially initialized mount restores what that mount already owns.
      if (suspensionHost.supported) {
        mountedUnsubscribeSuspension = trackProcessListenerCleanup(
          suspensionHost.register({
            suspend: suspendSession,
            resume: resumeSession,
          }),
        );
      }

      // Register beforeExit on successful reservation rather than waiting for a
      // caller to request the promise. This lets natural event-loop drain flush a
      // deferred final frame and its stream barrier before Node exits.
      mountedBeforeExitHandler = () => app.unmount();
      process.once("beforeExit", mountedBeforeExitHandler);
      releaseMountedBeforeExitListener = acquireRuntimeResource("processListeners");

      let kittyController: ReturnType<typeof createKittyKeyboardController> | undefined;
      const stdinController = createStdinController(stdin, {
        appCtx: appContext,
        getMouseController: () => mountedMouseController,
        mouseProtocolAvailable,
        beforeManagedInputAcquire: ensureFullscreenSurface,
        isManagedInputSurfaceReady: () =>
          !terminalSuspended &&
          (!fixedFullscreenSurface || (mountedAlternateScreen && mountedFullscreenCursorHidden)),
        isKittyKeyboardReady: () => kittyController?.isReady ?? true,
        writeTerminalOutput,
        requestTerminalReconcile,
        onSgrMouseModeChange: testInputHost
          ? (level) => testInputHost.onMouseReportingChange(level === "hover" ? "drag" : level)
          : undefined,
        acquireKittyKeyboardDemand() {
          return kittyController?.acquireDemand() ?? (() => {});
        },
      });
      mountedStdinController = stdinController;
      if (testInputHost) {
        mountedTestInputHostDetach = testInputHost.bind((event) => {
          stdinController.injectTestMouse(event);
        });
      }

      // These pre-mount steps can throw SYNCHRONOUSLY on a hostile/broken
      // terminal: attachYoga() allocates a WASM yoga node, and later Vue setup
      // may acquire semantic input against a TTY whose raw-mode or protocol
      // operations fail. liveInstances.set(stdout, app) already ran above, so a
      // throw HERE — before the originalMount try/catch — would leak the registry entry
      // (poisoning the stdout: every later mount() hits the reuse guard and
      // no-ops), leak the yoga root, and leave raw mode / kitty on. Wrap these in
      // the same teardown-then-rethrow guard as originalMount so teardown()
      // (idempotent; safe at this early stage — it derives all cleanup from the
      // wired state set so far) restores everything and frees the registry entry,
      // while the caller still sees the original error.
      let tuiRoot: ReturnType<typeof createRoot>;
      try {
        kittyController = createKittyKeyboardController(
          stdin,
          stdout,
          stdinController.startKittyQueryResponseDetection,
          kittyKeyboard,
          writeTerminalOutput,
          requestTerminalReconcile,
        );
        // Register before Vue setup. Configuration is inert at mount; the first
        // semantic input demand asks this controller to query or push Kitty only
        // after raw mode, stdin ref ownership, and the shared listener exist.
        mountedKittyController = kittyController;
        reconcileManagedTerminalOutput = () => {
          try {
            kittyController?.reconcile();
            stdinController.reconcileTerminalState();
          } catch (error) {
            if (!teardownStarted) {
              appContext.exit(isErrorInput(error) ? error : new Error(messageForNonError(error)));
            }
          }
        };

        tuiRoot = createRoot(appContext);
        attachYoga(tuiRoot);
        // Record the root BEFORE setWidth so teardown's `if (mountedRoot)
        // detachYoga(mountedRoot)` frees the just-allocated yoga node even if
        // setWidth (or anything below) throws.
        mountedRoot = tuiRoot;
        tuiRoot.yoga.setWidth(renderSession.session.dimensions.layout.columns);
        const focusController = createInternalFocusController({
          root: tuiRoot,
          inputRouting: stdinController.internal_inputRouting,
        });
        mountedFocusController = focusController;
        const caretController = createInternalCaretController({
          focus: focusController,
          outputAvailable: targetedCaretOutputAvailable,
          requestPaint: () => scheduledCommit(),
        });
        mountedCaretController = caretController;
        const geometry = createInternalGeometryService(tuiRoot, () => scheduledCommit());
        mountedGeometry = geometry;
        if (isScreenReaderEnabled) geometry.setSurfaceAvailable(false);
        setInternalGeometryService(appContext, geometry);
        const textSelection = createInternalTextSelectionController({
          surfaceAvailable: fixedFullscreenSurface && !isScreenReaderEnabled,
          unavailableReason: isScreenReaderEnabled ? "screen-reader" : "host-unavailable",
          requestPaint: () => scheduledCommit(),
          clipboard: mountedClipboard!,
        });
        mountedTextSelection = textSelection;
        const mouseController = fixedFullscreenSurface
          ? createFullscreenMouseController({
              stdin: stdinController,
              geometry,
              protocolAvailable: mouseProtocolAvailable,
              requestPaint: () => scheduledCommit(),
              reportError(error) {
                appContext.exit(isErrorInput(error) ? error : new Error(messageForNonError(error)));
              },
            })
          : null;
        mountedMouseController = mouseController;
        setFullscreenMouseController(appContext, mouseController);
        const renderedTargets = createRenderedTargetController(tuiRoot, [
          focusController,
          geometry,
          ...(mouseController ? [mouseController] : []),
        ]);
        mountedRenderedTargets = renderedTargets;
        setRenderedTargetController(appContext, renderedTargets);
      } catch (err) {
        try {
          teardown(); // best-effort: free yoga, restore raw mode/kitty, evict registry entry
        } catch {
          // A failing best-effort restore must NOT replace `err` — the ORIGINAL
          // pre-mount error must survive and be rethrown (mirrors the
          // originalMount catch below).
        }
        throw err;
      }

      const writer = createFrameWriter(stdout, {
        incremental: incrementalRendering,
        write: (data) => writeRuntimeOutput(stdout, data),
      });
      mountedWriter = writer;

      function writerCaretPositionsEqual(
        left: WriterCaretPosition,
        right: WriterCaretPosition,
      ): boolean {
        return left?.x === right?.x && left?.y === right?.y;
      }

      function setWriterCaretPosition(position: WriterCaretPosition): void {
        if (writerCaretPositionsEqual(writerCaretDeclaration, position)) return;
        writer.setCursorPosition(position);
        writerCaretDeclaration = position;
      }

      function withWriterCaretOwnership<Value>(
        position: WriterCaretPosition,
        operation: () => Value,
      ): Value {
        const previousOwner = activeWriterCaretOwner;
        const owner: WriterCaretOwner = { position };
        activeWriterCaretOwner = owner;
        setWriterCaretPosition(position);
        try {
          return operation();
        } finally {
          activeWriterCaretOwner = previousOwner;
          // A nested coordinated write may have declared another caret. Restore
          // the enclosing frame's candidate before its physical write resumes.
          setWriterCaretPosition(previousOwner ? previousOwner.position : position);
        }
      }

      function createOutputStateRollback(): () => void {
        const rollbackWriter = writer.createRollback();
        const previousFrameState = { ...frameState };
        const previousInlineRegionStarted = inlineRegionStarted;
        const previousAlternateScreen = mountedAlternateScreen;
        const previousFullscreenCursorHidden = mountedFullscreenCursorHidden;
        const previousWriterCaretDeclaration = writerCaretDeclaration;
        const previousFullscreenBaselineValid = fullscreenBaselineValid;
        const previousFullscreenBaselineColumns = fullscreenBaselineColumns;
        const previousFullscreenBaselineRows = fullscreenBaselineRows;
        let active = true;

        return () => {
          if (!active) return;
          active = false;
          rollbackWriter();
          frameState.lastOutput = previousFrameState.lastOutput;
          frameState.lastOutputToRender = previousFrameState.lastOutputToRender;
          frameState.outputHeight = previousFrameState.outputHeight;
          inlineRegionStarted = previousInlineRegionStarted;
          setAlternateScreenOwned(previousAlternateScreen);
          setFullscreenCursorHidden(previousFullscreenCursorHidden);
          writerCaretDeclaration = previousWriterCaretDeclaration;
          fullscreenBaselineValid = previousFullscreenBaselineValid;
          fullscreenBaselineColumns = previousFullscreenBaselineColumns;
          fullscreenBaselineRows = previousFullscreenBaselineRows;
        };
      }
      mountedCreateOutputStateRollback = createOutputStateRollback;

      function ensureFullscreenSurface(): boolean {
        if (!fixedFullscreenSurface) return true;
        let accepted = true;
        if (!mountedAlternateScreen && !fullscreenEnterPending) {
          fullscreenBaselineValid = false;
          fullscreenEnterPending = true;
          if (
            !writeTerminalOutput(ansiEscapes.enterAlternativeScreen + "\x1b[H", () => {
              if (!fullscreenEnterPending) return;
              fullscreenEnterPending = false;
              setAlternateScreenOwned(true);
              requestTerminalReconcile();
            })
          ) {
            fullscreenEnterPending = false;
            accepted = false;
          }
        }
        if (!mountedFullscreenCursorHidden && !fullscreenCursorHidePending) {
          fullscreenCursorHidePending = true;
          if (
            !writeTerminalOutput("\x1b[?25l", () => {
              if (!fullscreenCursorHidePending) return;
              fullscreenCursorHidePending = false;
              setFullscreenCursorHidden(true);
              requestTerminalReconcile();
            })
          ) {
            fullscreenCursorHidePending = false;
            accepted = false;
          }
        }
        return accepted;
      }

      let blockedClearRetryPending = false;
      mountedClear = () => {
        const rollback = createOutputStateRollback();
        let invalidateSurface = false;
        const result = runOutputTransaction(
          () => {
            runLifecycleTransaction(() => {
              if (!dynamicUpdatesLive || terminalSuspended) return;
              if (fixedFullscreenSurface) {
                fullscreenBaselineValid = false;
                ensureFullscreenSurface();
                runSynchronizedOutput(() => {
                  writeRuntimeOutput(stdout, hideCursorEscape + ansiEscapes.clearViewport);
                  writer.sync("", { cursor: false });
                });
                invalidateSurface = true;
                return;
              }
              if (isScreenReaderEnabled) {
                runSynchronizedOutput(() => {
                  if (frameState.outputHeight > 0) {
                    writeRuntimeOutput(stdout, ansiEscapes.eraseLines(frameState.outputHeight));
                  }
                  frameState.lastOutput = "";
                  frameState.lastOutputToRender = "";
                  frameState.outputHeight = 0;
                });
                invalidateSurface = true;
                return;
              }
              writer.clear();
              // The physical frame is now blank. Forget its row bookkeeping without
              // writing anything: recording the erased frame as a live baseline would
              // make a second clear/update walk upward into pre-app history. The logical
              // frameState remains available for a coordinated write to restore later,
              // while a real commit can paint it again from this owned origin.
              writer.reset({ cursorDirty: false });
              invalidateSurface = true;
            });
          },
          {
            onFullyHanded() {
              if (!invalidateSurface) return;
              mountedGeometry?.invalidateSurface();
              mountedTextSelection?.invalidateSurface();
            },
            onUnhandedFailure: rollback,
          },
        );
        if (result.status === "blocked" && !blockedClearRetryPending) {
          blockedClearRetryPending = true;
          void result.ready.then(
            () => {
              blockedClearRetryPending = false;
              if (!teardownStarted) mountedClear?.();
            },
            () => {
              blockedClearRetryPending = false;
            },
          );
        }
      };
      const synchronize = shouldSynchronize(stdout, dynamicUpdatesLive);

      function runSynchronizedOutput(body: () => void): void {
        if (!synchronize) {
          body();
          return;
        }

        let error: unknown;
        let releaseSynchronizedOutput: (() => void) | undefined;
        try {
          writeRuntimeOutput(stdout, bsu, undefined, () => {
            releaseSynchronizedOutput ??= acquireSynchronizedOutputLease();
          });
          body();
        } catch (caught) {
          error = caught;
        } finally {
          try {
            writeRuntimeOutput(stdout, esu, undefined, () => {
              releaseSynchronizedOutput?.();
              releaseSynchronizedOutput = undefined;
            });
          } catch (caught) {
            error ??= caught;
          }
        }
        if (error !== undefined) throw error;
      }

      function runCoordinatedWrite(body: () => void, finalize: () => void): void {
        let error: unknown;
        let bodyStarted = false;
        let syncStarted = false;
        let releaseSynchronizedOutput: (() => void) | undefined;
        try {
          if (synchronize) {
            writeRuntimeOutput(stdout, bsu, undefined, () => {
              releaseSynchronizedOutput ??= acquireSynchronizedOutputLease();
            });
            syncStarted = true;
          }
          bodyStarted = true;
          body();
        } catch (caught) {
          error = caught;
        } finally {
          if (bodyStarted) {
            try {
              finalize();
            } catch (caught) {
              error ??= caught;
            }
          }
          if (syncStarted) {
            try {
              writeRuntimeOutput(stdout, esu, undefined, () => {
                releaseSynchronizedOutput?.();
                releaseSynchronizedOutput = undefined;
              });
            } catch (caught) {
              error ??= caught;
            }
          }
        }
        if (error !== undefined) throw error;
      }

      function repaintTranscript(writeBefore: () => void) {
        runCoordinatedWrite(
          () => {
            if (frameState.outputHeight > 0) {
              writeRuntimeOutput(stdout, ansiEscapes.eraseLines(frameState.outputHeight));
            }
            writeBefore();
          },
          () => {
            // Preserve the existing transcript updater's empty-frame fallback:
            // after a coordinated write an empty live region still restores one
            // newline (`lastOutput + "\n"`), matching the pinned Ink behavior.
            writeRuntimeOutput(stdout, frameState.lastOutput || "\n");
          },
        );
      }

      function repaintFullscreen(
        output: string,
        options: {
          readonly writeBefore?: () => void;
          /** Side-channel output invalidates every row, even when frame text is unchanged. */
          readonly forceFull?: boolean;
          /** Present for a new render frame, including an explicit hidden caret. */
          readonly frameCaret?: { readonly position: InternalPreparedCaretFrame["position"] };
        } = {},
      ) {
        const caretPosition = options.frameCaret
          ? options.frameCaret.position
          : activeWriterCaretOwner
            ? activeWriterCaretOwner.position
            : mountedCaretController?.writerPosition;
        const viewportColumns = renderSession.session.dimensions.layout.columns;
        const viewportRows = renderSession.session.dimensions.layout.rows;
        const dimensionsMatch =
          fullscreenBaselineColumns === viewportColumns && fullscreenBaselineRows === viewportRows;
        const caretUnchanged =
          writerCaretDeclaration?.x === caretPosition?.x &&
          writerCaretDeclaration?.y === caretPosition?.y;
        if (
          options.writeBefore === undefined &&
          fullscreenBaselineValid &&
          dimensionsMatch &&
          output === frameState.lastOutput &&
          caretUnchanged
        ) {
          return;
        }
        withWriterCaretOwnership(caretPosition, () =>
          runLifecycleTransaction(() => {
            ensureFullscreenSurface();
            const previousRows = frameState.lastOutput.split("\n");
            const nextRows = output.split("\n");
            const canDiff =
              options.forceFull !== true &&
              fullscreenBaselineValid &&
              dimensionsMatch &&
              viewportRows !== null &&
              previousRows.length === viewportRows &&
              nextRows.length === viewportRows;
            runCoordinatedWrite(
              () => {
                // A declared caret may be visible after the previous sync. Hide it
                // before either a full repaint or absolute row replacements.
                writeRuntimeOutput(stdout, hideCursorEscape);
                options.writeBefore?.();
              },
              () => {
                setWriterCaretPosition(caretPosition);
                if (canDiff) {
                  const changedRows: string[] = [];
                  for (let row = 0; row < viewportRows; row++) {
                    if (previousRows[row] === nextRows[row]) continue;
                    changedRows.push(
                      ansiEscapes.cursorTo(0, row),
                      "\x1b[0m",
                      nextRows[row]!,
                      "\x1b[0m",
                      ansiEscapes.eraseEndLine,
                    );
                  }
                  // FrameWriter.sync() places a semantic caret relative to the
                  // frame bottom. Re-establish that physical anchor even for a
                  // caret-only update with no changed rows.
                  changedRows.push(ansiEscapes.cursorTo(0, Math.max(0, viewportRows - 1)));
                  writeRuntimeOutput(stdout, changedRows.join(""));
                } else {
                  writeRuntimeOutput(stdout, ansiEscapes.clearViewport + output);
                }
                writer.sync(output);
              },
            );

            frameState.lastOutput = output;
            frameState.lastOutputToRender = output;
            frameState.outputHeight = output === "" ? 0 : output.split("\n").length;
            fullscreenBaselineValid = true;
            fullscreenBaselineColumns = viewportColumns;
            fullscreenBaselineRows = viewportRows;
          }),
        );
      }

      function renderInteractiveFrame(
        output: string,
        outputHeight: number,
        preparedStatic: PreparedStaticOutput,
        caretFrame: InternalPreparedCaretFrame,
        staticHooks?: {
          readonly onHandoff: () => void;
          readonly onPrepared: () => void;
        },
      ) {
        return withWriterCaretOwnership(caretFrame.position, () =>
          renderInteractiveFrameWithOwnedCaret(
            output,
            outputHeight,
            preparedStatic,
            caretFrame,
            staticHooks,
          ),
        );
      }

      function writePreparedStatic(
        prepared: PreparedStaticOutput,
        chunk: string,
        onHandoff?: () => void,
      ): void {
        writeRuntimeOutput(stdout, chunk, undefined, () => {
          onHandoff?.();
          // A normally returned write, including `false`, owns this exact
          // history prefix. A later dynamic segment may still fail without
          // making the accepted history eligible for replay.
          prepared.accept();
        });
      }

      function renderInteractiveFrameWithOwnedCaret(
        output: string,
        outputHeight: number,
        preparedStatic: PreparedStaticOutput,
        caretFrame: InternalPreparedCaretFrame,
        staticHooks?: {
          readonly onHandoff: () => void;
          readonly onPrepared: () => void;
        },
      ) {
        const staticOutput = preparedStatic.output;
        const hasStaticOutput = staticOutput !== "";
        const isTty = !!stdout.isTTY;
        const viewportRows = renderSession.session.dimensions.layout.rows;

        if (fixedFullscreenSurface) {
          repaintFullscreen(output, { frameCaret: { position: caretFrame.position } });
          return;
        }

        if (output !== "" || hasStaticOutput || writer.isCursorDirty()) {
          ensureInlineRegionStart();
        }

        // A frame that fills or exceeds the viewport gets no trailing newline.
        // Only apply when writing to a real TTY — piped output always gets trailing newlines.
        const fillsViewport = isTty && viewportRows !== null && outputHeight >= viewportRows;
        // SR parity (G17 + G46): Ink's screen-reader branch (ink.tsx:617-621)
        // writes the wrapped output verbatim — `stdout.write(erase + wrappedOutput)`
        // with `lastOutputToRender = wrappedOutput` (NO appended "\n" in ANY case)
        // and `lastOutputHeight = wrappedOutput === "" ? 0 : split("\n").length`.
        // So EVERY SR frame, empty or not, must skip the trailing newline: an empty
        // frame emits zero lines instead of a spurious blank line (G17), and a
        // non-empty multi-line frame keeps its true line count so the next-frame
        // erase is eraseLines(N), not eraseLines(N+1) (G46 off-by-one). Non-SR
        // interactive frames are untouched — they still append "\n" as before.
        const outputToRender = fillsViewport || isScreenReaderEnabled ? output : output + "\n";

        if (hasStaticOutput) {
          // Clear frame -> write static -> re-render frame via log-update
          runSynchronizedOutput(() => {
            writer.clear();
            writePreparedStatic(preparedStatic, staticOutput, staticHooks?.onHandoff);
            staticHooks?.onPrepared();
            writer.write(outputToRender);
          });
        } else {
          // Mirror Ink's TWO-LEVEL commit gate, which keeps the synchronized-update
          // wrapper and the "should we touch log-update at all" decision separate:
          //
          //  - Outer gate (ink.tsx:1094 `output !== lastOutput || log.isCursorDirty()`):
          //    decides whether to call the (throttled) log at all. It compares the RAW
          //    frame (`output`, no trailing "\n") against the PREVIOUS frame
          //    (frameState.lastOutput, set at the end of this fn) — NOT log-update's
          //    \n-suffixed previousOutput. This is load-bearing for the empty-frame
          //    case: on the first commit of an app that renders nothing, both are ""
          //    so the gate is false and log-update — including its LAZY cursor hide —
          //    is never reached, so the initial empty commit emits no log-update
          //    cursor escapes (the cursor stays visible), matching Ink. Using
          //    willRender(outputToRender) here
          //    instead would compare "\n" against "" and wrongly fire the hide. A
          //    cursor-only move whose position is unchanged is still dirty, so the
          //    `|| isCursorDirty` disjunct keeps it reaching log-update.
          //  - Inner gate (ink.tsx:372-382, inside throttledLog): wraps the write in
          //    BSU/ESU only when `willRender(output)` is true. The cursor-dirty-but-not-
          //    willRender case calls log-update WITHOUT the BSU/ESU wrapper, so the dirty
          //    flag is reset and the write no-ops cleanly — Ink emits ZERO bytes there,
          //    not an empty `BSU`+`ESU` pair.
          //
          // willRender()/isCursorDirty() must be read BEFORE writer.write():
          // log-update's render consumes/resets isCursorDirty, so reading them
          // afterwards would be stale. Both reads are pure (no mutation), and the
          // bsu/esu wrapper is gated on this single pre-write snapshot.
          const willRender = writer.willRender(outputToRender);
          if (output !== frameState.lastOutput || writer.isCursorDirty()) {
            const shouldWrap = synchronize && willRender;
            if (shouldWrap) runSynchronizedOutput(() => writer.write(outputToRender));
            else writer.write(outputToRender);
          }
        }

        frameState.lastOutput = output;
        frameState.lastOutputToRender = outputToRender;
        frameState.outputHeight = outputHeight;
      }

      function markBoundaryErrorFrameRendered(frame: string): void {
        const errorMessage =
          pendingBoundaryError === undefined ? "" : messageForNonError(pendingBoundaryError);
        // A successful write is not enough when the bounded viewport clipped the
        // entire error message. In that case the rich overview is not durable and
        // teardown must still emit the complete plain-text report to stderr.
        const messageIsVisible =
          errorMessage === "" ? frame.trim().length > 0 : frame.includes(errorMessage);
        if (
          messageIsVisible &&
          !pendingBoundaryFrameWriteFailed &&
          mountedBoundaryErrorsAreDurable &&
          pendingBoundaryError !== undefined &&
          pendingBoundaryFrameReady === pendingBoundaryError &&
          pendingExitError === pendingBoundaryError
        ) {
          pendingExitErrorWasRendered = true;
        }
      }

      // Produce the dynamic frame for a given terminal width. In screen-reader
      // mode the tree is linearized to flat plain text (no borders / 2D grid)
      // via renderScreenReaderOutput, then wrapped with wrapAnsi(trim:false,
      // hard:true) — matching Ink's onRender SR branch (ink.tsx:598-603). The
      // <Static> channel is excluded here (skipStaticElements) just like
      // render-to-string.ts; static output is handled separately by commit().
      function renderFrame(
        width: number,
        viewportRows?: number,
        geometry?: InternalGeometryPaintFrame,
        selection?: InternalSelectionPaintFrame,
      ): string {
        if (!isScreenReaderEnabled) {
          const output = paint(tuiRoot, {
            viewport: viewportRows === undefined ? undefined : { width, height: viewportRows },
            geometry,
            selection,
          });
          // The hard paint viewport is the primary guard. Keep a final physical
          // row bound as defense-in-depth for future paint extensions: Inline
          // must never let an application frame exceed terminal-addressable rows.
          return boundedInlineSurface && viewportRows !== undefined
            ? output.split("\n").slice(0, viewportRows).join("\n")
            : output;
        }
        const linear = renderScreenReaderOutput(tuiRoot, { skipStaticElements: true });
        return wrapAnsi(linear, width, { trim: false, hard: true });
      }

      let blockedFrameRetryPending = false;

      function requestBlockedFrameRetry(ready: Promise<void>): void {
        if (blockedFrameRetryPending || teardownStarted) return;
        blockedFrameRetryPending = true;
        void ready.then(
          () => {
            blockedFrameRetryPending = false;
            if (!teardownStarted && !terminalSuspended) scheduledCommit();
          },
          () => {
            // The coordinator reports the deferred stream failure through the
            // application's fatal lifecycle boundary.
            blockedFrameRetryPending = false;
          },
        );
      }

      interface CommitSettlementHooks {
        readonly register: (
          accept: () => void,
          abandon: (options: { readonly physicalFailure: boolean }) => void,
        ) => void;
        readonly markStaticHanded: () => void;
        readonly capturePostStaticRollback: () => void;
      }

      function commit(
        options: {
          readonly beforeFrame?: () => void;
          readonly onAccepted?: () => void;
          readonly retryWhenBlocked?: boolean;
        } = {},
      ): CoordinatedWriteResult {
        if (outputCoordinator.isBlocked()) {
          const blocked = blockedCoordinatedWrite();
          if (options.retryWhenBlocked !== false) requestBlockedFrameRetry(blocked.ready);
          return blocked;
        }
        if (pendingExitErrorIsSilent) return acceptedCoordinatedWrite;
        if (rejectedFullscreenStatic) return acceptedCoordinatedWrite;
        if (terminalSuspended && !terminalResumePainting) return acceptedCoordinatedWrite;
        if (rejectUnsupportedFullscreenStatic()) return acceptedCoordinatedWrite;

        // Fullscreen ownership must be physically established before user
        // onRender callbacks run. Keep acquisition as its own finite transaction:
        // if it backpressures, the frame is prepared only after drain; if a callback
        // terminates during the later frame, emergency teardown can restore a
        // surface that the stream has already accepted.
        if (fixedFullscreenSurface && (!mountedAlternateScreen || !mountedFullscreenCursorHidden)) {
          let surface: CoordinatedWriteResult;
          try {
            surface = runOutputTransaction(() => {
              // A rendered focus or pointer target can establish managed-input
              // demand only after Vue has attached its host node. Reconcile it
              // before the first terminal mutation so a non-controllable stdin
              // fails without briefly entering and restoring Fullscreen.
              mountedRenderedTargets?.reconcile();
              ensureFullscreenSurface();
            });
          } catch (error) {
            if (isErrorInput(error) && isExpectedManagedInputUnavailableError(error)) {
              captureComponentError(error);
              return acceptedCoordinatedWrite;
            }
            throw error;
          }
          if (surface.status === "blocked") {
            if (options.retryWhenBlocked !== false) requestBlockedFrameRetry(surface.ready);
            return surface;
          }
          if (!surface.writable) {
            if (options.retryWhenBlocked !== false) requestBlockedFrameRetry(surface.ready);
            return surface;
          }
        }

        let acceptCommit = () => {};
        let abandonCommit = (_options: { readonly physicalFailure: boolean }) => {};
        let settlementRegistered = false;
        let bodyCompleted = false;
        let staticHanded = false;
        const initialRollback = createOutputStateRollback();
        let postStaticRollback: (() => void) | undefined;

        let result: CoordinatedWriteResult;
        try {
          result = runOutputTransaction(
            () => {
              options.beforeFrame?.();
              commitFrame({
                register(accept, abandon) {
                  if (settlementRegistered) {
                    throw new Error("A render commit registered settlement more than once.");
                  }
                  settlementRegistered = true;
                  acceptCommit = accept;
                  abandonCommit = abandon;
                },
                markStaticHanded() {
                  staticHanded = true;
                },
                capturePostStaticRollback() {
                  postStaticRollback ??= createOutputStateRollback();
                },
              });
              bodyCompleted = true;
            },
            {
              onFullyHanded() {
                acceptCommit();
                options.onAccepted?.();
              },
              onUnhandedFailure() {
                if (staticHanded && postStaticRollback) postStaticRollback();
                else initialRollback();
                abandonCommit({ physicalFailure: bodyCompleted });
              },
            },
          );
        } catch (error) {
          if (isErrorInput(error) && isExpectedManagedInputUnavailableError(error)) {
            captureComponentError(error);
            return acceptedCoordinatedWrite;
          }
          throw error;
        }
        if (result.status === "blocked" && options.retryWhenBlocked !== false) {
          requestBlockedFrameRetry(result.ready);
        }
        return result;
      }

      function commitFrame(hooks: CommitSettlementHooks) {
        if (pendingExitErrorIsSilent) return;
        if (rejectedFullscreenStatic) return;
        if (terminalSuspended && !terminalResumePainting) return;
        const staticNodes = findStatics(tuiRoot);
        if (rejectUnsupportedFullscreenStatic(staticNodes)) return;
        const leaveLifecycleTransaction = enterLifecycleTransaction();
        const releasePreparedFrame = acquireRuntimeResource("preparedFrames");
        let geometryFrame: InternalGeometryPaintFrame | undefined;
        let selectionFrame: InternalSelectionPaintFrame | undefined;
        let caretFrame: InternalPreparedCaretFrame | undefined;
        let mouseFrame: PreparedMouseFrame | undefined;
        let preparedStatic: PreparedStaticOutput | undefined;
        let boundaryFrame: string | undefined;
        let settled = false;

        const releasePreparedState = (): void => {
          try {
            caretFrame?.discard();
            mouseFrame?.discard();
            selectionFrame?.discard();
            geometryFrame?.discard();
          } finally {
            releasePreparedFrame();
            leaveLifecycleTransaction();
          }
        };
        const accept = (): void => {
          if (settled) return;
          settled = true;
          try {
            geometryFrame?.commit();
            selectionFrame?.accept();
            mouseFrame?.accept();
            caretFrame?.accept();
            preparedStatic?.accept();
            if (boundaryFrame !== undefined) markBoundaryErrorFrameRendered(boundaryFrame);
          } finally {
            releasePreparedState();
          }
        };
        const abandon = ({ physicalFailure }: { readonly physicalFailure: boolean }): void => {
          if (settled) return;
          settled = true;
          try {
            if (caretFrame) setWriterCaretPosition(caretFrame.previousPosition);
            if (physicalFailure) {
              preparedStatic?.abandon();
              mouseFrame?.abandon();
            }
            if (
              pendingBoundaryError !== undefined &&
              pendingBoundaryFrameReady === pendingBoundaryError &&
              pendingExitError === pendingBoundaryError
            ) {
              pendingBoundaryFrameWriteFailed = true;
            }
          } finally {
            releasePreparedState();
          }
        };
        hooks.register(accept, abandon);

        const start = onRender ? performance.now() : 0;
        mountedRenderedTargets?.reconcile();

        // Prepare Static output without advancing its component cursors. The
        // transaction is accepted only after its physical stdout write returns
        // normally, or after a successful output-free renderer commit.
        const w = renderSession.session.dimensions.layout.columns;
        preparedStatic = prepareStaticOutput(tuiRoot, w, isScreenReaderEnabled, staticNodes);
        const staticOutput = preparedStatic.output;
        const hasStaticOutput = staticOutput !== "" && staticOutput !== "\n";
        if (!dynamicUpdatesLive) {
          // Non-interactive: compute the dynamic frame now, write static output
          // after onRender, and defer dynamic frame output until unmount.
          tuiRoot.yoga.setWidth(w);
          const restoreLayoutGuards = calculateLayoutWithContentGuards(
            tuiRoot,
            w,
            undefined,
            Yoga.DIRECTION_LTR,
          );
          try {
            geometryFrame = mountedGeometry?.beginFrame();
            selectionFrame = mountedTextSelection?.beginFrame();
            const frame = renderFrame(w, undefined, geometryFrame, selectionFrame);
            renderObserver?.onCommit?.({
              dynamic: frame,
              staticOutput: hasStaticOutput ? staticOutput : "",
              phase: teardownStarted ? "teardown" : "update",
            });
            frameState.lastOutput = frame;
            frameState.lastOutputToRender = frame + "\n";
            frameState.outputHeight = frame === "" ? 0 : frame.split("\n").length;
            if (onRender) onRender({ renderTime: performance.now() - start });
            if (hasStaticOutput) {
              writePreparedStatic(preparedStatic, staticOutput, hooks.markStaticHanded);
            }
          } finally {
            restoreLayoutGuards();
          }
          return;
        }

        const exactViewportRows = fixedFullscreenSurface
          ? (renderSession.session.dimensions.layout.rows ?? undefined)
          : undefined;
        tuiRoot.yoga.setWidth(w);
        let restoreLayoutGuards = calculateLayoutWithContentGuards(
          tuiRoot,
          w,
          exactViewportRows,
          Yoga.DIRECTION_LTR,
        );
        try {
          const inlineMaximumRows = boundedInlineSurface
            ? (renderSession.session.dimensions.layout.rows ?? undefined)
            : undefined;
          if (
            inlineMaximumRows !== undefined &&
            tuiRoot.yoga.getComputedLayout().height > inlineMaximumRows
          ) {
            // A permanent Yoga max-height changes how nested percentage heights
            // resolve even when the natural tree is short (for example, 50% of a
            // six-row Box incorrectly becomes 50% of the terminal). Compute the
            // natural tree first, and only rerun with an exact available height
            // when it actually exceeds Inline's maximum. This gives overflowing
            // flex layouts a real rows-sized allocation without padding or
            // perturbing short layouts.
            restoreLayoutGuards();
            restoreLayoutGuards = calculateLayoutWithContentGuards(
              tuiRoot,
              w,
              inlineMaximumRows,
              Yoga.DIRECTION_LTR,
            );
          }
          const computedRootHeight = Math.max(
            0,
            Math.floor(tuiRoot.yoga.getComputedLayout().height),
          );
          const inlineViewportRows = boundedInlineSurface
            ? Math.min(
                renderSession.session.dimensions.layout.rows ?? computedRootHeight,
                computedRootHeight,
              )
            : undefined;
          const paintViewportRows = exactViewportRows ?? inlineViewportRows;
          geometryFrame = isScreenReaderEnabled ? undefined : mountedGeometry?.beginFrame();
          selectionFrame = isScreenReaderEnabled ? undefined : mountedTextSelection?.beginFrame();
          const frame = renderFrame(w, paintViewportRows, geometryFrame, selectionFrame);
          if (geometryFrame && mountedMouseController) {
            mouseFrame = mountedMouseController.prepareFrame(geometryFrame);
          }
          if (geometryFrame && mountedCaretController) {
            caretFrame = mountedCaretController.prepareFrame(
              geometryFrame,
              terminalResumePainting
                ? { outputAvailable: targetedCaretOutputAvailable }
                : undefined,
            );
          }
          renderObserver?.onCommit?.({
            dynamic: frame,
            staticOutput: hasStaticOutput ? staticOutput : "",
            phase: teardownStarted ? "teardown" : "update",
          });
          const outputHeight = frame === "" ? 0 : frame.split("\n").length;

          if (fixedFullscreenSurface) {
            // A setup-owned managed-input demand may already have acquired
            // the surface after its capability preflight. Input-free mounts
            // reach this idempotent acquisition only after renderer-owned
            // target, geometry, selection, mouse, and caret preparation has
            // succeeded. Either path owns Fullscreen before a user onRender
            // callback can terminate the process synchronously.
            ensureFullscreenSurface();
            if (onRender) onRender({ renderTime: performance.now() - start });
            renderInteractiveFrame(frame, outputHeight, preparedStatic, caretFrame!, {
              onHandoff: hooks.markStaticHanded,
              onPrepared: hooks.capturePostStaticRollback,
            });
            mouseFrame?.stage();
            return;
          }

          if (isScreenReaderEnabled) {
            // Dedicated screen-reader write path (Ink parity G59), mirroring Ink's
            // onRender SR branch (ink.tsx:573-625). It writes the transcript with a
            // RAW stdout.write using manual ansiEscapes.eraseLines(previousHeight) +
            // (inline static, if any) + the wrapped output, then RETURNS — before the
            // normal interactive frame path. Crucially it:
            //   - never emits a whole-terminal reset, so a tall transcript cannot
            //     delete terminal-owned scrollback;
            //   - emits new Static content once instead of retaining/replaying it;
            //   - never routes through the log-update writer (raw writes only);
            //   - leaves the cursor visible (the mount-time hide is skipped for SR).
            // `frame` is already the wrapped SR output (renderFrame -> wrapAnsi), so
            // it plays the role of Ink's `wrappedOutput`.
            if (onRender) onRender({ renderTime: performance.now() - start });
            if (frame !== "" || hasStaticOutput) ensureInlineRegionStart();
            runSynchronizedOutput(() => {
              if (hasStaticOutput) {
                // Erase the previous main output before writing new static output
                // (ink.tsx:579-588), then reset the tracked height to 0.
                const erase =
                  frameState.outputHeight > 0
                    ? ansiEscapes.eraseLines(frameState.outputHeight)
                    : "";
                writePreparedStatic(preparedStatic!, erase + staticOutput, hooks.markStaticHanded);
                frameState.outputHeight = 0;
                hooks.capturePostStaticRollback();
              }

              if (frame === frameState.lastOutput && !hasStaticOutput) return;

              if (hasStaticOutput) {
                // Already erased above; write the wrapped output directly.
                writeRuntimeOutput(stdout, frame);
              } else {
                const erase =
                  frameState.outputHeight > 0
                    ? ansiEscapes.eraseLines(frameState.outputHeight)
                    : "";
                writeRuntimeOutput(stdout, erase + frame);
              }

              // Match Ink: lastOutputToRender = wrappedOutput (NO appended "\n" in ANY
              // case — empty frame => 0 lines, multi-line frame keeps its true count so
              // the next-frame erase is eraseLines(N), not eraseLines(N+1)).
              frameState.lastOutput = frame;
              frameState.lastOutputToRender = frame;
              frameState.outputHeight = frame === "" ? 0 : frame.split("\n").length;
            });
            boundaryFrame = frame;
            return;
          }

          // Interactive path
          if (onRender) onRender({ renderTime: performance.now() - start });
          renderInteractiveFrame(frame, outputHeight, preparedStatic, caretFrame!, {
            onHandoff: hooks.markStaticHanded,
            onPrepared: hooks.capturePostStaticRollback,
          });
          boundaryFrame = frame;
        } finally {
          restoreLayoutGuards();
        }
      }

      // A single render-throttle window derived from maxFps drives BOTH the
      // commit scheduler and the animation scheduler, mirroring Ink where one
      // `renderThrottleMs` (from `maxFps ?? 30`) throttles renders and is handed
      // to useAnimation (ink.tsx:337-344, 650). Screen-reader paths and
      // non-positive maxFps are unthrottled (0 = commit every tick), matching
      // Ink's `unthrottled` gate.
      const unthrottled = isScreenReaderEnabled || maxFps <= 0;
      const renderThrottleMs =
        !unthrottled && maxFps > 0 ? Math.max(1, Math.ceil(1000 / maxFps)) : 0;

      // Unthrottled screen-reader or maxFps<=0 commits fire every tick, so the
      // throttle window is unused there — renderThrottleMs is already 0. Otherwise
      // it's the maxFps-derived window (34ms at the default maxFps=30).
      const scheduler = createCommitScheduler(commit, {
        immediate: unthrottled,
        throttleMs: renderThrottleMs,
      });
      mountedScheduler = scheduler;
      mountedCommit = commit;
      prepareResumeSurface = () => commit;
      scheduledCommit = () => {
        if (!pendingExitErrorIsSilent && !terminalSuspended && !resizePaintPending) {
          scheduler.schedule();
        }
      };

      // Internal provides — set before the actual mount so components can inject
      // them. User .use/.provide calls made earlier on the chain stay intact;
      // our keys are Symbols so there's no collision risk.
      baseApp.provide(InternalRenderSessionKey, renderSession);
      baseApp.provide(AppContextKey, appContext);
      baseApp.provide(InternalFocusControllerKey, mountedFocusController!);
      baseApp.provide(InternalCaretControllerKey, mountedCaretController!);
      baseApp.provide(InternalClipboardServiceKey, mountedClipboard!);
      baseApp.provide(InternalTextSelectionControllerKey, mountedTextSelection!);
      baseApp.provide(StdinContextKey, stdinController);
      // useAnimation coalesces ticks within this same window so committed deltas
      // accumulate to the real wall-clock elapsed time (the value committed to
      // stdout), rather than a single scheduler interval. It shares the exact
      // renderThrottleMs the commit scheduler uses, so the animation cadence
      // tracks the actual commit cadence (Ink ink.tsx:650).
      const animationScheduler = createAnimationScheduler(renderThrottleMs);
      mountedAnimationScheduler = animationScheduler;
      baseApp.provide(AnimationSchedulerKey, animationScheduler);
      if (isDevConnected()) {
        baseApp.provide(DevStateKey, devState);
        // Register this app's INTERNAL teardown (not unmount()) with the HMR
        // bridge: on a full reload the bridge runs it to unmount this app before
        // the runner re-imports the entry. Using teardown() — not unmount() —
        // deliberately does NOT settle the exit promise, so a reload is not seen
        // as an app exit and the dev-server-close hook below stays untriggered.
        mountedDevTeardown = () => teardown();
        registerDevApp(mountedDevTeardown);
        // App-exit → dev-server teardown. In dev the app runs in-process under the
        // Vite dev server, which holds the event loop open (ports, watchers, the
        // module runner). When the app genuinely exits (useApp().exit(),
        // waitUntilExit() drain, error exit) the exit promise settles; signal the
        // dev plugin over the in-process hot channel (notifyDevExit → the plugin's
        // ssr.hot listener closes the server) so the process exits cleanly. A full
        // reload tears down via teardown() above and never settles this promise, so
        // it cannot reach here. The hot channel routes to THIS app's connected server
        // (bridgedHot), so there's no cross-server ambiguity — no process-global.
        // .finally derives a NEW promise that re-rejects on an error-exit; .catch it
        // so that chain can't surface as an unhandled rejection (the original
        // exitPromise is already .catch()-guarded above).
        void exitPromise.finally(() => notifyDevExit()).catch(() => {});
      }

      // Wire exit-with-error for the error boundary (must be set before mount).
      exitWithError = (e: Error) => appContext.exit(e);
      recordExitError = (e: Error, silent = false) => {
        // First-wins: don't overwrite an exit already decided (a clean exit() or a
        // prior error). Records the error so a racing unmount()'s resolveExit()
        // rejects with it instead of resolving clean (BUG #2). Mirrors the
        // synchronous record in appContext.exit() — pendingExitError is set here,
        // then the deferred exitWithError() drives teardown/resolveExit().
        if (!exitInitiated && !teardownStarted && pendingExitError === undefined) {
          pendingExitError = e;
          pendingExitErrorIsSilent = silent;
          if (!silent) {
            pendingBoundaryError = e;
            pendingExitErrorWasRendered = false;
            pendingBoundaryFrameWriteFailed = false;
          }
        }
      };

      // Patch console.log/warn/error etc. to route through writeToStdout /
      // writeToStderr so console output doesn't corrupt the rendered frame.
      // Installed BEFORE originalMount (matching Ink, which patches in its
      // constructor before the first render — ink.tsx:435-436): a dev-only
      // [Vue warn] emitted DURING the initial mount (e.g. the missing-render-
      // function warn when the root's setup() throws) must hit the filter too.
      // The mount-throw catch below runs teardown(), which restores the console,
      // so a synchronous mount failure cannot leak a patched console.
      if (patchConsole !== false) {
        try {
          mountedRestoreConsole = patchConsoleFn((stream, data) => {
            if (stream === "stdout") {
              appContext.writeToStdout(data);
            }
            if (stream === "stderr") {
              // Filter Vue internal warnings
              if (!data.startsWith("[Vue warn]")) {
                appContext.writeToStderr(data);
              }
            }
          });
        } catch {
          // patch-console uses console.Console which may not be available in
          // some environments (e.g., vitest workers). Degrade gracefully.
        }
      }

      // No eager mount-time cursor hide here (matching Ink). Ink hides the cursor
      // LAZILY: the non-alt-screen hide comes from log-update's isTTY-gated
      // cliCursor.hide on the first render that actually writes (log-update.ts:
      // 55-59), and the onRender outer gate skips log-update entirely for an empty
      // frame (ink.tsx:1094 `output !== lastOutput`, both "" on the first empty
      // commit). So an interactive app whose root renders nothing emits ZERO
      // cursor escapes — the cursor stays visible — while a non-empty semantic-caret
      // app hides on its first render via the same lazy path. The renderInteractive
      // commit gate below mirrors that `output !== frameState.lastOutput` outer
      // condition so the empty-frame skip (and thus the no-hide behavior) holds.
      //
      // Ordering for a semantic-caret app is preserved without an eager hide: log-update
      // hides-then-shows WITHIN a single render() (it hides at the top, then emits
      // the showCursor + cursorTo suffix for the active position), so the last
      // visibility change on the first frame is the SHOW — exactly Ink's ordering.
      //
      // Screen-reader mode leaves the cursor VISIBLE (Ink parity G59): its
      // dedicated write branch never routes through log-update, so no hide.
      // Fullscreen acquisition is lazy as well: after managed-input capability
      // preflight, the first input demand or commit enters the alternate screen
      // and hides the cursor before acquiring input modes or repainting.

      // Process-exit, termination, and suspension handlers are already wired
      // before terminal acquisition. This catch still routes renderer/patch-level
      // vnode failures that bypass onErrorCaptured through the same idempotent
      // rollback before preserving the original mount error.
      let proxy: ComponentPublicInstance;
      vueMountStarted = true;
      try {
        proxy = originalMount(tuiRoot) as unknown as ComponentPublicInstance;
        // A semantic route created during Vue setup can begin Kitty detection,
        // but its shared stdin ingress already exists. Ordinary input beside a
        // synchronous reply is retained until setup has installed the complete
        // initial route set, then delivered in its original order here.
        stdinController.activateInputDelivery();
      } catch (err) {
        try {
          teardown(); // best-effort cursor/alt-screen restore
        } catch {
          // teardown's restore write (mountedWriter.done() -> log-update
          // showCursor -> stdout.write("\x1b[?25h")) can itself throw if
          // stdout.write fails. A failing best-effort restore must NOT replace
          // `err` — the ORIGINAL mount error must always survive and be rethrown.
        }
        throw err;
      }

      // errorHandler as fallback for errors that bypass onErrorCaptured (e.g.
      // async errors in Vue's internal scheduler). The error boundary returns
      // false to stop propagation, so caught errors won't reach here.
      baseApp.config.errorHandler = (err) => {
        // Preserve a genuine (incl. cross-realm) Error so the original survives to
        // exit(); only wrap a true non-Error — with the SAME message ErrorOverview
        // displays (messageForNonError, e17). See isErrorInput / onErrorCaptured.
        appContext.exit(isErrorInput(err) ? err : new Error(messageForNonError(err)));
      };

      // Only listen for resize when dynamic output is live (matching Ink).
      // A resize is a discrete event that changes the viewport, so it bypasses
      // the normal ~32ms commit throttle. Dimension facts update immediately,
      // then the newest resize waits for Vue consumers before one authoritative
      // paint. Rapid events are coalesced without exposing an intermediate frame.
      if (dynamicUpdatesLive) {
        // Track the physical geometry that the current relative-writer baseline
        // was painted against. A real dimension change can invalidate that
        // baseline even when the logical component output is unchanged.
        let lastPaintedTerminalWidth = renderSession.session.dimensions.layout.columns;
        let lastPaintedTerminalRows = renderSession.session.dimensions.terminal?.rows ?? null;

        const prepareDimensionUpdate = (
          preferFreshProbe: boolean,
          allowWhileResuming: boolean,
        ): (() => CoordinatedWriteResult) | null => {
          if (terminalSuspended && !allowWhileResuming) return null;
          const nextDimensions = readCurrentDimensions(preferFreshProbe);
          // Once a visual terminal mode is acquired its immutable mode does not
          // flip to unavailable because of a transient invalid resize report.
          // Keep the last coherent pair and wait for the next valid event.
          if (nextDimensions === null) {
            // A live surface already has one last coherent size. Continuation
            // must still repaint it when a fresh query is temporarily
            // unavailable; only a normal resize event may wait for a valid pair.
            if (preferFreshProbe) {
              scheduler.cancel();
              return () => {
                scheduler.cancel();
                return commit();
              };
            }
            return null;
          }

          // Cancel any pending trailing commit before replacing the dimensions.
          // The prepared paint runs only after Vue has refreshed the host tree;
          // a second scheduled paint would be redundant and can race frame state.
          scheduler.cancel();

          const previousTerminalWidth = lastPaintedTerminalWidth;
          renderSession.updateDimensions(nextDimensions);
          const currentWidth = nextDimensions.layout.columns;
          const currentRows = nextDimensions.terminal?.rows ?? null;
          const dimensionsChanged =
            currentWidth !== previousTerminalWidth || currentRows !== lastPaintedTerminalRows;
          // A screen-reader transcript intentionally works even when rows are
          // unknown. Treat every resize event as invalidating its old physical
          // row mapping; an unbounded layout cannot prove otherwise.
          const inlineMappingChanged = dimensionsChanged || isScreenReaderEnabled;

          return () =>
            commit({
              retryWhenBlocked: false,
              beforeFrame() {
                // Vue may have scheduled a host commit while reacting to the new
                // dimensions. This explicit commit is the authoritative paint for
                // the resize/continue boundary.
                scheduler.cancel();
                if (inlineTerminalSurface && inlineMappingChanged && inlineRegionStarted) {
                  // Terminal reflow makes the old logical-line baseline untrustworthy:
                  // erasing it could touch terminal-owned rows. Leave that snapshot
                  // immutable, move to the bottom of the resized viewport, establish a
                  // fresh row, forget writer bookkeeping without emitting erase bytes,
                  // and paint the new bounded region from scratch.
                  runSynchronizedOutput(() => {
                    if (!isScreenReaderEnabled) writeRuntimeOutput(stdout, hideCursorEscape);
                    let bottomClampRows: number;
                    if (isScreenReaderEnabled) bottomClampRows = TERMINAL_BOTTOM_CLAMP_ROWS;
                    else if (currentRows !== null) bottomClampRows = currentRows;
                    else return;
                    writeRuntimeOutput(
                      stdout,
                      ansiEscapes.cursorDown(bottomClampRows) + nextLineEscape,
                    );
                    writer.reset();
                    frameState.lastOutput = "";
                    frameState.lastOutputToRender = "";
                    frameState.outputHeight = 0;
                  });
                } else if (currentWidth < previousTerminalWidth && !fixedFullscreenSurface) {
                  // Live non-terminal streams retain the existing relative-writer
                  // narrowing behavior; they do not claim terminal history ownership.
                  writer.clear();
                  frameState.lastOutput = "";
                  frameState.lastOutputToRender = "";
                }
              },
              onAccepted() {
                lastPaintedTerminalWidth = currentWidth;
                lastPaintedTerminalRows = currentRows;
              },
            });
        };

        let resizeRefreshRunning = false;
        const refreshPendingResize = async (): Promise<void> => {
          if (resizeRefreshRunning) return;
          resizeRefreshRunning = true;
          let preparedPaint: (() => CoordinatedWriteResult) | null = null;
          try {
            while (
              !teardownStarted &&
              !terminalSuspended &&
              resizeHandledGeneration < resizeEventGeneration
            ) {
              const observedGeneration = resizeEventGeneration;
              resizePaintPending = true;
              const nextPaint = runLifecycleTransaction(() => prepareDimensionUpdate(false, false));
              if (nextPaint) {
                preparedPaint = nextPaint;
                await nextTick();
              }

              if (teardownStarted || terminalSuspended) break;
              if (observedGeneration !== resizeEventGeneration) continue;

              if (preparedPaint) {
                const paintResult = runLifecycleTransaction(preparedPaint);
                preparedPaint = null;
                if (paintResult.status === "blocked") {
                  await paintResult.ready;
                  continue;
                }
                if (!paintResult.writable) await paintResult.ready;
              }
              resizeHandledGeneration = observedGeneration;
            }
          } catch (error) {
            resizeHandledGeneration = resizeEventGeneration;
            if (!teardownStarted) {
              appContext.exit(isErrorInput(error) ? error : new Error(messageForNonError(error)));
            }
          } finally {
            resizePaintPending = false;
            resizeRefreshRunning = false;
            if (
              !teardownStarted &&
              !terminalSuspended &&
              resizeHandledGeneration < resizeEventGeneration
            ) {
              requestPendingResizeRefresh();
            }
          }
        };
        requestPendingResizeRefresh = () => {
          if (
            resizeHandledGeneration >= resizeEventGeneration ||
            resizeRefreshRunning ||
            teardownStarted
          )
            return;
          const refresh = refreshPendingResize();
          mountedResizeRefresh = refresh;
          void refresh.then(() => {
            if (mountedResizeRefresh === refresh) mountedResizeRefresh = null;
          });
        };
        const onResize = () => {
          resizeEventGeneration++;
          requestPendingResizeRefresh();
        };
        prepareResumeSurface = () => prepareDimensionUpdate(true, true);
        stdout.on("resize", onResize);
        mountedResizeHandler = onResize;
        releaseMountedResizeListener = acquireRuntimeResource("streamListeners");
      }

      const leaveLifecycleTransaction = leaveMountLifecycleTransaction;
      leaveMountLifecycleTransaction = null;
      leaveLifecycleTransaction();
      if (pendingMountSuspension && !teardownStarted) {
        pendingMountSuspension = false;
        suspendSession();
      }
      return proxy;
    } catch (error) {
      const leaveLifecycleTransaction = leaveMountLifecycleTransaction;
      leaveMountLifecycleTransaction = null;
      leaveLifecycleTransaction?.();
      teardown();
      throw error;
    }
  };

  app.unmount = function unmount(): void {
    try {
      teardown();
    } finally {
      resolveExit();
    }
  };

  app.waitUntilExit = function waitUntilExit(): Promise<unknown> {
    return exitPromise;
  };

  // Hoisted so the injected appContext (built inside mount()) can expose the
  // SAME implementation via useApp().waitUntilRenderFlush — both the
  // TuiApp handle and the in-tree composable resolve identically.
  async function waitUntilRenderFlush(): Promise<void> {
    const stream = (mountedAppContext?.stdout ?? process.stdout) as MaybeWritableStream;
    const coordinator = mountedOutputCoordinator;

    // A blocked commit resolves its scheduler turn immediately, then registers
    // exactly one retry for `drain`. Loop through both layers so a waiter cannot
    // observe the old frame between those two turns.
    while (true) {
      while (mountedResizeRefresh) await mountedResizeRefresh;
      const terminalReconcile = mountedTerminalReconcile;
      if (terminalReconcile) {
        await terminalReconcile;
        continue;
      }
      if (coordinator?.isBlocked()) {
        try {
          await coordinator.waitForIdle();
        } catch {
          // The deferred failure is routed through app exit. Continue to the
          // ordinary writable-state fallback so this waiter never wedges.
        }
      }

      const { canWriteToStdout } = getWritableStreamState(stream);
      if (mountedScheduler) {
        if (canWriteToStdout) await mountedScheduler.flush();
        else mountedScheduler.cancel();
      }

      if (!coordinator?.isBlocked() && !mountedResizeRefresh && !mountedTerminalReconcile) break;
    }

    await writeOutputBarrier(stream);
  }
  app.waitUntilRenderFlush = waitUntilRenderFlush;

  app.clear = function clear(): void {
    mountedClear?.();
  };

  return app;
}

// --- Stdin controller ----------------------------------------------------

interface StdinController extends StdinContext {
  // sync (Finding A): on the signal-exit teardown path the restore escapes — here
  // the bracketed-paste-disable `\x1b[?2004l` — must be flushed synchronously
  // (fs.writeSync) so they reach the fd before signal-exit re-raises the signal.
  // Defaults to the async stdout.write path for normal unmount/exit.
  dispose: (sync?: boolean) => void;
  /** Temporarily release physical input modes without dropping logical consumers. */
  suspend: (sync?: boolean) => void;
  /** Reacquire the physical input modes still requested by logical consumers. */
  resume: () => void;
  /** Own the Kitty support reply on this controller's single physical stdin ingress. */
  startKittyQueryResponseDetection: StartKittyQueryResponseDetection;
  /** Deliver input retained while Vue installed the application's first route. */
  activateInputDelivery: () => void;
  /** Register desired semantic input without requiring immediate output capacity. */
  acquireSemanticInput: () => InternalInputRoutingDemandLease;
  /** Reconcile the newest semantic-input and terminal-mode desired state. */
  reconcileTerminalState: () => void;
  /** Forget control writes captured by a transaction that never handed them off. */
  abandonPendingTerminalOutput: (options?: { readonly physicalStateUncertain?: boolean }) => void;
  /** Adjust the private bracketed-paste reference count transactionally. */
  setBracketedPasteMode: (enabled: boolean) => void;
  /** Deterministic host handoff after parser normalization, scoped to this app. */
  injectTestMouse: (event: InternalTestMouseEvent) => void;
}

interface RawModeState {
  refs: number;
  // True between a last-release (refs→0) and the microtask that actually disables
  // raw mode. A same-tick re-acquire reads this to know raw mode is still
  // physically on, so it can skip re-issuing ref()/setRawMode(true) and cancel the
  // queued disable — Ink's pendingDisableRawModeRef (App.tsx:335-336,361-368).
  pendingDisable: boolean;
  baselineRaw: boolean;
  changedRawMode: boolean;
  activeRefs: number;
  physicalActive: boolean;
  physicalRawUncertain: boolean;
  physicalRefHeld: boolean;
  physicalRefUncertain: boolean;
  reconcilingPhysical: boolean;
  physicalReconcileRequested: boolean;
}
const rawModeRegistry = new WeakMap<NodeJS.ReadStream, RawModeState>();

function getRawModeState(stdin: NodeJS.ReadStream): RawModeState {
  let state = rawModeRegistry.get(stdin);
  if (!state) {
    state = {
      refs: 0,
      pendingDisable: false,
      baselineRaw: false,
      changedRawMode: false,
      activeRefs: 0,
      physicalActive: false,
      physicalRawUncertain: false,
      physicalRefHeld: false,
      physicalRefUncertain: false,
      reconcilingPhysical: false,
      physicalReconcileRequested: false,
    };
    rawModeRegistry.set(stdin, state);
  }
  return state;
}

interface CreateStdinControllerOptions {
  appCtx: AppContext;
  acquireKittyKeyboardDemand: () => () => void;
  isKittyKeyboardReady: () => boolean;
  getMouseController: () => FullscreenMouseController | null;
  /** Acquire the output surface after capability preflight and before input modes. */
  beforeManagedInputAcquire: () => boolean;
  isManagedInputSurfaceReady: () => boolean;
  /** The mount's selected real or deterministic xterm-compatible SGR profile. */
  mouseProtocolAvailable: boolean;
  /** Route async terminal-control bytes through the application's output gate. */
  writeTerminalOutput: (data: string, onHandoff?: () => void) => boolean;
  requestTerminalReconcile: () => void;
  onSgrMouseModeChange?: (level: SgrMouseMode | undefined) => void;
}

function createStdinController(
  stdin: NodeJS.ReadStream,
  opts: CreateStdinControllerOptions,
): StdinController {
  const { appCtx } = opts;
  const inputAvailability = createInputAvailabilityRef(classifyLiveInputAvailability(stdin));
  let controller!: StdinController;
  const inputRouting = createInternalInputRoutingRuntime(
    [{ id: "framework:ctrl-c", handle: runCtrlCDefault }],
    {
      acquire() {
        return controller.acquireSemanticInput();
      },
    },
  );
  const sharedIngress = getSharedStdinIngress(stdin);
  interface ApplicationInputSnapshot {
    readonly kind: "routes";
    readonly topology: InternalInputTopologySnapshot;
    readonly sgrMouseMode: SgrMouseMode | undefined;
    readonly mouse:
      | {
          readonly controller: FullscreenMouseController;
          readonly input: FullscreenMouseInputSnapshot;
        }
      | undefined;
    /** Whether this app had a logical managed-input owner when the fact began. */
    readonly managedInputActive: boolean;
  }
  interface BootstrapApplicationInputSnapshot {
    readonly kind: "bootstrap";
    resolved: ApplicationInputSnapshot | undefined;
  }
  type CapturedApplicationInputSnapshot =
    | ApplicationInputSnapshot
    | BootstrapApplicationInputSnapshot;
  interface PendingApplicationInput {
    readonly fact: NormalizedInputFact;
    readonly snapshot: CapturedApplicationInputSnapshot;
  }
  let sharedSubscription: SharedStdinSubscription;
  let sharedSubscriptionActive = false;
  let inputDeliveryActive = false;
  let drainingApplicationInput = false;
  const pendingApplicationInput: PendingApplicationInput[] = [];
  let pendingBootstrapInputSnapshot: BootstrapApplicationInputSnapshot | undefined = {
    kind: "bootstrap",
    resolved: undefined,
  };
  let bracketedPasteModeCount = 0;
  let pendingBracketedPasteMode: { readonly enabled: boolean } | undefined;
  let reconcilingBracketedPaste = false;
  let bracketedPasteReconcileRequested = false;
  let bracketedPasteSyncRequested = false;
  const sgrMouseModeTokens = new Map<symbol, SgrMouseMode>();
  let activeSgrMouseMode: SgrMouseMode | undefined;
  let pendingSgrMouseTransition:
    | { readonly kind: "enable"; readonly mode: SgrMouseMode }
    | { readonly kind: "disable"; readonly mode: SgrMouseMode }
    | { readonly kind: "cleanup" }
    | {
        readonly kind: "replace";
        readonly previous: SgrMouseMode;
        readonly mode: SgrMouseMode;
      }
    | undefined;
  let lastReportedSgrMouseMode: SgrMouseMode | undefined;
  let sgrMousePhysicalUncertain = false;
  let sgrMouseReenableBlocked = false;
  let reconcilingSgrMouse = false;
  let sgrMouseReconcileRequested = false;
  let sgrMouseSyncRequested = false;
  const ownedSgrMouseModes = new Set<SgrMouseMode>();
  let suspended = false;
  let disposed = false;
  let releaseKittyKeyboardDemand: (() => void) | undefined;
  let reconcilingKittyDemand = false;
  let kittyDemandReconcileRequested = false;
  let bracketedPastePhysicallyEnabled = false;
  let bracketedPastePhysicalUncertain = false;
  let localRefs = 0;
  // Physical semantic leases cover acquisition through deferred release. Their
  // published subset alone grants public/selected route eligibility. Low-level
  // mouse consumers remain separate logical raw demand through localRefs.
  let semanticPhysicalRefs = 0;
  let publishedSemanticRefs = 0;
  interface SemanticInputDemand {
    activationRequested: boolean;
    physicalAcquired: boolean;
    published: boolean;
    released: boolean;
  }
  const semanticInputDemands = new Set<SemanticInputDemand>();
  let reconcilingSemanticInput = false;
  let semanticInputReconcileRequested = false;
  let resumeAwaitingTerminalModes = false;

  // True once bracketed paste has been enabled at least once on this controller
  // (semantic input was active). Lets signal-exit teardown re-issue a SYNCHRONOUS
  // paste-OFF even after Vue's unmount already ran the async disable and zeroed
  // bracketedPasteModeCount (see dispose(sync) below).
  let everEnabledBracketedPaste = false;
  let everEnabledSgrMouse = false;

  // Write terminal-mode escapes only when stdout can still take them.
  // `isTTY` stays cached-truthy after a stream is destroy()ed/end()ed, so gating
  // the restore write on isTTY alone throws ERR_STREAM_DESTROYED on a teardown
  // where stdout is already gone. Mirror Ink's `canWriteToStdout` guard
  // (App.tsx:620/633-635): isTTY AND `!destroyed && !writableEnded`. Matches the
  // render-level writeBestEffort helper, which isn't in this function's scope.
  function canWriteTerminalMode(): boolean {
    const stdout = appCtx.stdout;
    return Boolean(stdout.isTTY) && !stdout.destroyed && !stdout.writableEnded;
  }

  function canUseSgrMouseMode(): boolean {
    return !disposed && !suspended && canWriteTerminalMode() && opts.mouseProtocolAvailable;
  }

  function writeTerminalMode(
    data: string,
    sync = false,
    onHandoff: () => void = () => {},
  ): boolean {
    if (!canWriteTerminalMode()) return false;
    const stdout = appCtx.stdout;
    if (sync) {
      // The base WriteStream type doesn't declare `fd`; tty/fs streams do.
      // Let failures propagate to the reconciler: OFF transitions are retried
      // once before the outer signal/suspension cleanup swallows the error.
      const streamFd = (stdout as { fd?: number }).fd;
      if (typeof streamFd === "number") {
        fsWriteSync(streamFd, data);
      } else if (stdout === process.stdout) {
        fsWriteSync(1, data);
      } else if (stdout === process.stderr) {
        fsWriteSync(2, data);
      } else {
        stdout.write(data);
      }
      onHandoff();
      return true;
    }
    return opts.writeTerminalOutput(data, onHandoff);
  }

  function runTerminalCleanup(operation: () => void): void {
    try {
      operation();
    } catch {
      // Terminal restoration is a best-effort transaction. A failed write for
      // one mode must not prevent the remaining modes or raw stdin from being
      // restored.
    }
  }

  function reconcileBracketedPasteMode(sync = false): void {
    bracketedPasteSyncRequested ||= sync;
    if (reconcilingBracketedPaste) {
      bracketedPasteReconcileRequested = true;
      return;
    }

    reconcilingBracketedPaste = true;
    try {
      while (true) {
        bracketedPasteReconcileRequested = false;
        const useSync = bracketedPasteSyncRequested;
        bracketedPasteSyncRequested = false;
        const shouldEnable =
          !disposed && !suspended && bracketedPasteModeCount > 0 && canWriteTerminalMode();
        if (pendingBracketedPasteMode) break;
        if (bracketedPastePhysicalUncertain) {
          const pending = { enabled: false } as const;
          pendingBracketedPasteMode = pending;
          try {
            const accepted = writeTerminalMode("\x1b[?2004l", useSync, () => {
              if (pendingBracketedPasteMode !== pending) return;
              pendingBracketedPasteMode = undefined;
              bracketedPastePhysicallyEnabled = false;
              bracketedPastePhysicalUncertain = false;
              opts.requestTerminalReconcile();
            });
            if (!accepted) {
              if (pendingBracketedPasteMode === pending) pendingBracketedPasteMode = undefined;
              opts.requestTerminalReconcile();
            }
          } catch (error) {
            if (pendingBracketedPasteMode === pending) pendingBracketedPasteMode = undefined;
            bracketedPastePhysicalUncertain = true;
            throw error;
          }
          break;
        }
        if (shouldEnable === bracketedPastePhysicallyEnabled && !bracketedPastePhysicalUncertain) {
          if (!bracketedPasteReconcileRequested) break;
          continue;
        }

        const pending = { enabled: shouldEnable } as const;
        pendingBracketedPasteMode = pending;
        try {
          const accepted = writeTerminalMode(
            shouldEnable ? "\x1b[?2004h" : "\x1b[?2004l",
            useSync,
            () => {
              if (pendingBracketedPasteMode !== pending) return;
              pendingBracketedPasteMode = undefined;
              bracketedPastePhysicallyEnabled = shouldEnable;
              bracketedPastePhysicalUncertain = false;
              if (shouldEnable) everEnabledBracketedPaste = true;
              opts.requestTerminalReconcile();
            },
          );
          if (!accepted) {
            if (pendingBracketedPasteMode === pending) {
              pendingBracketedPasteMode = undefined;
            }
            opts.requestTerminalReconcile();
            break;
          }
        } catch (error) {
          if (pendingBracketedPasteMode === pending) pendingBracketedPasteMode = undefined;
          bracketedPastePhysicalUncertain = true;
          throw error;
        }
        if (pendingBracketedPasteMode) break;
      }
    } finally {
      reconcilingBracketedPaste = false;
    }
  }

  // On an abrupt signal path Vue cleanup may already have issued the normal
  // async OFF and cleared the logical count. Re-issuing OFF synchronously is
  // idempotent and guarantees the restore reaches the terminal before re-raise.
  function forceDisableBracketedPaste(sync: boolean): void {
    writeTerminalMode("\x1b[?2004l", sync);
    pendingBracketedPasteMode = undefined;
    bracketedPastePhysicallyEnabled = false;
    bracketedPastePhysicalUncertain = false;
  }

  function mouseDisableSequence(levels: Iterable<SgrMouseMode>): string {
    const controls: string[] = [];
    const unique = new Set(levels);
    if (unique.has("hover")) controls.push("\x1b[?1003l");
    if (unique.has("drag")) controls.push("\x1b[?1002l");
    if (unique.has("button")) controls.push("\x1b[?1000l");
    if (unique.size > 0) controls.push("\x1b[?1006l");
    return controls.join("");
  }

  function disableSgrMouse(
    levels: Iterable<SgrMouseMode>,
    sync = false,
    onHandoff?: () => void,
  ): boolean {
    const sequence = mouseDisableSequence(levels);
    if (sequence === "") {
      onHandoff?.();
      return true;
    }
    return writeTerminalMode(sequence, sync, onHandoff);
  }

  function reissueIdempotentTerminalDisables(sync: boolean): void {
    if (everEnabledBracketedPaste) {
      runTerminalCleanup(() => forceDisableBracketedPaste(sync));
    }
    if (everEnabledSgrMouse) {
      runTerminalCleanup(() => {
        if (disableSgrMouse(ownedSgrMouseModes, sync)) {
          activeSgrMouseMode = undefined;
          sgrMousePhysicalUncertain = false;
        }
      });
    }
  }

  function mouseEnableSequence(level: SgrMouseMode): string {
    switch (level) {
      case "button":
        return "\x1b[?1000h\x1b[?1006h";
      case "drag":
        return "\x1b[?1002h\x1b[?1006h";
      case "hover":
        return "\x1b[?1003h\x1b[?1006h";
    }
  }

  function sgrMouseModeRank(level: SgrMouseMode): number {
    switch (level) {
      case "button":
        return 1;
      case "drag":
        return 2;
      case "hover":
        return 3;
    }
  }

  function highestRequestedSgrMouseMode(): SgrMouseMode | undefined {
    let highest: SgrMouseMode | undefined;
    for (const level of sgrMouseModeTokens.values()) {
      if (!highest || sgrMouseModeRank(level) > sgrMouseModeRank(highest)) {
        highest = level;
      }
    }
    return highest;
  }

  function reconcileSgrMouseMode(sync = false): void {
    sgrMouseSyncRequested ||= sync;
    if (reconcilingSgrMouse) {
      sgrMouseReconcileRequested = true;
      return;
    }

    reconcilingSgrMouse = true;
    try {
      while (true) {
        sgrMouseReconcileRequested = false;
        const useSync = sgrMouseSyncRequested;
        sgrMouseSyncRequested = false;
        const next =
          canUseSgrMouseMode() && !sgrMouseReenableBlocked
            ? highestRequestedSgrMouseMode()
            : undefined;
        if (pendingSgrMouseTransition) break;

        // A custom Writable may accept terminal bytes and then throw. Before
        // trusting either the last handed mode or the newest desired mode,
        // disable every mode Runtime may have enabled. Stop after that cleanup
        // transaction. A surviving owner may reacquire on the requested
        // reconcile turn unless the failed transition was an enable or
        // replacement, in which case replaying its ON bytes remains blocked.
        if (sgrMousePhysicalUncertain) {
          const possiblyOwned = new Set(ownedSgrMouseModes);
          if (activeSgrMouseMode) possiblyOwned.add(activeSgrMouseMode);
          if (possiblyOwned.size === 0) {
            activeSgrMouseMode = undefined;
            sgrMousePhysicalUncertain = false;
            break;
          }
          const pending = { kind: "cleanup" } as const;
          pendingSgrMouseTransition = pending;
          try {
            const accepted = disableSgrMouse(possiblyOwned, useSync, () => {
              if (pendingSgrMouseTransition !== pending) return;
              pendingSgrMouseTransition = undefined;
              activeSgrMouseMode = undefined;
              sgrMousePhysicalUncertain = false;
              if (lastReportedSgrMouseMode !== undefined) {
                lastReportedSgrMouseMode = undefined;
                opts.onSgrMouseModeChange?.(undefined);
              }
              if (!sgrMouseReenableBlocked) opts.requestTerminalReconcile();
            });
            if (!accepted) {
              if (pendingSgrMouseTransition === pending) pendingSgrMouseTransition = undefined;
              opts.requestTerminalReconcile();
            }
          } catch (error) {
            if (pendingSgrMouseTransition === pending) pendingSgrMouseTransition = undefined;
            sgrMousePhysicalUncertain = true;
            throw error;
          }
          break;
        }

        if (next === activeSgrMouseMode && !sgrMousePhysicalUncertain) {
          if (!sgrMouseReconcileRequested) break;
          continue;
        }

        if (activeSgrMouseMode && next) {
          const previous = activeSgrMouseMode;
          const pending = { kind: "replace", previous, mode: next } as const;
          pendingSgrMouseTransition = pending;
          ownedSgrMouseModes.add(next);
          everEnabledSgrMouse = true;
          try {
            const accepted = writeTerminalMode(
              mouseDisableSequence([previous]) + mouseEnableSequence(next),
              useSync,
              () => {
                if (pendingSgrMouseTransition !== pending) return;
                pendingSgrMouseTransition = undefined;
                activeSgrMouseMode = next;
                sgrMousePhysicalUncertain = false;
                ownedSgrMouseModes.add(next);
                everEnabledSgrMouse = true;
                if (lastReportedSgrMouseMode !== next) {
                  lastReportedSgrMouseMode = next;
                  opts.onSgrMouseModeChange?.(next);
                }
                opts.requestTerminalReconcile();
              },
            );
            if (!accepted) {
              if (pendingSgrMouseTransition === pending) pendingSgrMouseTransition = undefined;
              opts.requestTerminalReconcile();
              break;
            }
          } catch (error) {
            if (pendingSgrMouseTransition === pending) pendingSgrMouseTransition = undefined;
            sgrMousePhysicalUncertain = true;
            throw error;
          }
          if (pendingSgrMouseTransition) break;
          continue;
        }

        if (activeSgrMouseMode) {
          const previous = activeSgrMouseMode;
          const pending = { kind: "disable", mode: previous } as const;
          pendingSgrMouseTransition = pending;
          try {
            const accepted = disableSgrMouse([previous], useSync, () => {
              if (pendingSgrMouseTransition !== pending) return;
              pendingSgrMouseTransition = undefined;
              activeSgrMouseMode = undefined;
              sgrMousePhysicalUncertain = false;
              if (lastReportedSgrMouseMode !== undefined) {
                lastReportedSgrMouseMode = undefined;
                opts.onSgrMouseModeChange?.(undefined);
              }
              opts.requestTerminalReconcile();
            });
            if (!accepted) {
              if (pendingSgrMouseTransition === pending) pendingSgrMouseTransition = undefined;
              opts.requestTerminalReconcile();
              break;
            }
          } catch (error) {
            if (pendingSgrMouseTransition === pending) pendingSgrMouseTransition = undefined;
            sgrMousePhysicalUncertain = true;
            throw error;
          }
          if (pendingSgrMouseTransition) break;
          continue;
        }

        if (next) {
          const pending = { kind: "enable", mode: next } as const;
          pendingSgrMouseTransition = pending;
          // Record possible ownership before invoking a hostile stream. Its
          // write() may accept the enable escape and then throw before the
          // handoff callback can publish the known-active mode.
          ownedSgrMouseModes.add(next);
          everEnabledSgrMouse = true;
          try {
            const accepted = writeTerminalMode(mouseEnableSequence(next), useSync, () => {
              if (pendingSgrMouseTransition !== pending) return;
              pendingSgrMouseTransition = undefined;
              activeSgrMouseMode = next;
              sgrMousePhysicalUncertain = false;
              ownedSgrMouseModes.add(next);
              everEnabledSgrMouse = true;
              if (lastReportedSgrMouseMode !== next) {
                lastReportedSgrMouseMode = next;
                opts.onSgrMouseModeChange?.(next);
              }
              opts.requestTerminalReconcile();
            });
            if (!accepted) {
              if (pendingSgrMouseTransition === pending) pendingSgrMouseTransition = undefined;
              opts.requestTerminalReconcile();
              break;
            }
          } catch (error) {
            if (pendingSgrMouseTransition === pending) pendingSgrMouseTransition = undefined;
            sgrMousePhysicalUncertain = true;
            throw error;
          }
          if (pendingSgrMouseTransition) break;
          continue;
        }
      }
    } finally {
      reconcilingSgrMouse = false;
    }
  }

  function reconcileSharedSubscription(): void {
    if (
      resumeAwaitingTerminalModes &&
      (localRefs === 0 ||
        (opts.isManagedInputSurfaceReady() &&
          opts.isKittyKeyboardReady() &&
          (!canWriteTerminalMode() ||
            (bracketedPasteModeCount === 0
              ? !bracketedPastePhysicallyEnabled && !bracketedPastePhysicalUncertain
              : bracketedPastePhysicallyEnabled && !bracketedPastePhysicalUncertain)) &&
          pendingBracketedPasteMode === undefined &&
          pendingSgrMouseTransition === undefined &&
          !sgrMousePhysicalUncertain &&
          activeSgrMouseMode ===
            (canUseSgrMouseMode() ? highestRequestedSgrMouseMode() : undefined)))
    ) {
      resumeAwaitingTerminalModes = false;
    }
    const shouldBeActive = !disposed && !suspended && !resumeAwaitingTerminalModes && localRefs > 0;
    if (shouldBeActive === sharedSubscriptionActive) return;
    sharedSubscriptionActive = shouldBeActive;
    sharedSubscription.setActive(shouldBeActive);
  }

  function reconcileKittyDemand(): void {
    if (reconcilingKittyDemand) {
      kittyDemandReconcileRequested = true;
      return;
    }

    reconcilingKittyDemand = true;
    let firstError: unknown;
    let hasError = false;
    let retriedAfterReentry = false;
    try {
      while (true) {
        kittyDemandReconcileRequested = false;
        const shouldHoldDemand = !disposed && localRefs > 0;

        if (shouldHoldDemand && !releaseKittyKeyboardDemand) {
          let release: (() => void) | undefined;
          try {
            release = opts.acquireKittyKeyboardDemand();
          } catch (error) {
            if (!hasError) {
              firstError = error;
              hasError = true;
            }
            // A host callback can create a surviving nested stdin demand before
            // the outer Kitty acquisition fails. Give that newly committed
            // desired state one chance to acquire its own lease.
            if (kittyDemandReconcileRequested && !retriedAfterReentry) {
              retriedAfterReentry = true;
              continue;
            }
            break;
          }

          if (!disposed && localRefs > 0) {
            releaseKittyKeyboardDemand = release;
          } else {
            try {
              release();
            } catch (error) {
              if (!hasError) {
                firstError = error;
                hasError = true;
              }
            }
          }
          continue;
        }

        if (!shouldHoldDemand && releaseKittyKeyboardDemand) {
          const release = releaseKittyKeyboardDemand;
          // Commit the desired state before calling the host-facing release so
          // a reentrant acquisition can request a fresh lease.
          releaseKittyKeyboardDemand = undefined;
          try {
            release();
          } catch (error) {
            if (!hasError) {
              firstError = error;
              hasError = true;
            }
          }
          continue;
        }

        if (!kittyDemandReconcileRequested) break;
      }
    } finally {
      reconcilingKittyDemand = false;
    }
    if (hasError) throw firstError;
  }

  function snapshotCurrentApplicationInput(): ApplicationInputSnapshot {
    const mouseController = opts.getMouseController();
    return Object.freeze({
      kind: "routes",
      topology: inputRouting.capture(),
      sgrMouseMode: activeSgrMouseMode,
      mouse: mouseController
        ? Object.freeze({
            controller: mouseController,
            input: mouseController.captureInputSnapshot(),
          })
        : undefined,
      managedInputActive: publishedSemanticRefs > 0 || localRefs > semanticPhysicalRefs,
    });
  }

  function captureApplicationInputSnapshot(): CapturedApplicationInputSnapshot {
    if (inputDeliveryActive) return snapshotCurrentApplicationInput();
    if (!pendingBootstrapInputSnapshot) {
      throw new Error("Bootstrap input snapshot is unavailable before input activation");
    }
    return pendingBootstrapInputSnapshot;
  }

  function acceptSharedInput(
    fact: NormalizedInputFact,
    snapshot: CapturedApplicationInputSnapshot,
  ): void {
    if (disposed || suspended) return;
    pendingApplicationInput.push({ fact, snapshot });
    flushPendingApplicationInput();
  }

  function flushPendingApplicationInput(): void {
    if (
      !inputDeliveryActive ||
      suspended ||
      drainingApplicationInput ||
      pendingApplicationInput.length === 0
    )
      return;
    drainingApplicationInput = true;
    try {
      while (pendingApplicationInput.length > 0) {
        const pending = pendingApplicationInput.shift()!;
        const snapshot =
          pending.snapshot.kind === "bootstrap" ? pending.snapshot.resolved : pending.snapshot;
        if (!snapshot) {
          pendingApplicationInput.unshift(pending);
          break;
        }
        processInputEvent(pending.fact, snapshot);
      }
    } finally {
      drainingApplicationInput = false;
    }
  }

  function noDefaultAction() {
    return Object.freeze({ performed: false, continue: true, blockExternal: false });
  }

  function runCtrlCDefault(fact: NormalizedInputFact) {
    if (fact.kind !== "key" || fact.key.phase === "release") {
      return noDefaultAction();
    }
    const { modifiers } = fact.key;
    const isCtrlC =
      modifiers.ctrl &&
      !modifiers.shift &&
      !modifiers.alt &&
      !modifiers.super &&
      !modifiers.hyper &&
      !modifiers.meta &&
      (fact.key.name === "c" ||
        fact.key.primaryCodepoint === 99 ||
        fact.key.baseLayoutCodepoint === 99);
    if (!isCtrlC) return noDefaultAction();
    appCtx.exit();
    return Object.freeze({ performed: true, continue: false, blockExternal: true });
  }

  function deliverCapturedMouse(fact: NormalizedInputFact, snapshot: ApplicationInputSnapshot) {
    if (snapshot.sgrMouseMode && fact.kind === "pointer") {
      const rawMouse = fact.pointer.event;
      const mouse = snapshot.mouse;
      if (
        rawMouse &&
        mouse &&
        (rawMouse.type !== "drag" ||
          snapshot.sgrMouseMode === "drag" ||
          snapshot.sgrMouseMode === "hover")
      ) {
        mouse.controller.handleInput(rawMouse, mouse.input);
      }
      return true;
    }
    return false;
  }

  function processInputEvent(event: NormalizedInputFact, snapshot: ApplicationInputSnapshot): void {
    if (suspended || disposed || !snapshot.managedInputActive) return;
    if (deliverCapturedMouse(event, snapshot)) return;

    // Resolve the independent global layer and selected topology before the first callback.
    // A callback may remove or replace later routes, but that only changes a
    // re-entrant or later parser-defined fact.
    const candidate: InternalInputRouteCandidate = inputRouting.resolve(
      snapshot.topology,
    ).candidate;
    const plan = captureInternalInputRoutePlan(candidate);
    dispatchInternalInput(event, plan);
  }

  sharedSubscription = sharedIngress.subscribe(captureApplicationInputSnapshot, acceptSharedInput);

  // Managed routes fail transactionally on a host that cannot provide terminal
  // input. The actual stream remains available through useStdin().stdin.
  const throwManagedInputUnavailable = (): never => {
    const expectedAtMount = inputAvailability.value.status === "unavailable";
    if (stdin === process.stdin) {
      throw createManagedInputUnavailableError(
        "Managed input is unavailable because the current process.stdin is not a controllable TTY.\nRead raw bytes through useStdin().stdin, or mount a controllable TTY to use vue-tui input handlers.",
        expectedAtMount,
      );
    }
    throw createManagedInputUnavailableError(
      "Managed input is unavailable because the mounted stdin is not a controllable TTY.\nRead raw bytes through useStdin().stdin, or mount a controllable TTY to use vue-tui input handlers.",
      expectedAtMount,
    );
  };

  function assertManagedInputAvailable(): void {
    if (!appCtx.isRawModeSupported || !hasRawInputCapability(stdin)) {
      throwManagedInputUnavailable();
    }
  }

  function reconcilePhysicalRawMode(state: RawModeState): void {
    if (state.reconcilingPhysical) {
      state.physicalReconcileRequested = true;
      return;
    }

    state.reconcilingPhysical = true;
    let firstError: unknown;
    let hasError = false;
    let mustConvergeAfterError = false;
    const retriedTransitions = new Set<"raw-on" | "ref" | "raw-off" | "unref">();

    function recordTransitionError(
      error: unknown,
      transition: "raw-on" | "ref" | "raw-off" | "unref",
      recoverWithoutReentry = false,
    ): boolean {
      if (!hasError) {
        firstError = error;
        hasError = true;
      }
      // A nested acquire/release returned while this host callback was still
      // running. Finish *all* raw + ref transitions required by that surviving
      // owner before surfacing the original error to the outer caller. Each
      // physical operation gets one recovery attempt, so a raw restore and an
      // unref that both fail once can still converge without looping forever on
      // a permanently hostile custom stream.
      const shouldRecover =
        state.physicalReconcileRequested || recoverWithoutReentry || mustConvergeAfterError;
      if (!shouldRecover || retriedTransitions.has(transition)) return false;
      retriedTransitions.add(transition);
      mustConvergeAfterError = true;
      return true;
    }

    try {
      while (true) {
        state.physicalReconcileRequested = false;
        const shouldBeActive = state.activeRefs > 0 || state.pendingDisable;

        if (shouldBeActive) {
          if (!state.physicalActive || state.physicalRawUncertain) {
            // Commit the transition before calling a hostile stream. Re-entrant
            // suspend/release updates the desired counts; the next loop then
            // compensates instead of letting the outer acquisition overwrite it.
            state.physicalActive = true;
            state.physicalRawUncertain = false;
            if (state.changedRawMode) {
              try {
                appCtx.setRawMode(true);
              } catch (error) {
                // A throwing custom stream may have failed before or after the
                // ioctl. Mark the state uncertain so the next desired owner
                // retries enable, or the no-owner cleanup explicitly restores
                // the baseline instead of trusting this transition.
                state.physicalActive = false;
                state.physicalRawUncertain = true;
                if (!recordTransitionError(error, "raw-on")) break;
              }
            }
            continue;
          }
          if (
            (!state.physicalRefHeld || state.physicalRefUncertain) &&
            typeof stdin.ref === "function"
          ) {
            state.physicalRefHeld = true;
            state.physicalRefUncertain = false;
            try {
              stdin.ref();
            } catch (error) {
              state.physicalRefHeld = false;
              state.physicalRefUncertain = true;
              if (!recordTransitionError(error, "ref")) break;
            }
            continue;
          }
        } else {
          if (state.physicalActive || state.physicalRawUncertain) {
            state.physicalActive = false;
            state.physicalRawUncertain = false;
            if (state.changedRawMode) {
              try {
                appCtx.setRawMode(state.baselineRaw);
              } catch (error) {
                // A failed release may have left the terminal raw. Retain the
                // ownership fact so teardown can retry instead of assuming the
                // terminal is already restored.
                state.physicalRawUncertain = true;
                // Restoring cooked mode is idempotent. A one-shot host failure
                // during suspension/unmount must not leave the shell raw after
                // the framework has dropped its input listener.
                if (!recordTransitionError(error, "raw-off", true)) break;
              }
            }
            continue;
          }
          if (
            (state.physicalRefHeld || state.physicalRefUncertain) &&
            typeof stdin.unref === "function"
          ) {
            state.physicalRefHeld = false;
            state.physicalRefUncertain = false;
            try {
              stdin.unref();
            } catch (error) {
              state.physicalRefUncertain = true;
              // Node's unref() is idempotent. Retry a failed final release once
              // so a transient custom-stream error cannot keep the process
              // alive after the controller is disposed.
              if (!recordTransitionError(error, "unref", true)) break;
            }
            continue;
          }
        }

        if (!state.physicalReconcileRequested) break;
      }
    } finally {
      state.reconcilingPhysical = false;
    }
    if (hasError) throw firstError;
  }

  function resetRawModeState(state: RawModeState): void {
    state.pendingDisable = false;
    state.activeRefs = 0;
    state.physicalActive = false;
    state.physicalRawUncertain = false;
    state.physicalRefHeld = false;
    state.physicalRefUncertain = false;
    state.baselineRaw = false;
    state.changedRawMode = false;
    state.physicalReconcileRequested = false;
  }

  function resetRawModeStateIfIdle(state: RawModeState): void {
    if (
      state.refs === 0 &&
      state.activeRefs === 0 &&
      !state.pendingDisable &&
      !state.physicalActive &&
      !state.physicalRawUncertain &&
      !state.physicalRefHeld &&
      !state.physicalRefUncertain &&
      !state.reconcilingPhysical
    ) {
      resetRawModeState(state);
    }
  }

  function setSemanticDemandPublished(demand: SemanticInputDemand, published: boolean): void {
    if (demand.published === published) return;
    demand.published = published;
    publishedSemanticRefs += published ? 1 : -1;
  }

  function semanticTerminalModesReady(): boolean {
    const pasteReady =
      !canWriteTerminalMode() ||
      (bracketedPastePhysicallyEnabled &&
        !bracketedPastePhysicalUncertain &&
        pendingBracketedPasteMode === undefined);
    return (
      !suspended && opts.isManagedInputSurfaceReady() && opts.isKittyKeyboardReady() && pasteReady
    );
  }

  function reconcileSemanticInputDemands(): void {
    if (reconcilingSemanticInput) {
      semanticInputReconcileRequested = true;
      return;
    }
    reconcilingSemanticInput = true;
    try {
      do {
        semanticInputReconcileRequested = false;

        for (const demand of semanticInputDemands) {
          if (demand.released) {
            setSemanticDemandPublished(demand, false);
            if (demand.physicalAcquired) {
              demand.physicalAcquired = false;
              semanticPhysicalRefs = Math.max(0, semanticPhysicalRefs - 1);
              let releaseError: unknown;
              try {
                controller.setBracketedPasteMode(false);
              } catch (error) {
                releaseError = error;
              }
              try {
                controller.releaseRawMode();
              } catch (error) {
                releaseError ??= error;
              }
              semanticInputDemands.delete(demand);
              if (releaseError !== undefined) throw releaseError;
              continue;
            }
            semanticInputDemands.delete(demand);
            continue;
          }

          if (!demand.physicalAcquired && !suspended) {
            // Count this raw lease as semantic before host callbacks can
            // synchronously deliver input. Until the route is published, such a
            // fact must resolve against the previously accepted topology.
            semanticPhysicalRefs++;
            let acquired = false;
            try {
              acquired = controller.acquireRawMode() !== false;
            } catch (error) {
              semanticPhysicalRefs = Math.max(0, semanticPhysicalRefs - 1);
              throw error;
            }
            if (!acquired) {
              semanticPhysicalRefs = Math.max(0, semanticPhysicalRefs - 1);
              opts.requestTerminalReconcile();
              continue;
            }
            demand.physicalAcquired = true;
            try {
              controller.setBracketedPasteMode(true);
            } catch (error) {
              demand.physicalAcquired = false;
              semanticPhysicalRefs = Math.max(0, semanticPhysicalRefs - 1);
              controller.releaseRawMode();
              throw error;
            }
          }
        }

        reconcileBracketedPasteMode();
        reconcileSgrMouseMode();
        const ready = semanticTerminalModesReady();
        for (const demand of semanticInputDemands) {
          setSemanticDemandPublished(
            demand,
            !demand.released && demand.activationRequested && demand.physicalAcquired && ready,
          );
        }
      } while (semanticInputReconcileRequested);
    } finally {
      reconcilingSemanticInput = false;
    }
  }

  controller = {
    stdin,
    isRawModeSupported: appCtx.isRawModeSupported,
    inputAvailability,
    internal_inputRouting: inputRouting,
    injectTestMouse(event) {
      acceptSharedInput(createInternalTestMouseFact(event), captureApplicationInputSnapshot());
    },
    acquireRawMode() {
      if (disposed) {
        throw new Error("Cannot acquire raw mode after the vue-tui application has unmounted");
      }
      // Managed semantic routes surface this failure transactionally before
      // publishing their replacement. Rechecking the structural capability
      // also prevents a setterless host that was pre-raw at mount from silently
      // attaching after its external owner returns it to cooked mode.
      assertManagedInputAvailable();
      if (!suspended && !opts.beforeManagedInputAcquire()) return false;
      const state = getRawModeState(stdin);
      const firstSharedRef = state.refs === 0;
      const localRefsBefore = localRefs;
      let committedRef = false;
      try {
        if (
          firstSharedRef &&
          !state.pendingDisable &&
          !state.physicalActive &&
          !state.physicalRawUncertain &&
          !state.physicalRefHeld &&
          !state.physicalRefUncertain
        ) {
          state.baselineRaw = Boolean((stdin as { isRaw?: boolean }).isRaw);
          state.changedRawMode = !state.baselineRaw;
        }
        if (localRefs === 0 && inputDeliveryActive) {
          // A newly active semantic route starts a fresh application delivery
          // generation. Initial Vue setup is different: a terminal can
          // synchronously send the prefix of an event beside the Kitty capability
          // query before setup installs the first route. That prefix belongs to
          // the initial bootstrap snapshot and must survive until
          // activateInputDelivery() binds it to the complete initial route set.
          sharedSubscription.invalidate();
        }
        const participatesPhysically = !suspended;
        state.refs++;
        if (participatesPhysically) state.activeRefs++;
        localRefs++;
        changeRuntimeResource("rawLeases", 1);
        committedRef = true;
        if (participatesPhysically) state.pendingDisable = false;
        reconcilePhysicalRawMode(state);
        reconcileSharedSubscription();
        reconcileKittyDemand();
      } catch (error) {
        // A re-entrant dispose/release may already have consumed this logical
        // acquisition. Roll it back only while its local count still exists.
        if (committedRef && !disposed && localRefs > localRefsBefore) {
          state.refs = Math.max(0, state.refs - 1);
          if (!suspended) state.activeRefs = Math.max(0, state.activeRefs - 1);
          localRefs = Math.max(0, localRefs - 1);
          changeRuntimeResource("rawLeases", -1);
        }
        if (state.activeRefs === 0) state.pendingDisable = false;
        runTerminalCleanup(() => reconcilePhysicalRawMode(state));
        resetRawModeStateIfIdle(state);
        runTerminalCleanup(reconcileSharedSubscription);
        runTerminalCleanup(reconcileKittyDemand);
        throw error;
      }
      return true;
    },
    acquireSemanticInput() {
      assertManagedInputAvailable();
      const demand: SemanticInputDemand = {
        activationRequested: false,
        physicalAcquired: false,
        published: false,
        released: false,
      };
      semanticInputDemands.add(demand);
      try {
        reconcileSemanticInputDemands();
      } catch (error) {
        demand.released = true;
        runTerminalCleanup(reconcileSemanticInputDemands);
        throw error;
      }
      return Object.freeze({
        activate() {
          if (demand.released || demand.activationRequested) return;
          demand.activationRequested = true;
          reconcileSemanticInputDemands();
        },
        release() {
          if (demand.released) return;
          demand.activationRequested = false;
          setSemanticDemandPublished(demand, false);
          // Vue removes an old branch before mounting its same-tick replacement.
          // Keep the physical lease until the microtask boundary so a
          // replacement can acquire without a listener/raw-mode gap.
          queueMicrotask(() => {
            if (demand.released) return;
            demand.released = true;
            runTerminalCleanup(reconcileSemanticInputDemands);
          });
        },
      });
    },
    startKittyQueryResponseDetection(onResult) {
      let settled = false;
      let cancelSharedDetection:
        | ReturnType<SharedStdinIngress["startKittyQueryResponseDetection"]>
        | undefined;
      cancelSharedDetection = sharedIngress.startKittyQueryResponseDetection((supported) => {
        if (settled) return;
        settled = true;
        onResult(supported);
      }, sharedSubscription);
      return (options) => {
        if (settled) return;
        settled = true;
        let firstError: unknown;
        try {
          cancelSharedDetection?.(options);
        } catch (error) {
          firstError = error;
        }
        if (firstError !== undefined) throw firstError;
      };
    },
    activateInputDelivery() {
      if (inputDeliveryActive || disposed) return;
      // Input received beside a synchronous Kitty query reply can predate Vue
      // setup. Bind that bootstrap sentinel to the complete initial route set,
      // then retain this exact snapshot even if a route changes before the
      // split event finishes.
      const initialSnapshot = snapshotCurrentApplicationInput();
      if (pendingBootstrapInputSnapshot) pendingBootstrapInputSnapshot.resolved = initialSnapshot;
      // Ingress recipient snapshots for events that actually began before
      // activation retain the binding object. Drop the controller's reference
      // so initial component callbacks are not kept alive for the full app.
      pendingBootstrapInputSnapshot = undefined;
      inputDeliveryActive = true;
      flushPendingApplicationInput();
      if (localRefs === 0) {
        sharedSubscription.invalidate();
        pendingApplicationInput.length = 0;
        reconcileSharedSubscription();
      }
    },
    reconcileTerminalState() {
      if (disposed) return;
      // Resolve route replacements before retrying an ambiguous terminal mode.
      // That gives bracketed paste the newest reference count, so a re-entrant
      // false -> true transition converges straight to ON instead of replaying
      // an obsolete OFF first.
      reconcileSemanticInputDemands();
      reconcileBracketedPasteMode();
      reconcileSgrMouseMode();
      reconcileSharedSubscription();
      flushPendingApplicationInput();
    },
    abandonPendingTerminalOutput(options) {
      if (options?.physicalStateUncertain) {
        if (pendingBracketedPasteMode) bracketedPastePhysicalUncertain = true;
        if (pendingSgrMouseTransition) {
          sgrMousePhysicalUncertain = true;
          if (
            pendingSgrMouseTransition.kind === "enable" ||
            pendingSgrMouseTransition.kind === "replace"
          ) {
            sgrMouseReenableBlocked = true;
          }
        }
      }
      pendingBracketedPasteMode = undefined;
      pendingSgrMouseTransition = undefined;
      for (const demand of semanticInputDemands) {
        if (!semanticTerminalModesReady()) setSemanticDemandPublished(demand, false);
      }
      if (options?.physicalStateUncertain) {
        // The coordinator is idle before it reports a physical stream failure.
        // Converge immediately to terminal-safe OFF states. Failed enable and
        // replacement transitions remain blocked; failed disables may restore
        // surviving demand after cleanup.
        runTerminalCleanup(reconcileBracketedPasteMode);
        runTerminalCleanup(reconcileSgrMouseMode);
      } else {
        opts.requestTerminalReconcile();
      }
    },
    setBracketedPasteMode(enabled: boolean) {
      if (disposed) return;
      if (enabled) {
        const bracketedPasteModeCountBefore = bracketedPasteModeCount;
        bracketedPasteModeCount++;
        changeRuntimeResource("pasteLeases", 1);
        try {
          reconcileBracketedPasteMode();
        } catch (error) {
          if (!disposed && bracketedPasteModeCount > bracketedPasteModeCountBefore) {
            bracketedPasteModeCount--;
            changeRuntimeResource("pasteLeases", -1);
          }
          runTerminalCleanup(reconcileBracketedPasteMode);
          throw error;
        }
      } else {
        if (bracketedPasteModeCount === 0) return;
        bracketedPasteModeCount--;
        changeRuntimeResource("pasteLeases", -1);
        // Let the semantic release finish before retrying an ambiguous OFF. A
        // re-entrant replacement can then establish the newest desired count,
        // so reconciliation emits ON directly instead of an obsolete second
        // OFF followed by ON.
        try {
          reconcileBracketedPasteMode();
        } catch (error) {
          // A custom stream may accept OFF and then throw while this reconciler
          // is still on the stack. Retry the idempotent cleanup after it has
          // unwound, then preserve the original release error for the caller's
          // existing best-effort cleanup boundary.
          runTerminalCleanup(reconcileBracketedPasteMode);
          throw error;
        }
      }
    },
    acquireSgrMouseMode(level: SgrMouseMode = "button") {
      const token = Symbol("sgr-mouse");
      if (disposed) return token;
      sgrMouseModeTokens.set(token, level);
      changeRuntimeResource("mouseLeases", 1);
      try {
        reconcileSgrMouseMode();
      } catch (error) {
        // A throwing terminal write means this call never returns its token, so
        // leaving it in the request map would create an ownerless SGR lease.
        // Remove the logical request and attempt to restore the previous level
        // without replacing the original acquisition error.
        if (sgrMouseModeTokens.delete(token)) {
          changeRuntimeResource("mouseLeases", -1);
        }
        runTerminalCleanup(reconcileSgrMouseMode);
        throw error;
      }
      return token;
    },
    releaseSgrMouseMode(token: symbol) {
      if (!sgrMouseModeTokens.delete(token)) return;
      changeRuntimeResource("mouseLeases", -1);
      if (!disposed) {
        try {
          reconcileSgrMouseMode();
        } catch (error) {
          runTerminalCleanup(reconcileSgrMouseMode);
          throw error;
        }
      }
    },
    releaseRawMode() {
      if (!appCtx.isRawModeSupported) return;
      if (localRefs === 0) return;
      const state = getRawModeState(stdin);
      state.refs = Math.max(0, state.refs - 1);
      if (!suspended) state.activeRefs = Math.max(0, state.activeRefs - 1);
      localRefs = Math.max(0, localRefs - 1);
      changeRuntimeResource("rawLeases", -1);
      let firstError: unknown;
      try {
        reconcileKittyDemand();
      } catch (error) {
        firstError = error;
      }
      if (localRefs === 0) {
        // End this app-level delivery generation. Handler-level route snapshots
        // belong to the later routing/lifetime checkpoint; once no app consumer remains, orphaned
        // framing is discarded and the physical listener may detach.
        try {
          sharedSubscription.invalidate();
        } catch (error) {
          firstError = error;
        }
        pendingApplicationInput.length = 0;
      }
      try {
        reconcileSharedSubscription();
      } catch (error) {
        firstError ??= error;
      }
      if (
        state.activeRefs === 0 &&
        (state.physicalActive ||
          state.physicalRawUncertain ||
          state.physicalRefHeld ||
          state.physicalRefUncertain)
      ) {
        // Defer ONLY the SHARED terminal raw-mode toggle (Ink defers just disableRawMode,
        // App.tsx:359-368): when components swap (v-if/key change), Vue unmounts
        // the old before mounting the new, so activeRefs briefly hits 0. Disabling
        // synchronously would drop raw mode between the two mounts; the microtask
        // short-circuits if a replacement re-acquired in the meantime — which it
        // signals by clearing pendingDisable (matching Ink's flag, App.tsx:362-365).
        state.pendingDisable = true;
        queueMicrotask(() => {
          if (!state.pendingDisable || state.activeRefs > 0) return;
          state.pendingDisable = false;
          runTerminalCleanup(() => reconcilePhysicalRawMode(state));
          resetRawModeStateIfIdle(state);
        });
      } else {
        resetRawModeStateIfIdle(state);
      }
      // Release is terminal cleanup. Preserve progress across a hostile
      // listener removal instead of surfacing an error that could abort the
      // remaining Vue scope disposals; dispose() retries the physical restore.
      void firstError;
    },
    suspend(sync = false) {
      if (suspended) return;
      suspended = true;
      resumeAwaitingTerminalModes = false;
      for (const demand of semanticInputDemands) setSemanticDemandPublished(demand, false);
      // Keep a physical framing unit that began before suspension long enough
      // to find its boundary, but invalidate this app as a recipient. That lets
      // a sole app resume after a split CSI/paste/UTF-8 unit without receiving
      // the old unit's tail. Ordinary consumer release does not retain framing.
      runTerminalCleanup(() => sharedSubscription.invalidate({ retainPending: true }));
      pendingApplicationInput.length = 0;
      runTerminalCleanup(reconcileSharedSubscription);

      runTerminalCleanup(() => reconcileBracketedPasteMode(sync));
      runTerminalCleanup(() => reconcileSgrMouseMode(sync));

      if (appCtx.isRawModeSupported) {
        const state = getRawModeState(stdin);
        state.activeRefs = Math.max(0, state.activeRefs - localRefs);
        state.pendingDisable = false;
        runTerminalCleanup(() => reconcilePhysicalRawMode(state));
        resetRawModeStateIfIdle(state);
      }
    },
    resume() {
      if (!suspended) return;
      const state = appCtx.isRawModeSupported ? getRawModeState(stdin) : undefined;
      let addedActiveRawRefs = 0;

      suspended = false;
      resumeAwaitingTerminalModes = true;
      try {
        // Reacquire raw input first. The shared reconciler re-checks desired
        // counts after every host callback, so a synchronous re-entrant suspend
        // wins without leaving an active logical ref on a cooked terminal.
        if (state && localRefs > 0) {
          state.pendingDisable = false;
          state.activeRefs += localRefs;
          addedActiveRawRefs = localRefs;
          reconcilePhysicalRawMode(state);
        }
        if (suspended || disposed) return;
        reconcileBracketedPasteMode();
        if (suspended || disposed) return;
        reconcileSgrMouseMode();
        if (suspended || disposed) return;
        // Only expose buffered input after every parser-affecting terminal mode
        // is active. A custom ReadStream may synchronously deliver from resume();
        // SGR mouse must already be classified as mouse rather than useInput text.
        reconcileSemanticInputDemands();
        reconcileSharedSubscription();
        flushPendingApplicationInput();
      } catch (error) {
        if (addedActiveRawRefs > 0 && state && !suspended && !disposed) {
          state.activeRefs = Math.max(
            0,
            state.activeRefs - Math.min(addedActiveRawRefs, localRefs),
          );
        }
        if (!disposed) suspended = true;
        resumeAwaitingTerminalModes = false;
        runTerminalCleanup(reconcileBracketedPasteMode);
        runTerminalCleanup(reconcileSgrMouseMode);
        if (state) {
          state.pendingDisable = false;
          runTerminalCleanup(() => reconcilePhysicalRawMode(state));
          resetRawModeStateIfIdle(state);
        }
        runTerminalCleanup(reconcileSharedSubscription);
        throw error;
      }
    },
    dispose(sync = false) {
      if (disposed) {
        // A captured asynchronous restoration can fail only when its transaction
        // reaches the stream. Keep repeated synchronous disposal useful so the
        // emergency path can re-send terminal OFF modes after that late failure.
        if (sync) reissueIdempotentTerminalDisables(true);
        return;
      }
      disposed = true;
      runTerminalCleanup(reconcileKittyDemand);
      pendingApplicationInput.length = 0;
      inputDeliveryActive = false;
      drainingApplicationInput = false;
      sharedSubscriptionActive = false;
      // A hostile stream may throw while removing the final data listener.
      // Input ownership failure must not skip paste/mouse/Kitty/raw cleanup.
      runTerminalCleanup(() => sharedSubscription.dispose());
      inputRouting.clear();
      for (const demand of semanticInputDemands) {
        demand.released = true;
        demand.physicalAcquired = false;
        setSemanticDemandPublished(demand, false);
      }
      semanticInputDemands.clear();
      semanticPhysicalRefs = 0;
      // Normal teardown itself owns one unhanded output transaction. Preserve
      // terminal-mode callbacks captured by Vue scope cleanup so the handoff
      // commits their physical state exactly once. Abrupt teardown aborts that
      // transaction and explicitly abandons these pending callbacks first.
      if (sync) {
        pendingBracketedPasteMode = undefined;
        pendingSgrMouseTransition = undefined;
      }
      resumeAwaitingTerminalModes = false;
      runTerminalCleanup(() => reconcileBracketedPasteMode(sync));
      runTerminalCleanup(() => reconcileSgrMouseMode(sync));
      if (sync) {
        // Signal-exit path (Finding A): the paste-OFF escape must flush
        // synchronously. By the time dispose() runs, Vue's unmount has usually
        // already disposed the semantic-input lease, which wrote `\x1b[?2004l`
        // ASYNC and zeroed the count — and that
        // async write is exactly what signal-exit's immediate re-raise can drop.
        // So re-issue it SYNCHRONOUSLY here whenever paste was ever enabled, not
        // gated on the (now-zero) live count. Re-sending paste-OFF is idempotent:
        // disabling an already-disabled mode is a terminal no-op, so a redundant
        // sync write after a surviving async one is harmless. If detach hasn't run
        // yet (count still > 0), this single sync write still covers it.
        reissueIdempotentTerminalDisables(true);
      } else {
        if (bracketedPastePhysicalUncertain) {
          runTerminalCleanup(() => forceDisableBracketedPaste(false));
        }
        if (sgrMousePhysicalUncertain) {
          runTerminalCleanup(() => {
            if (disableSgrMouse(ownedSgrMouseModes)) {
              activeSgrMouseMode = undefined;
              sgrMousePhysicalUncertain = false;
            }
          });
        }
      }
      changeRuntimeResource("pasteLeases", -bracketedPasteModeCount);
      bracketedPasteModeCount = 0;
      changeRuntimeResource("mouseLeases", -sgrMouseModeTokens.size);
      sgrMouseModeTokens.clear();
      // Retain the at-most-three modes until this disposed controller is
      // collected. A late output-transaction failure may need one synchronous,
      // idempotent OFF retry through dispose(true).
      if (appCtx.isRawModeSupported) {
        const state = getRawModeState(stdin);
        // Drop this controller's outstanding refs (if Vue's unmount hasn't already
        // released them via onScopeDispose → releaseRawMode).
        if (localRefs > 0) {
          if (!suspended) {
            state.activeRefs = Math.max(0, state.activeRefs - localRefs);
          }
          state.refs = Math.max(0, state.refs - localRefs);
          changeRuntimeResource("rawLeases", -localRefs);
          localRefs = 0;
        }
        // Reconcile terminal raw mode synchronously when ownership changes. This
        // covers BOTH teardown orderings:
        //   (1) dispose() ran while this controller still held refs (above), or
        //   (2) Vue's unmount already fired releaseRawMode (localRefs is 0) which
        //       DEFERRED the disable to a microtask — but on the signal-exit path
        //       (teardown(true) re-raises the signal without draining microtasks)
        //       that microtask never runs, so the terminal would be left raw and
        //       the shell stops echoing after Ctrl+C.
        // Clearing pendingDisable also cancels the queued microtask so it cannot
        // double-unref. The shared reconciler keeps another app's active lease.
        state.pendingDisable = false;
        runTerminalCleanup(() => reconcilePhysicalRawMode(state));
        resetRawModeStateIfIdle(state);
      }
      suspended = false;
    },
  };

  return controller;
}
