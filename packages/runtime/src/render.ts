import {
  type Component,
  type ComponentOptions,
  type ComponentPublicInstance,
  type Directive,
  type InjectionKey,
  type Plugin,
  type App as VueApp,
  nextTick,
} from "vue";
import { createRenderer } from "vue";
import { writeSync as fsWriteSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { onExit } from "signal-exit";
import ansiEscapes from "ansi-escapes";
import { INTERNAL_KITTY_KEYBOARD, createKittyKeyboardController } from "./io/kitty-keyboard.ts";
import {
  createStdinController,
  hasRawInputCapability,
  type StdinController,
} from "./io/stdin-controller.ts";
import { createRoot, type TuiNode, type TuiRoot, type TuiStatic } from "./host/nodes.ts";
import { runLayoutTransaction, type LayoutHeightConstraint } from "./host/layout-transaction.ts";
import { attachYoga, detachYoga } from "./host/yoga.ts";
import { buildNodeOps } from "./host/node-ops.ts";
import {
  createHostYogaAllocationLedger,
  type HostYogaAllocationLedger,
} from "./host/yoga-allocation-ledger.ts";
import { createCommitScheduler } from "./scheduler.ts";
import { paint, releasePaintCaches } from "./paint/paint.ts";
import { sanitizeAnsiMultiline } from "./paint/sanitize-ansi.ts";
import { resolveTerminalStyle } from "./paint/terminal-style.ts";
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
import {
  createMountedStreamLifecycle,
  type MountedStreamLifecycle,
} from "./io/stream-lifecycle.ts";
import { registerConsoleSink, type ConsoleSinkRegistration } from "./io/console-manager.ts";
import { hideCursorEscape, nextLineEscape } from "./io/cursor-helpers.ts";
import { INTERNAL_RENDER_OBSERVER } from "./io/render-observer.ts";
import { bsu, esu, shouldSynchronize } from "./io/write-synchronized.ts";
import { emitTestEvent, RUNTIME_TEST_EVENT } from "./test-events.ts";
import { AppContextKey, StdinContextKey, type AppContext } from "./context.ts";
import {
  InternalRenderSessionKey,
  createLiveRenderSessionService,
  needsTerminalSizeProbe,
  normalizeRequestedMode,
  resolveLiveDimensions,
  resolveLiveSurface,
  validateExitOnCtrlC,
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
import { createDevOverlayWrapper, DevOverlayPresentationKey } from "./overlay.ts";
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
import { formatErrorForStderr, isErrorInput, messageForNonError } from "./error-value.ts";
import { INTERNAL_SUSPENSION_HOST, processSuspensionHost } from "./process-suspension.ts";
import { getInternalMountOptions, type InternalMountOptions } from "./internal-mount-options.ts";
import { normalizeColorOption, type ColorProfile } from "./color-profile.ts";

export {
  createInternalMountOptions,
  type InternalMountOptions,
  type InternalMountOptionsInput,
} from "./internal-mount-options.ts";

export interface MountOptions {
  readonly stdout?: Writable;
  readonly stdin?: Readable;
  readonly stderr?: Writable;
  /**
   * Select the terminal screen model requested by this application.
   * Omission requests Inline. On a live TTY, an explicit Fullscreen request
   * requires positive terminal dimensions and otherwise fails before setup or
   * terminal mutation. On non-TTY stdout, Inline and Fullscreen select the same
   * supported non-interactive document host.
   *
   * @default 'inline'
   */
  readonly mode?: RenderMode;
  /**
   * Select terminal styling for this application. Omission and `true` detect
   * the selected stdout and honor process color controls. `false` emits no SGR
   * styling; a named profile forces that capability, including for SGR already
   * present in rendered text.
   *
   * @default true
   */
  readonly color?: boolean | ColorProfile;
  /**
   * Patch `console.*` methods to route output through the TUI frame
   * coordinator (writeToStdout / writeToStderr) so that console.log
   * calls don't corrupt the rendered UI.
   *
   * @default true
   */
  readonly patchConsole?: boolean;
  /**
   * Exit before delivering an exact Ctrl+C key. Omission leaves Ctrl+C as
   * ordinary managed input; bracketed paste never triggers this option.
   *
   * @default false
   */
  readonly exitOnCtrlC?: boolean;
}

const acceptedMountOptionKeys = new Set<PropertyKey>([
  "stdout",
  "stdin",
  "stderr",
  "mode",
  "color",
  "patchConsole",
  "exitOnCtrlC",
]);

function assertKnownMountOptionKeys(options: unknown): asserts options is MountOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("Mount options must be an object or undefined.");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (acceptedMountOptionKeys.has(key)) continue;
    if (typeof key === "symbol") throw new TypeError("Unknown symbol mount option.");
    throw new TypeError(`Unknown mount option ${JSON.stringify(key)}.`);
  }
}

type ConsumerVuePrivateAppKey = Extract<keyof VueApp<unknown>, `_${string}`>;
type ConsumerVueFluentAppKey = "use" | "mixin" | "component" | "directive" | "provide" | "filter";
type ConsumerVuePublicAppSurface = Omit<
  VueApp<unknown>,
  ConsumerVuePrivateAppKey | ConsumerVueFluentAppKey | "mount"
>;
type ConsumerVueCompatFilter = Parameters<NonNullable<VueApp<unknown>["filter"]>>[1];

/**
 * A Vue application whose mount target is a terminal host.
 *
 * The ordinary public Vue application surface comes from the consumer's
 * installed Vue version. Runtime replaces Vue's DOM-oriented `mount()` and
 * excludes underscore-prefixed renderer internals.
 */
export interface TuiApp extends ConsumerVuePublicAppSurface {
  use<Options extends unknown[]>(plugin: Plugin<Options>, ...options: NoInfer<Options>): this;
  use<Options>(plugin: Plugin<Options>, options: NoInfer<Options>): this;
  mixin(mixin: ComponentOptions): this;
  component(name: string): Component | undefined;
  component<T extends Component>(name: string, component: T): this;
  directive<T = unknown, V = unknown>(name: string): Directive<T, V> | undefined;
  directive<T = unknown, V = unknown>(name: string, directive: Directive<T, V>): this;
  provide<T, K = InjectionKey<T> | string | number>(
    key: K,
    value: K extends InjectionKey<infer V> ? V : T,
  ): this;
  filter?(name: string): ConsumerVueCompatFilter | undefined;
  filter?(name: string, filter: ConsumerVueCompatFilter): this;
  mount(options?: MountOptions): ComponentPublicInstance;
  waitUntilExit(): Promise<void>;
  waitUntilRenderFlush(): Promise<void>;
}

type InternalMountInvoker = (this: void, options: InternalMountOptions) => ComponentPublicInstance;
const internalMountInvokers = new WeakMap<TuiApp, InternalMountInvoker>();

export function mountWithInternalOptions(
  app: TuiApp,
  options: InternalMountOptions,
): ComponentPublicInstance {
  const mount = internalMountInvokers.get(app);
  if (!mount) {
    throw new TypeError("Internal test mounting requires an app created by this Runtime instance.");
  }
  return mount(options);
}

type RootProps = Record<string, unknown>;

const FULLSCREEN_STATIC_ERROR =
  "[vue-tui] <Static> cannot render on an effective visual Fullscreen surface. Use Inline mode for terminal history, or keep history in application state (for example, ScrollBox).";

// Module-level registry: maps each NodeJS.WriteStream to the one live TuiApp
// that owns its renderer. Keyed weakly so closed/GC'd streams don't leak memory.
// Only the app that successfully wired a renderer (mountedAsOwner=true) owns
// the entry and removes it on teardown; a "no-op" second mount never touches it.
const liveInstances = new WeakMap<NodeJS.WriteStream, TuiApp>();

// Error classification and fallback messages share one UI-independent source
// with render-to-string so fatal settlement stays consistent across hosts.

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

function assertReadableStream(value: unknown, option: "stdin"): asserts value is Readable {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    typeof (value as Readable).on !== "function" ||
    typeof (value as Readable).once !== "function" ||
    typeof (value as Readable).off !== "function"
  ) {
    throw new TypeError(`Mount option "${option}" must be a Node Readable stream.`);
  }
}

function assertWritableStream(
  value: unknown,
  option: "stdout" | "stderr",
): asserts value is Writable {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    typeof (value as Writable).write !== "function" ||
    typeof (value as Writable).on !== "function" ||
    typeof (value as Writable).once !== "function" ||
    typeof (value as Writable).off !== "function"
  ) {
    throw new TypeError(`Mount option "${option}" must be a Node Writable stream.`);
  }
  const stream = value as MaybeWritableStream;
  if (stream.destroyed || stream.writableEnded || stream.writable === false) {
    throw new Error(`Mount option "${option}" must be writable when mount() begins.`);
  }
}

function validatePatchConsole(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value === "boolean") return value;
  throw new TypeError('Mount option "patchConsole" must be a boolean.');
}

function assertFullscreenCapability(
  stdout: NodeJS.WriteStream,
  terminalProbe: TerminalSizeProbeResult,
): void {
  // Non-TTY stdout selects the supported secondary document host for either
  // mode; Fullscreen does not throw solely because no TTY exists.
  if (stdout.isTTY !== true) return;
  const dimensions = resolveLiveDimensions(
    {
      isTTY: true,
      columns: stdout.columns,
      rows: stdout.rows,
    },
    terminalProbe,
  );
  if (dimensions.terminal === null) {
    throw new Error("Fullscreen mode requires positive terminal columns and rows.");
  }
}

/**
 * Create a terminal application from a root component.
 *
 * - `mount()` is one transaction: a failure rolls back every terminal, stream,
 *   and console change before rethrowing.
 * - The owner holds `waitUntilExit()` and `waitUntilRenderFlush()`; descendants
 *   get only `useApp().exit()`.
 * - Component failures stay Vue failures — your `onErrorCaptured()` and
 *   `app.config.errorHandler` still apply.
 *
 * @example Start an Inline app and wait for it to finish
 * ```ts
 * const app = createApp(App);
 * app.mount({ exitOnCtrlC: true });
 * await app.waitUntilExit();
 * ```
 *
 * @example Take over the whole screen
 * ```ts
 * createApp(Dashboard).mount({ mode: "fullscreen" });
 * ```
 */
export function createApp(root: Component, rootProps?: RootProps | null): TuiApp {
  // exit promise — created at createApp time so waitUntilExit() works even
  // before mount (it just hangs until mount + exit).
  let exitResolve!: () => void;
  let exitReject!: (reason?: unknown) => void;
  const exitPromise = new Promise<void>((res, rej) => {
    exitResolve = res;
    exitReject = rej;
  });
  exitPromise.catch(() => {});

  // The first accepted exit selects the result synchronously. A re-entrant or
  // later exit cannot overwrite it while teardown or a later Vue tick runs.
  let exitInitiated = false;

  let mountedRoot: TuiRoot | null = null;
  let mountedWriter: ReturnType<typeof createFrameWriter> | null = null;
  let mountedStdinController: StdinController | null = null;
  let mountedAppContext: AppContext | null = null;
  let mountedResizeHandler: (() => void) | null = null;
  let mountedResizeRefresh: Promise<void> | null = null;
  let mountedExitListener: (() => void) | null = null;
  // Registered at interactive mount so terminating signals route through
  // Runtime teardown; cooperative teardown removes exactly this registration.
  let mountedUnsubscribeExit: (() => void) | null = null;
  let mountedBeforeExitHandler: (() => void) | null = null;
  let mountedUnsubscribeSuspension: (() => void) | null = null;
  let mountedDynamicUpdatesLive = true;
  let mountedRenderSession: InternalRenderSessionService | null = null;
  let mountedRenderedTargets: ReturnType<typeof createRenderedTargetController> | null = null;
  let mountedGeometry: ReturnType<typeof createInternalGeometryService> | null = null;
  let mountedFocusController: InternalFocusController | null = null;
  // Dev-only: lifecycle registered with the HMR bridge. Full reload replaces
  // this app without settling exit; dev-server close ends it normally. Held
  // per-app so teardown() can unregister exactly its own registration. null in
  // production / when the dev integration is off.
  let mountedDevApp: {
    replace(): void;
    close(): Promise<void>;
  } | null = null;
  let mountedGetLastOutput: (() => string) | null = null;
  let mountedNeedsTerminalLineAdvance: (() => boolean) | null = null;
  let mountedConsoleSink: ConsoleSinkRegistration | null = null;
  let mountedHostYogaLedger: HostYogaAllocationLedger | null = null;
  let mountedScheduler: ReturnType<typeof createCommitScheduler> | null = null;
  let mountedOutputCoordinator: OutputCoordinator | null = null;
  let mountedStreamLifecycle: MountedStreamLifecycle | null = null;
  let mountedCommit: (() => CoordinatedWriteResult) | null = null;
  let mountedCreateOutputStateRollback: (() => () => void) | null = null;
  let mountedAlternateScreen = false;
  let mountedFullscreenCursorHidden = false;
  let terminalEventOwnershipActive = false;
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
  // True only once Vue's own app.mount() returned. Vue records its container
  // ownership at the end of a successful patch, so this is also the only state
  // in which a Vue-side unmount can do anything at all.
  let vueMountCompleted = false;
  let vueCleanupCompleted = false;
  let consoleTeardownWritesAllowed = false;
  // Tracks whether this app currently owns the liveInstances entry for its
  // stdout — set when a mount() actually wires a renderer, cleared when
  // teardown() evicts the entry. A mount() that hits the instance-reuse guard
  // wires nothing and leaves this (and all other mounted* state) untouched:
  // whether unmount()/teardown() have real work to do is derived from the
  // actually-wired state, never from a sticky "was ever guarded" flag.
  let mountedAsOwner = false;

  function setAlternateScreenOwned(owned: boolean): void {
    if (mountedAlternateScreen === owned) return;
    mountedAlternateScreen = owned;
  }

  function setFullscreenCursorHidden(hidden: boolean): void {
    if (mountedFullscreenCursorHidden === hidden) return;
    mountedFullscreenCursorHidden = hidden;
  }

  function reportTerminalAcquired(): void {
    if (terminalEventOwnershipActive) return;
    terminalEventOwnershipActive = true;
    emitTestEvent(RUNTIME_TEST_EVENT.terminalAcquired);
  }

  function reportTerminalReleased(): void {
    if (!terminalEventOwnershipActive) return;
    terminalEventOwnershipActive = false;
    emitTestEvent(RUNTIME_TEST_EVENT.terminalReleased);
  }

  function acquireSynchronizedOutputLease(): () => void {
    const releases = mountedSynchronizedOutputReleases;
    let active = true;
    const release = (): void => {
      if (!active) return;
      active = false;
      releases?.delete(release);
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
    return cleanup;
  }

  // The renderer's onCommit closure is wired at createApp time but only does
  // real work after mount swaps in scheduler.schedule. One renderer per app
  // even though it's not used until mount.
  let scheduledCommit: () => void = () => {};

  // Pending exit state — stored so resolveExit() can flush stdout before
  // settling the exit promise.
  let pendingExitError: unknown = undefined;
  let pendingExitFailure = false;
  let pendingExitErrorIsSilent = false;
  let pendingExitErrorShouldReport = false;
  let pendingFatalReport: string | null = null;
  let settlementStarted = false;
  let abandonExitSettlement = false;
  let consumedMountInProgress = false;
  let pendingMountRuntimeFailure: Error | undefined;
  let mountFailurePending = false;

  function recordTeardownError(error: unknown, options?: { readonly report?: boolean }): void {
    if (pendingExitFailure) return;
    pendingExitError = isErrorInput(error) ? error : new Error(messageForNonError(error));
    pendingExitFailure = true;
    pendingExitErrorShouldReport = options?.report !== false;
  }

  function recordVueMountFailure(error: unknown): void {
    if (pendingExitFailure) return;
    // An unhandled initial component throw escaped through Vue itself. Preserve
    // that exact JavaScript value at the consumed mount boundary; Runtime does
    // not install a hidden component boundary or turn it into a durable report.
    pendingExitError = error;
    pendingExitFailure = true;
    pendingExitErrorShouldReport = false;
  }

  // After accepting Static output, Vue may still flush the acceptance patch that
  // replaces committed hosts with anchors. Exit settlement waits for those
  // deferred ticks so waitUntilExit does not resolve mid-patch.
  const pendingAcceptedStaticCleanupBatches = new Set<object>();

  function settleAcceptedStaticCleanup(batch: object): void {
    if (!pendingAcceptedStaticCleanupBatches.delete(batch)) return;
    if (teardownStarted) resolveExit();
  }

  function disposeMountedStreamLifecycle(): void {
    const streamLifecycle = mountedStreamLifecycle;
    mountedStreamLifecycle = null;
    if (!streamLifecycle) return;
    try {
      streamLifecycle.dispose();
    } catch (error) {
      recordTeardownError(error);
    }
  }

  let runtimeFailureTeardownQueued = false;
  let runtimeFailurePending = false;
  function requestRuntimeFailure(error: unknown, options?: { readonly silent?: boolean }): void {
    const normalizedError = isErrorInput(error) ? error : new Error(messageForNonError(error));
    runtimeFailurePending = true;
    if (!pendingExitFailure) {
      pendingExitError = normalizedError;
      pendingExitFailure = true;
      pendingExitErrorIsSilent = options?.silent === true;
      pendingExitErrorShouldReport = true;
    }
    if (consumedMountInProgress) {
      pendingMountRuntimeFailure ??= normalizedError;
      return;
    }
    if (abandonExitSettlement && teardownStarted) return;
    if (teardownStarted) {
      resolveExit();
      return;
    }
    if (exitInitiated || runtimeFailureTeardownQueued) return;
    exitInitiated = true;
    runtimeFailureTeardownQueued = true;
    queueMicrotask(() => {
      runtimeFailureTeardownQueued = false;
      try {
        teardown();
      } finally {
        resolveExit();
      }
    });
  }

  function guardAcceptedStaticCleanup(_statics: readonly TuiStatic[]): () => void {
    const batch = {};
    pendingAcceptedStaticCleanupBatches.add(batch);
    return () => {
      // Acceptance notifications queue the component patches that replace
      // committed hosts with stable comment anchors. Defer exit settlement
      // until after that Vue flush completes.
      void nextTick().then(
        () => settleAcceptedStaticCleanup(batch),
        () => settleAcceptedStaticCleanup(batch),
      );
    };
  }

  function resolveExit() {
    if (abandonExitSettlement) return;
    if (settlementStarted) return;
    if (pendingAcceptedStaticCleanupBatches.size > 0) {
      pendingSettlement = true;
      return;
    }
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
    // Nothing wired: this app never reached stream reservation.
    if (!mountedAppContext) {
      disposeMountedStreamLifecycle();
      if (pendingExitFailure) {
        exitReject(pendingExitError);
      } else {
        exitResolve();
      }
      return;
    }
    const appContext = mountedAppContext;

    const stdout = (appContext?.stdout ?? process.stdout) as MaybeWritableStream;

    const finish = () => {
      disposeMountedStreamLifecycle();
      if (pendingExitFailure) {
        exitReject(pendingExitError);
      } else {
        exitResolve();
      }
    };

    const report = pendingFatalReport;
    pendingFatalReport = null;
    void (async () => {
      try {
        try {
          await mountedStreamLifecycle?.waitForIdle();
        } catch (error) {
          recordTeardownError(error);
        }
        try {
          await writeOutputBarrier(stdout);
        } catch (error) {
          recordTeardownError(error);
        }
        if (report) {
          const stderr = appContext.stderr as MaybeWritableStream;
          try {
            await writeOutputBarrier(stderr, report);
          } catch (error) {
            recordTeardownError(error);
          }
        }
        try {
          await mountedStreamLifecycle?.waitForIdle();
        } catch (error) {
          recordTeardownError(error);
        }
      } finally {
        finish();
      }
    })();
  }

  async function writeOutputBarrier(stream: MaybeWritableStream, data = ""): Promise<void> {
    const { canWriteToStdout, hasWritableState } = getWritableStreamState(stream);
    if (!canWriteToStdout) {
      throw new Error("Runtime output stream became unwritable before exit settlement.");
    }

    const coordinator = mountedOutputCoordinator;
    if (!coordinator) {
      await new Promise<void>((resolve, reject) => {
        const done = (error?: Error | null) => {
          if (error) reject(error);
          else resolve();
        };
        try {
          if (hasWritableState) stream.write(data, done);
          else stream.write(data);
          if (!hasWritableState) setImmediate(done);
        } catch (error) {
          reject(error);
        }
      });
      return;
    }

    for (;;) {
      await coordinator.waitForIdle();
      let bodyRan = false;
      const result = coordinator.run(() => {
        bodyRan = true;
        coordinator.write(stream, data);
      });
      if (result.status === "blocked") continue;
      if (!bodyRan) continue;
      if (!result.writable) await result.ready;
      await mountedStreamLifecycle?.waitForIdle();
      return;
    }
  }

  function writeBestEffort(stream: NodeJS.WriteStream, data: string, sync = false): boolean {
    if (!getWritableStreamState(stream as MaybeWritableStream).canWriteToStdout) {
      if (!sync) {
        requestRuntimeFailure(
          new Error("Runtime output stream became unwritable during terminal restoration."),
        );
      }
      return false;
    }
    try {
      if (sync) {
        // Signal exit re-raises the signal immediately after this callback
        // returns (`{alwaysLast:false}`), so a
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
    } catch (error) {
      // Stream may already be destroyed during shutdown, or the fd may be
      // unwritable; restore is best-effort.
      if (!sync) requestRuntimeFailure(error);
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
  let teardownConsoleWaitStarted = false;
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
      if (mountedNeedsTerminalLineAdvance?.()) {
        writeBestEffort(appContext.stdout, nextLineEscape, true);
      }
      if (writer.isCursorHidden()) writeBestEffort(appContext.stdout, "\x1b[?25h", true);
      writer.reset({ cursorHidden: false });
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
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      lifecycleTransactionDepth--;
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

  // `sync` abandons accepted/backpressured output before cleanup. Abrupt process
  // and signal exits additionally need synchronous restore escapes before the
  // process terminates; a Vite full reload uses the same immediate cleanup path
  // only so the replacement app can reserve the streams without waiting.
  function teardown(sync = false, immediateTermination = false) {
    // Nothing wired: this app never mounted a renderer (never mounted, or
    // every mount() hit the instance-reuse guard, which wires nothing), so
    // teardown is a complete no-op — do not touch any stream or another
    // app's WeakMap entry. Derived from actual wired state, NOT a sticky
    // "was ever guarded" flag: a guarded mount() call is inert for that call
    // only and must never disable teardown of a mount this app DID wire
    // (double-fire on its own live stdout, a later mount on a free stdout, or
    // merely targeting another app's busy stream).
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

    // A normal unmount can wait for an in-flight lifecycle transaction (for
    // example a backpressured frame) so Vue and output settle orderly. A
    // synchronous teardown — Vite full reload or abrupt process exit — must not
    // wait: the replacement mount (or process termination) needs stream ownership
    // and terminal restore without depending on a later drain.
    if (lifecycleTransactionDepth > 0 && !immediateTermination && !sync) {
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

    const waitForConsoleSink = (): void => {
      const consoleSink = mountedConsoleSink;
      if (!consoleSink || teardownConsoleWaitStarted) return;
      teardownConsoleWaitStarted = true;
      void consoleSink.waitForIdle().then(
        () => {
          teardownConsoleWaitStarted = false;
          if (!teardownCompleted && !teardownExecutionStarted) {
            const effectiveSync = pendingTeardownSync;
            pendingTeardownSync = false;
            performTeardown(effectiveSync, false);
          }
        },
        () => {
          teardownConsoleWaitStarted = false;
          if (!teardownCompleted && !teardownExecutionStarted) performTeardown(false, false);
        },
      );
    };

    // Freeze new work before waiting for an accepted transaction. The component
    // tree remains mounted so one final commit can still read the newest state.
    scheduledCommit = () => {};
    mountedScheduler?.cancel();
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
      !mountFailurePending &&
      !pendingExitErrorIsSilent &&
      mountedCommit &&
      stdoutWritable &&
      (mountedDynamicUpdatesLive || !pendingExitFailure)
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

    // Vue cleanup is synchronous once the final component-backed frame has
    // either been accepted or deliberately skipped. Keep this app's console
    // registration active throughout cleanup, then wait for every intercepted
    // record to enter and drain through the output coordinator before restoring
    // the previous console owner.
    if (!immediateTermination && !vueCleanupCompleted) {
      runMountedVueCleanup();
    }
    if (!sync && !immediateTermination && mountedConsoleSink?.isIdle() === false) {
      waitForConsoleSink();
      return;
    }
    if ((sync || immediateTermination) && mountedConsoleSink?.isIdle() === false) {
      coordinator?.abort(
        new Error("Console output was abandoned by synchronous terminal teardown."),
      );
    }

    const completeTeardown = (): void => {
      if (teardownCompleted) return;
      if (mountedAsOwner && mountedAppContext) {
        liveInstances.delete(mountedAppContext.stdout);
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
      reportTerminalReleased();
      if (abandonExitSettlement) {
        // A Vite full reload replaces this application without representing an
        // application exit. Release stream observers and retained host
        // references, but deliberately leave waitUntilExit() unsettled so the
        // dev-server exit channel is not triggered.
        pendingSettlement = false;
        disposeMountedStreamLifecycle();
        mountedOutputCoordinator = null;
        mountedAppContext = null;
        mountedCommit = null;
        mountedGetLastOutput = null;
        return;
      }
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
        void restoration.ready.then(completeTeardown, (error) => {
          recordTeardownError(error);
          rollbackRestoration?.();
          performEmergencyTerminalRestore();
          completeTeardown();
        });
      }
    } catch (error) {
      recordTeardownError(error);
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
        } catch (error) {
          recordTeardownError(error);
        }
      };
      const appContext = mountedAppContext!;

      if (mountedUnsubscribeSuspension) {
        const unsubscribe = mountedUnsubscribeSuspension;
        mountedUnsubscribeSuspension = null;
        runBestEffort(unsubscribe);
      }

      // Remove the signal-exit handler first only on the cooperative path, where
      // it stops the handler from firing later. teardownStarted also guards re-entry.
      //
      // On a terminating path the unsubscribe is not merely redundant, it is
      // actively harmful. signal-exit@4 `emit()` iterates its LIVE listener
      // array (`for (const fn of this.listeners[ev])`) while this unsubscribe
      // `splice`s that same array, so an app that removes ITSELF mid-dispatch
      // shifts the cursor past its neighbour and the next app's handler never
      // runs — stranding a second app on the same terminal in raw mode.
      // Leaving the token registered cannot double-run: the emitter latches
      // `emitted.exit` before dispatching, and the process is terminating
      // regardless. (Node's own EventEmitter clones its handler array before
      // emitting, so the `process.on("exit")` path never had this hazard.) The
      // earlier claim that this call was a signal-path no-op held only for the
      // PROCESS signal listeners that `unload()` removes; the emitter's own
      // listener array stays live and mutable during the dispatch.
      //
      // Gating on `immediateTermination` alone is sufficient, and deliberately
      // so. Removing a LATER-registered app is harmless — the tail shifts left
      // into the cursor's next step, so nothing is skipped — and removing an
      // EARLIER one is unreachable, because every app before the cursor has
      // already torn down and `teardownStarted` makes its unsubscribe a no-op.
      // signal-teardown-cross-unmount.sequential.test.tsx pins that reasoning
      // with a real cross-app unmount driven from a Vue cleanup hook, so a
      // future change that makes teardown re-entrant fails there.
      if (mountedUnsubscribeExit && !immediateTermination) {
        const unsubscribe = mountedUnsubscribeExit;
        mountedUnsubscribeExit = null;
        runBestEffort(unsubscribe);
      }

      const stdout = mountedAppContext?.stdout;
      const stdoutWritable = stdout
        ? getWritableStreamState(stdout as MaybeWritableStream).canWriteToStdout
        : false;
      if (mountedConsoleSink) {
        const consoleSink = mountedConsoleSink;
        mountedConsoleSink = null;
        runBestEffort(consoleSink.release);
      }
      consoleTeardownWritesAllowed = false;
      if (mountedRenderedTargets) {
        const renderedTargets = mountedRenderedTargets;
        mountedRenderedTargets = null;
        setRenderedTargetController(appContext, null);
        runBestEffort(() => renderedTargets.dispose());
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
      if (mountedKittyController) {
        // Disable-kitty is a restore escape: on the signal path it must flush
        // synchronously too.
        const kittyController = mountedKittyController;
        mountedEmergencyKittyController = kittyController;
        mountedKittyController = null;
        runBestEffort(() => kittyController.dispose(sync));
      }
      if (!mountedDynamicUpdatesLive && mountedAppContext && !pendingExitFailure) {
        // The dynamic frame was deferred during rendering. The final commit()
        // above refreshed lastOutput to the current tree, so write that latest
        // frame once, adding a line ending only when it needs one.
        const lastFrame = mountedGetLastOutput?.() ?? "";
        const finalDocument =
          lastFrame === "" || lastFrame.endsWith("\n") ? lastFrame : `${lastFrame}\n`;
        if (finalDocument !== "") {
          writeBestEffort(mountedAppContext.stdout, finalDocument, sync);
        }
      }
      // A viewport-filling Inline frame intentionally has no trailing newline
      // while it is live. Advance exactly once before restoring the cursor so a
      // following shell prompt cannot append to the frame's final row. NEL moves
      // to column zero even when the terminal does not translate LF to CRLF.
      if (mountedWriter && mountedDynamicUpdatesLive && mountedAppContext && stdoutWritable) {
        const writer = mountedWriter;
        if (mountedNeedsTerminalLineAdvance?.()) {
          writeBestEffort(mountedAppContext.stdout, nextLineEscape, sync);
        }
        if (sync) {
          if (writer.isCursorHidden()) {
            writeBestEffort(mountedAppContext.stdout, "\x1b[?25h", true);
          }
          writer.reset({ cursorHidden: false });
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
      if (mountedRoot) {
        runBestEffort(() => releasePaintCaches(mountedRoot!));
      }
      runBestEffort(() => mountedHostYogaLedger?.rollback());
      if (mountedRoot) {
        runBestEffort(() => detachYoga(mountedRoot!));
      }
      mountedRoot = null;
      mountedHostYogaLedger = null;
      vueMountCompleted = false;
      if (mountedResizeHandler && mountedAppContext) {
        const resizeHandler = mountedResizeHandler;
        runBestEffort(() => {
          mountedAppContext?.stdout.off("resize", resizeHandler);
        });
        mountedResizeHandler = null;
      }
      if (mountedExitListener) {
        const exitListener = mountedExitListener;
        runBestEffort(() => {
          process.off("exit", exitListener);
        });
        mountedExitListener = null;
      }
      if (mountedBeforeExitHandler) {
        const beforeExitHandler = mountedBeforeExitHandler;
        runBestEffort(() => {
          process.off("beforeExit", beforeExitHandler);
        });
        mountedBeforeExitHandler = null;
      }
      if (mountedStdinController) {
        // Pass sync through so an HMR replacement cannot wait behind stale
        // control output. Only a non-returning process/signal exit needs the
        // extra idempotent OFF reissue after Vue's ordinary lease cleanup.
        const stdinController = mountedStdinController;
        mountedEmergencyStdinController = stdinController;
        mountedStdinController = null;
        stdinController.setCleanupErrorSink(recordTeardownError);
        runBestEffort(() => stdinController.dispose(sync, immediateTermination));
        stdinController.setCleanupErrorSink(null);
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
      if (mountedDevApp) {
        const devApp = mountedDevApp;
        mountedDevApp = null;
        runBestEffort(() => unregisterDevApp(devApp));
      }

      if (
        pendingExitErrorShouldReport &&
        !pendingExitErrorIsSilent &&
        isErrorInput(pendingExitError)
      ) {
        const report = sanitizeAnsiMultiline(formatErrorForStderr(pendingExitError));
        // A TTY stderr alone does not imply that this application owns a live
        // terminal surface. Redirected/non-TTY stdout selects the document host,
        // which must never emit cursor controls even when diagnostics still go
        // to the user's terminal.
        const output = `${
          appContext.stdout.isTTY && appContext.stderr.isTTY ? nextLineEscape : ""
        }${report}`;
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

  const hostYogaLedger = createHostYogaAllocationLedger();
  mountedHostYogaLedger = hostYogaLedger;
  const renderer = createRenderer<TuiNode, TuiNode>(
    buildNodeOps({
      onCommit: () => scheduledCommit(),
      hostYogaLifetime: hostYogaLedger.lifetime,
    }),
  );

  let mountedUserRoot: ComponentPublicInstance | null = null;
  const captureUserRoot = (instance: ComponentPublicInstance | null): void => {
    mountedUserRoot = instance;
  };
  const devOverlayEnabled = isDevConnected();
  if (devOverlayEnabled) {
    // initHmrBridge already ran inside connectDevtools() with a live hot.
    // Clear any dev status left in the module-global `devState` by a previous
    // app in this dev process, so this fresh app never renders a stale Build
    // Error / HMR-update overlay instead of its own content.
    resetDevState();
    root = createDevOverlayWrapper(root, rootProps ?? undefined, captureUserRoot);
    rootProps = undefined;
  }

  const baseApp = renderer.createApp(root, rootProps ?? null);
  const originalMount = baseApp.mount.bind(baseApp);
  const originalUnmount = baseApp.unmount.bind(baseApp);

  function runMountedVueCleanup(): void {
    if (vueCleanupCompleted) return;
    vueCleanupCompleted = true;
    if (!vueMountStarted) return;
    vueMountStarted = false;
    consoleTeardownWritesAllowed = mountedConsoleSink !== null;
    try {
      originalUnmount();
    } catch (error) {
      recordTeardownError(error);
    }
  }

  function rollbackPartialVueMount(): void {
    if (vueCleanupCompleted) return;
    vueCleanupCompleted = true;
    vueMountStarted = false;
    consoleTeardownWritesAllowed = mountedConsoleSink !== null;
    // Vue-side rollback goes exactly as far as Vue itself does, and no further.
    // If app.mount() returned and a later Runtime step failed, the ordinary Vue
    // unmount tears the tree down. If Vue's own mount threw, Vue never took
    // container ownership, so there is nothing it can unmount — plain Vue runs
    // no cleanup for that case either, and Runtime does not manufacture the
    // missing ownership link out of Vue-private state to do more. Runtime-owned
    // resources are still released: the Yoga ledger below frees every
    // allocation, and the caller's rollback restores terminal and stream state.
    if (vueMountCompleted) {
      vueMountCompleted = false;
      try {
        originalUnmount();
      } catch (error) {
        recordTeardownError(error);
      }
    }
    hostYogaLedger.rollback();
  }

  // Vue creates the backing App object; Runtime replaces mount and installs the
  // two wait methods below before this object can escape createApp().
  const app = baseApp as unknown as TuiApp;
  let mountAttemptConsumed = false;

  const runtimeMount = function mount(
    this: void,
    options: MountOptions = {},
  ): ComponentPublicInstance {
    if (mountAttemptConsumed) {
      throw new Error("A vue-tui app instance can only be mounted once");
    }
    // The mount contract is validated before reading stream getters, checking
    // stream ownership, or mutating Vue/terminal state.
    assertKnownMountOptionKeys(options);
    const internalOptions = getInternalMountOptions(options);
    const requestedMode = normalizeRequestedMode(options);
    const color = normalizeColorOption(
      (options as { readonly color?: unknown }).color,
      true,
      "Mount",
    );
    const exitOnCtrlC = validateExitOnCtrlC(
      (options as { readonly exitOnCtrlC?: unknown }).exitOnCtrlC,
    );
    const patchConsole = validatePatchConsole(
      (options as { readonly patchConsole?: unknown }).patchConsole,
    );
    const onRender = internalOptions.onRender;
    // The default keeps the render throttle active so sustained animation
    // updates are coalesced without requiring an option.
    const maxFps = internalOptions.maxFps ?? 30;
    const resolvedStdout = options.stdout ?? process.stdout;
    const resolvedStdin = options.stdin ?? process.stdin;
    const resolvedStderr = options.stderr ?? process.stderr;
    assertWritableStream(resolvedStdout, "stdout");
    assertReadableStream(resolvedStdin, "stdin");
    assertWritableStream(resolvedStderr, "stderr");
    const stdout = resolvedStdout as NodeJS.WriteStream;
    const stdin = resolvedStdin as NodeJS.ReadStream;
    const stderr = resolvedStderr as NodeJS.WriteStream;
    const terminalStyle =
      color === true && internalOptions.terminalStyle !== undefined
        ? internalOptions.terminalStyle
        : color === true
          ? resolveTerminalStyle({ color, stdout, environment: process.env })
          : resolveTerminalStyle({ color });
    if (liveInstances.has(stdout)) {
      throw new Error("Cannot mount vue-tui: the selected stdout already has a live app.");
    }

    // Internal deterministic-test observer. It observes the resolved session
    // and renderer content commits without selecting another output path.
    const renderObserver = internalOptions[INTERNAL_RENDER_OBSERVER];
    const kittyKeyboard = internalOptions[INTERNAL_KITTY_KEYBOARD];
    const configuredTerminalSizeProbe = internalOptions[INTERNAL_TERMINAL_SIZE_PROBE];
    const suspensionHost = internalOptions[INTERNAL_SUSPENSION_HOST] ?? processSuspensionHost;
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

    const stdoutFacts = {
      isTTY: Boolean(stdout.isTTY),
      columns: stdout.columns,
      rows: stdout.rows,
    } as const;
    const terminalProbe: TerminalSizeProbeResult = needsTerminalSizeProbe(stdoutFacts)
      ? terminalSizeProbe()
      : { kind: "unavailable" };
    if (requestedMode === "fullscreen") {
      assertFullscreenCapability(stdout, terminalProbe);
    }
    const surface = resolveLiveSurface({
      requestedMode,
      stdout: stdoutFacts,
      terminalProbe,
    });
    // Live TTY surfaces update continuously; the non-TTY document host is final-only.
    const dynamicUpdatesLive =
      surface.kind === "inline-terminal" || surface.kind === "fullscreen-terminal";
    const fixedFullscreenSurface = surface.kind === "fullscreen-terminal";
    const boundedInlineSurface = surface.kind === "inline-terminal";
    const inlineTerminalSurface = surface.kind === "inline-terminal";
    // Supported secondary document host: non-TTY final-stream with modeled layout.
    const documentHostSurface = surface.kind === "final-stream";
    const boundedDocumentSurface = documentHostSurface;

    // Deterministic option, stream, capability, ownership, and surface
    // preflight ends here. From this point every consumed operation is covered
    // by the rollback catch below.
    let leaveMountLifecycleTransaction: (() => void) | null = null;
    mountAttemptConsumed = true;
    consumedMountInProgress = true;
    try {
      const renderSession = createLiveRenderSessionService(surface, terminalStyle);

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
        // Document hosts keep the fixed modeled layout for the whole lifetime.
        if (boundedDocumentSurface) {
          return {
            terminal: null,
            layout: {
              columns: surface.session.dimensions.layout.columns,
              rows: surface.session.dimensions.layout.rows,
            },
          };
        }
        return next;
      }

      mountedDynamicUpdatesLive = dynamicUpdatesLive;

      let failureOutputCoordinator: OutputCoordinator | null = null;
      const streamLifecycle = createMountedStreamLifecycle({
        stdin,
        stdout,
        stderr,
        hasManagedInputDemand: () => mountedStdinController?.hasManagedInputDemand() ?? false,
        onFailure(error) {
          failureOutputCoordinator?.abort(error);
          requestRuntimeFailure(error);
        },
      });
      mountedStreamLifecycle = streamLifecycle;
      const outputCoordinator = createOutputCoordinator({
        trackWrite: (stream) => streamLifecycle.trackWrite(stream),
        onDeferredError(error) {
          mountedAbandonPendingTerminalOutput?.({ physicalStateUncertain: true });
          // A prior BSU may already have been accepted while its matching ESU was
          // still queued behind the failed segment. Close that terminal mode
          // synchronously before the fatal lifecycle turn starts.
          closeOutstandingSynchronizedOutput();
          requestRuntimeFailure(error);
        },
      });
      failureOutputCoordinator = outputCoordinator;
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
          requestRuntimeFailure(new Error(FULLSCREEN_STATIC_ERROR));
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
            runSuspensionStep(() => writer.reset({ cursorHidden: false }));
          }
          frameState.lastOutput = "";
          frameState.lastOutputToRender = "";
          frameState.outputHeight = 0;
          reportTerminalReleased();
          return;
        }

        if (!inlineTerminalSurface || !dynamicUpdatesLive || !writer) return;
        mountedGeometry?.setSurfaceAvailable(false);
        if (rememberSurface) suspendedInlineSurface = true;
        if (mountedNeedsTerminalLineAdvance?.()) {
          writeBestEffort(stdout, nextLineEscape, true);
        }
        const cursorWasHidden = writer.isCursorHidden();
        const cursorShown = !cursorWasHidden || writeBestEffort(stdout, "\x1b[?25h", true);
        runSuspensionStep(() =>
          writer.reset({
            cursorHidden: cursorWasHidden && !cursorShown,
          }),
        );
        frameState.lastOutput = "";
        frameState.lastOutputToRender = "";
        frameState.outputHeight = 0;
        inlineRegionStarted = false;
        reportTerminalReleased();
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
          runSuspensionStep(() => mountedScheduler?.cancel());
          runSuspensionStep(() => mountedKittyController?.suspend(true));
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
        const awaitVueUpdate = async (): Promise<boolean> => {
          try {
            await nextTick();
            return true;
          } catch {
            // Vue owns component update errors. A failed render invalidates the
            // prepared host paint, but it is not a Runtime resume failure and
            // must not trigger terminal reacquisition or application teardown.
            applyPreparedSurface = null;
            return false;
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
          if (applyPreparedSurface && !(await awaitVueUpdate())) return;
          while (
            applyPreparedSurface &&
            !teardownStarted &&
            terminalSuspended &&
            resumeCoveredResizeGeneration !== resizeEventGeneration
          ) {
            runLifecycleTransaction(prepareContinuedSurface);
            if (!(await awaitVueUpdate())) return;
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
              if (!(await awaitVueUpdate())) return;
              while (
                !teardownStarted &&
                terminalSuspended &&
                resumeCoveredResizeGeneration !== resizeEventGeneration
              ) {
                runLifecycleTransaction(prepareContinuedSurface);
                if (!(await awaitVueUpdate())) return;
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
                mountedGeometry?.setSurfaceAvailable(true);
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
              suspendedFullscreenSurface = false;
              suspendedInlineSurface = false;
              resizeHandledGeneration = Math.max(
                resizeHandledGeneration,
                resumeCoveredResizeGeneration,
              );
              reconcileManagedTerminalOutput();
              // A continued session owns more than its painted surface: raw
              // input and parser modes are part of the same terminal lease.
              // Paint completion happens before stdin.resume(), so reporting
              // from the ordinary commit hook exposes a cooked-mode window to
              // observers that act as soon as ownership is announced.
              reportTerminalAcquired();
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
        // Use `||` (not `??`): an EMPTY lastOutputToRender — its initial value before
        // the first content commit or the value the resize-boundary path assigns —
        // must fall back to `lastOutput + "\n"`. `??` only falls back for
        // null/undefined, so an empty string would restore nothing after an
        // external write.
        writer.write(frameState.lastOutputToRender || frameState.lastOutput + "\n");
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
        if ((teardownStarted && !consoleTeardownWritesAllowed) || terminalSuspended) {
          return blockedCoordinatedWrite();
        }
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
              if (!dynamicUpdatesLive) {
                writeRuntimeOutput(stdout, outputData);
                return;
              }
              // Mirror the render path: wrap clear+write+restore in BSU/ESU when the
              // terminal supports synchronized updates, so the three-step sequence is
              // atomic and prevents tear/flicker.
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
        if ((teardownStarted && !consoleTeardownWritesAllowed) || terminalSuspended) {
          return blockedCoordinatedWrite();
        }
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
              if (!dynamicUpdatesLive) {
                writeRuntimeOutput(stderr, outputData);
                return;
              }
              // BSU/ESU are emitted on stdout because synchronized-update mode is a
              // stdout capability, while the actual data remains on stderr. The sync
              // gate therefore also uses stdout's TTY capability.
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
        exit(error?: Error) {
          // The first exit captures its error and initiates teardown; later calls
          // are inert so they cannot overwrite the selected result.
          //
          // app.unmount() runs teardown()+resolveExit() without setting
          // exitInitiated, so a retained useApp().exit() called re-entrantly during
          // unmount would otherwise overwrite the selected result and queue a later
          // settlement microtask.
          // Gating on teardownStarted too makes exit() a no-op once unmount/
          // teardown is in progress. At the FIRST exit() both flags are false, so
          // a normal exit-from-Vue-cycle still proceeds.
          if (exitInitiated || teardownStarted) return;
          if (error !== undefined && !isErrorInput(error)) {
            throw new TypeError("useApp().exit() accepts only an Error or no argument");
          }
          exitInitiated = true;
          // Record the FIRST value/error synchronously (before the deferred
          // teardown microtask) so a re-entrant exit() — which is blocked above
          // anyway — and the eventual resolveExit() always settle on this value.
          if (error !== undefined) {
            if (!pendingExitFailure) {
              pendingExitError = error;
              pendingExitFailure = true;
              pendingExitErrorShouldReport = true;
            }
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
        stdout,
        stderr,
        stdin,
        // Document hosts may parse mounted stdin bytes but never own its raw mode.
        isRawModeSupported: boundedDocumentSurface ? false : hasRawInputCapability(stdin),
        setRawMode(mode: boolean) {
          if (boundedDocumentSurface) return;
          if (
            typeof (stdin as { setRawMode?: (mode: boolean) => unknown }).setRawMode === "function"
          ) {
            (stdin as { setRawMode: (mode: boolean) => unknown }).setRawMode(mode);
          }
        },
        writeToStdout,
        writeToStderr,
      };
      mountedAppContext = appContext;
      // Reserve the stream only after every mount option and session fact needed
      // above has been read successfully. From this point teardown can always
      // find mountedAppContext and release the reservation on a setup failure.
      liveInstances.set(stdout, app);
      mountedAsOwner = true;
      mountedRenderSession = renderSession;
      streamLifecycle.activate();
      if (pendingMountRuntimeFailure) throw pendingMountRuntimeFailure;
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

      // Termination cleanup is independent from output cadence. A final-output
      // app can still acquire raw, paste, or explicit Kitty state through
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

      let kittyController: ReturnType<typeof createKittyKeyboardController> | undefined;
      const stdinController = createStdinController(stdin, {
        appCtx: appContext,
        exitOnCtrlC,
        beforeManagedInputAcquire: ensureFullscreenSurface,
        isManagedInputSurfaceReady: () =>
          !terminalSuspended &&
          (!fixedFullscreenSurface || (mountedAlternateScreen && mountedFullscreenCursorHidden)),
        isKittyKeyboardReady: () => kittyController?.isReady ?? true,
        writeTerminalOutput,
        requestTerminalReconcile,
        reportManagedInputFailure(error) {
          requestRuntimeFailure(error);
        },
        acquireKittyKeyboardDemand() {
          return kittyController?.acquireDemand() ?? (() => {});
        },
      });
      mountedStdinController = stdinController;

      // These pre-mount steps can throw SYNCHRONOUSLY on a hostile/broken
      // terminal: attachYoga() allocates a WASM yoga node, and later Vue setup
      // may acquire semantic input whose exposed raw-mode or protocol operations
      // fail. liveInstances.set(stdout, app) already ran above, so a
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
        // when raw mode is available; the shared listener itself needs only data.
        mountedKittyController = kittyController;
        reconcileManagedTerminalOutput = () => {
          try {
            kittyController?.reconcile();
            stdinController.reconcileTerminalState();
          } catch (error) {
            if (!teardownStarted) {
              requestRuntimeFailure(error);
            }
          }
        };

        tuiRoot = createRoot(appContext);
        attachYoga(tuiRoot);
        // Record the root immediately after attachment so teardown frees it if
        // later setup fails.
        mountedRoot = tuiRoot;
        const focusController = createInternalFocusController({
          root: tuiRoot,
        });
        mountedFocusController = focusController;
        const geometry = createInternalGeometryService(() => scheduledCommit());
        mountedGeometry = geometry;
        setInternalGeometryService(appContext, geometry);
        const renderedTargets = createRenderedTargetController(tuiRoot, [
          focusController,
          geometry,
        ]);
        mountedRenderedTargets = renderedTargets;
        setRenderedTargetController(appContext, renderedTargets);
      } catch (err) {
        recordTeardownError(err);
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
        write: (data) => writeRuntimeOutput(stdout, data),
      });
      mountedWriter = writer;

      function createOutputStateRollback(): () => void {
        const rollbackWriter = writer.createRollback();
        const previousFrameState = { ...frameState };
        const previousInlineRegionStarted = inlineRegionStarted;
        const previousAlternateScreen = mountedAlternateScreen;
        const previousFullscreenCursorHidden = mountedFullscreenCursorHidden;
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
          fullscreenBaselineValid = previousFullscreenBaselineValid;
          fullscreenBaselineColumns = previousFullscreenBaselineColumns;
          fullscreenBaselineRows = previousFullscreenBaselineRows;
        };
      }
      mountedCreateOutputStateRollback = createOutputStateRollback;

      function reportFullscreenSurfaceAcquiredIfReady(): void {
        if (mountedAlternateScreen && mountedFullscreenCursorHidden && !terminalResumeInProgress) {
          reportTerminalAcquired();
        }
      }

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
              reportFullscreenSurfaceAcquiredIfReady();
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
              reportFullscreenSurfaceAcquiredIfReady();
              requestTerminalReconcile();
            })
          ) {
            fullscreenCursorHidePending = false;
            accepted = false;
          }
        }
        return accepted;
      }

      const synchronize = shouldSynchronize(stdout);

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

      function repaintFullscreen(
        output: string,
        options: {
          readonly writeBefore?: () => void;
          /** Side-channel output invalidates every row, even when frame text is unchanged. */
          readonly forceFull?: boolean;
        } = {},
      ): boolean {
        const viewportColumns = renderSession.session.dimensions.layout.columns;
        const viewportRows = renderSession.session.dimensions.layout.rows;
        const dimensionsMatch =
          fullscreenBaselineColumns === viewportColumns && fullscreenBaselineRows === viewportRows;
        if (
          options.writeBefore === undefined &&
          fullscreenBaselineValid &&
          dimensionsMatch &&
          output === frameState.lastOutput
        ) {
          return false;
        }
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
              writeRuntimeOutput(stdout, hideCursorEscape);
              options.writeBefore?.();
            },
            () => {
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
                // Keep the physical cursor at the frame bottom so later
                // relative rewrites and teardown start from a known anchor.
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
        });
        return true;
      }

      function writePreparedStatic(
        prepared: PreparedStaticOutput,
        chunk: string,
        onHandoff?: () => void,
      ): void {
        writeRuntimeOutput(stdout, chunk, undefined, () => {
          onHandoff?.();
          prepared.accept(guardAcceptedStaticCleanup);
        });
      }

      function renderInteractiveFrame(
        output: string,
        outputHeight: number,
        preparedStatic: PreparedStaticOutput,
        staticHooks?: {
          readonly onHandoff: () => void;
          readonly onPrepared: () => void;
        },
      ): boolean {
        const staticOutput = preparedStatic.output;
        const hasStaticOutput = staticOutput !== "";
        const isTty = !!stdout.isTTY;
        const viewportRows = renderSession.session.dimensions.layout.rows;

        if (fixedFullscreenSurface) {
          return repaintFullscreen(output);
        }

        if (output !== "" || hasStaticOutput) {
          ensureInlineRegionStart();
        }

        // A frame that fills or exceeds the viewport gets no trailing newline.
        // Only apply when writing to a real TTY — piped output always gets trailing newlines.
        const fillsViewport = isTty && viewportRows !== null && outputHeight >= viewportRows;
        const outputToRender = fillsViewport ? output : output + "\n";

        let frameWritten = hasStaticOutput;
        if (hasStaticOutput) {
          // Clear frame -> write static -> re-render frame via log-update
          runSynchronizedOutput(() => {
            writer.clear();
            writePreparedStatic(preparedStatic, staticOutput, staticHooks?.onHandoff);
            staticHooks?.onPrepared();
            writer.write(outputToRender);
          });
        } else {
          // Compare the raw frame so an initially empty app never enters
          // log-update and therefore emits no cursor escapes.
          const willRender = writer.willRender(outputToRender);
          if (output !== frameState.lastOutput) {
            frameWritten = true;
            const shouldWrap = synchronize && willRender;
            if (shouldWrap) runSynchronizedOutput(() => writer.write(outputToRender));
            else writer.write(outputToRender);
          }
        }

        frameState.lastOutput = output;
        frameState.lastOutputToRender = outputToRender;
        frameState.outputHeight = outputHeight;
        return frameWritten;
      }

      // Produce the visual dynamic frame for a given terminal width. Static
      // output is handled separately by commit().
      function renderFrame(
        dynamicRoot: TuiRoot,
        width: number,
        viewportRows?: number,
        geometry?: InternalGeometryPaintFrame,
      ): string {
        const output = paint(dynamicRoot, {
          terminalStyle: renderSession.terminalStyle,
          viewport: viewportRows === undefined ? undefined : { width, height: viewportRows },
          geometry,
        });
        // The hard paint viewport is the primary guard. Keep a final physical
        // row bound as defense-in-depth for future paint extensions: Inline
        // must never let an application frame exceed terminal-addressable rows.
        return (boundedInlineSurface || boundedDocumentSurface) && viewportRows !== undefined
          ? output.split("\n").slice(0, viewportRows).join("\n")
          : output;
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
        readonly markStaticHanded: (frame: string) => void;
        readonly markFrameWritten: (frame: string) => void;
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
        if (runtimeFailurePending || mountFailurePending) return acceptedCoordinatedWrite;
        if (rejectedFullscreenStatic) return acceptedCoordinatedWrite;
        if (terminalSuspended && !terminalResumePainting) {
          // Suspension pauses physical terminal ownership, not Vue or accepted
          // component lifetimes. Keep rendered-target validity current so a
          // hidden or detached focus boundary cannot retain logical ownership
          // until the terminal resumes.
          mountedRenderedTargets?.reconcile();
          return acceptedCoordinatedWrite;
        }
        if (rejectUnsupportedFullscreenStatic()) return acceptedCoordinatedWrite;

        // Fullscreen ownership must be physically established before user
        // onRender callbacks run. Keep acquisition as its own finite transaction:
        // if it backpressures, the frame is prepared only after drain; if a callback
        // terminates during the later frame, emergency teardown can restore a
        // surface that the stream has already accepted.
        if (fixedFullscreenSurface && (!mountedAlternateScreen || !mountedFullscreenCursorHidden)) {
          const surface = runOutputTransaction(() => {
            // A rendered target can establish state only after Vue has
            // attached its host node. Reconcile it before the first terminal
            // mutation so input acquisition observes the current tree.
            mountedRenderedTargets?.reconcile();
            ensureFullscreenSurface();
          });
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
        let frameWritten = false;
        // What this commit actually put on the terminal. Reported with
        // `paint:committed` so an observer does not have to re-derive it from the
        // byte stream: synchronized-output markers wrap coordinated side output
        // too (Vite's own diagnostics among it), and Fullscreen commits by line
        // diff, so "the last synchronized block" is neither reliably the app's
        // frame nor reliably a whole one.
        let committedFrame = "";
        const initialRollback = createOutputStateRollback();
        let postStaticRollback: (() => void) | undefined;

        const result = runOutputTransaction(
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
              markStaticHanded(frame) {
                staticHanded = true;
                frameWritten = true;
                committedFrame = frame;
              },
              markFrameWritten(frame) {
                frameWritten = true;
                committedFrame = frame;
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
              if (frameWritten) {
                if (!terminalResumeInProgress) reportTerminalAcquired();
                emitTestEvent(RUNTIME_TEST_EVENT.paintCommitted, { frame: committedFrame });
              }
              options.onAccepted?.();
            },
            onUnhandedFailure() {
              if (staticHanded && postStaticRollback) postStaticRollback();
              else initialRollback();
              abandonCommit({ physicalFailure: bodyCompleted });
            },
          },
        );
        if (result.status === "blocked" && options.retryWhenBlocked !== false) {
          requestBlockedFrameRetry(result.ready);
        }
        return result;
      }

      function commitFrame(hooks: CommitSettlementHooks) {
        if (runtimeFailurePending || mountFailurePending) return;
        if (rejectedFullscreenStatic) return;
        if (terminalSuspended && !terminalResumePainting) return;
        const staticNodes = findStatics(tuiRoot);
        if (rejectUnsupportedFullscreenStatic(staticNodes)) return;
        const leaveLifecycleTransaction = enterLifecycleTransaction();
        let geometryFrame: InternalGeometryPaintFrame | undefined;
        let preparedStatic: PreparedStaticOutput | undefined;
        let settled = false;

        const releasePreparedState = (): void => {
          try {
            geometryFrame?.discard();
          } finally {
            leaveLifecycleTransaction();
          }
        };
        const accept = (): void => {
          if (settled) return;
          settled = true;
          try {
            geometryFrame?.commit();
            preparedStatic?.accept(guardAcceptedStaticCleanup);
          } finally {
            releasePreparedState();
          }
        };
        const abandon = ({ physicalFailure }: { readonly physicalFailure: boolean }): void => {
          if (settled) return;
          settled = true;
          try {
            if (physicalFailure) {
              preparedStatic?.abandon();
            }
          } finally {
            releasePreparedState();
          }
        };
        hooks.register(accept, abandon);

        const start = onRender ? performance.now() : 0;
        mountedRenderedTargets?.reconcile();

        // Only non-empty Static blocks participate in settlement; output-free
        // instances stay open for later content or ordinary Vue unmount. A
        // prepared block is accepted only after its stdout write returns normally.
        const w = renderSession.session.dimensions.layout.columns;
        const exactViewportRows = fixedFullscreenSurface
          ? (renderSession.session.dimensions.layout.rows ?? undefined)
          : undefined;
        const maximumRows =
          exactViewportRows === undefined && (boundedInlineSurface || boundedDocumentSurface)
            ? (renderSession.session.dimensions.layout.rows ?? undefined)
            : undefined;
        const dynamicHeight: LayoutHeightConstraint =
          exactViewportRows !== undefined
            ? { mode: "exact", rows: exactViewportRows }
            : maximumRows !== undefined
              ? { mode: "at-most", rows: maximumRows }
              : { mode: "unbounded" };
        const layout = runLayoutTransaction({
          dynamicRoot: tuiRoot,
          staticRoots: staticNodes,
          columns: w,
          dynamicHeight,
        });
        try {
          preparedStatic = prepareStaticOutput(layout, renderSession.terminalStyle);
          const staticOutput = preparedStatic.output;
          const hasStaticOutput = staticOutput !== "" && staticOutput !== "\n";
          const paintViewportRows =
            dynamicHeight.mode === "exact"
              ? dynamicHeight.rows
              : dynamicHeight.mode === "at-most"
                ? Math.min(dynamicHeight.rows, layout.dynamicHeight)
                : undefined;

          if (!dynamicUpdatesLive) {
            // Non-interactive: compute the dynamic frame now, write static
            // output after onRender, and defer dynamic output until unmount.
            geometryFrame = mountedGeometry?.beginFrame();
            const frame = renderFrame(layout.dynamicRoot, w, paintViewportRows, geometryFrame);
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
              writePreparedStatic(preparedStatic, staticOutput, () =>
                hooks.markStaticHanded(frame),
              );
            }
            return;
          }

          geometryFrame = mountedGeometry?.beginFrame();
          const frame = renderFrame(layout.dynamicRoot, w, paintViewportRows, geometryFrame);
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
            // target and geometry preparation has
            // succeeded. Either path owns Fullscreen before a user onRender
            // callback can terminate the process synchronously.
            ensureFullscreenSurface();
          }

          // Both surfaces commit the same way from here; only the acquisition
          // above differs, and renderInteractiveFrame re-checks the surface
          // itself to pick its write path.
          if (onRender) onRender({ renderTime: performance.now() - start });
          if (
            renderInteractiveFrame(frame, outputHeight, preparedStatic, {
              onHandoff: () => hooks.markStaticHanded(frame),
              onPrepared: hooks.capturePostStaticRollback,
            })
          ) {
            hooks.markFrameWritten(frame);
          }
        } finally {
          layout.dispose();
        }
      }

      // A render-throttle window derived from maxFps drives terminal commits.
      const unthrottled = maxFps <= 0;
      const renderThrottleMs =
        !unthrottled && maxFps > 0 ? Math.max(1, Math.ceil(1000 / maxFps)) : 0;

      // Non-positive maxFps commits fire every tick. Otherwise this is the
      // maxFps-derived window (34ms at the default maxFps=30).
      const scheduler = createCommitScheduler(commit, {
        immediate: unthrottled,
        throttleMs: renderThrottleMs,
        onError(error) {
          if (!teardownStarted) requestRuntimeFailure(error);
        },
      });
      mountedScheduler = scheduler;
      mountedCommit = commit;
      prepareResumeSurface = () => commit;
      scheduledCommit = () => {
        if (!runtimeFailurePending && !mountFailurePending && !resizePaintPending) {
          scheduler.schedule();
        }
      };

      // Internal provides — set before the actual mount so components can inject
      // them. User .use/.provide calls made earlier on the chain stay intact;
      // our keys are Symbols so there's no collision risk.
      baseApp.provide(InternalRenderSessionKey, renderSession);
      baseApp.provide(AppContextKey, appContext);
      baseApp.provide(InternalFocusControllerKey, mountedFocusController!);
      baseApp.provide(StdinContextKey, stdinController);
      if (devOverlayEnabled) {
        baseApp.provide(DevStateKey, devState);
        baseApp.provide(DevOverlayPresentationKey, fixedFullscreenSurface ? "absolute" : "flow");
        // Full reload REPLACES this app without reporting an application exit;
        // closing the Vite session normally unmounts it and waits for terminal
        // restoration. Keeping those paths separate prevents server.close()
        // from leaving waitUntilExit() pending forever.
        mountedDevApp = {
          replace() {
            abandonExitSettlement = true;
            teardown(true);
          },
          close() {
            app.unmount();
            return exitPromise;
          },
        };
        registerDevApp(mountedDevApp);
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

      // Patch console.log/warn/error etc. to route through writeToStdout /
      // writeToStderr so console output doesn't corrupt the rendered frame.
      // Installed before originalMount so setup-time user and dependency output
      // is coordinated from the first component turn.
      // The mount-throw catch below runs teardown(), which restores the console,
      // so a synchronous mount failure cannot leak a patched console.
      if (patchConsole) {
        mountedConsoleSink = registerConsoleSink((stream, data) => {
          try {
            if (stream === "stdout") {
              return appContext.writeToStdout(data);
            }
            if (stream === "stderr") {
              return appContext.writeToStderr(data);
            }
          } catch (error) {
            requestRuntimeFailure(error);
          }
          return undefined;
        });
      }

      // Inline cursor ownership is lazy: an empty app emits no cursor escapes,
      // while the first visible commit hides the cursor before writing.
      //
      // Fullscreen acquisition is lazy as well: after managed-input capability
      // preflight, the first input demand or commit enters the alternate screen
      // and hides the cursor before acquiring input modes or repainting.

      // Process-exit, termination, and suspension handlers are already wired
      // before terminal acquisition. This catch still routes renderer/patch-level
      // and Vue-propagated initial failures through partial-tree cleanup and the
      // same idempotent terminal rollback before preserving the original error.
      let proxy: ComponentPublicInstance;
      vueMountStarted = true;
      try {
        proxy = originalMount(tuiRoot);
        vueMountCompleted = true;
        // A semantic route created during Vue setup can begin Kitty detection,
        // but its shared stdin ingress already exists. Ordinary input beside a
        // synchronous reply is retained until setup has installed the complete
        // initial route set, then delivered in its original order here.
        stdinController.activateInputDelivery();
        if (pendingMountRuntimeFailure) throw pendingMountRuntimeFailure;
      } catch (err) {
        mountFailurePending = true;
        recordVueMountFailure(err);
        const mountError = pendingExitError;
        rollbackPartialVueMount();
        try {
          teardown(); // best-effort cursor/alt-screen restore
        } catch {
          // teardown's restore write (mountedWriter.done() -> log-update
          // showCursor -> stdout.write("\x1b[?25h")) can itself throw if
          // stdout.write fails. A failing best-effort restore must not replace
          // the first Runtime failure or Vue error selected for this mount.
        }
        throw mountError;
      }

      // Only listen for resize when dynamic output is live.
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
          const inlineMappingChanged = dimensionsChanged;

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
                    writeRuntimeOutput(stdout, hideCursorEscape);
                    if (currentRows === null) return;
                    writeRuntimeOutput(
                      stdout,
                      ansiEscapes.cursorDown(currentRows) + nextLineEscape,
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
                try {
                  await nextTick();
                } catch {
                  // A reactive component update shares this flush, but remains
                  // governed by Vue's error propagation. Discard only the host
                  // paint prepared for the failed generation and keep Runtime
                  // mounted; a newer resize generation will still be processed.
                  preparedPaint = null;
                  resizeHandledGeneration = observedGeneration;
                  continue;
                }
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
            if (!teardownStarted) requestRuntimeFailure(error);
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
      }

      const leaveLifecycleTransaction = leaveMountLifecycleTransaction;
      leaveMountLifecycleTransaction = null;
      leaveLifecycleTransaction();
      if (pendingMountSuspension && !teardownStarted) {
        pendingMountSuspension = false;
        suspendSession();
      }
      if (pendingMountRuntimeFailure) throw pendingMountRuntimeFailure;
      consumedMountInProgress = false;
      return mountedUserRoot ?? proxy;
    } catch (error) {
      mountFailurePending = true;
      consumedMountInProgress = false;
      recordTeardownError(error);
      const mountError = pendingExitError;
      const leaveLifecycleTransaction = leaveMountLifecycleTransaction;
      leaveMountLifecycleTransaction = null;
      leaveLifecycleTransaction?.();
      try {
        teardown();
      } catch (teardownError) {
        recordTeardownError(teardownError);
      } finally {
        resolveExit();
      }
      throw mountError;
    }
  };
  app.mount = runtimeMount;
  internalMountInvokers.set(app, runtimeMount as InternalMountInvoker);

  app.unmount = function unmount(): void {
    mountAttemptConsumed = true;
    try {
      teardown();
    } finally {
      resolveExit();
    }
  };

  app.waitUntilExit = function waitUntilExit(): Promise<void> {
    return exitPromise;
  };

  // Hoisted so the injected appContext (built inside mount()) can expose the
  // The app owner can wait for Vue, console, renderer, and stream work to settle.
  async function waitUntilRenderFlush(): Promise<void> {
    if (!mountedAppContext || !vueMountStarted || teardownStarted) {
      if (teardownStarted && !teardownCompleted) {
        await exitPromise.catch(() => {});
      }
      return;
    }
    const stream = mountedAppContext.stdout as MaybeWritableStream;
    const coordinator = mountedOutputCoordinator;

    // A blocked commit resolves its scheduler turn immediately, then registers
    // exactly one retry for `drain`. Loop through both layers so a waiter cannot
    // observe the old frame between those two turns.
    while (true) {
      await mountedConsoleSink?.waitForIdle();
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

    try {
      await writeOutputBarrier(stream);
    } catch (error) {
      requestRuntimeFailure(error);
      await exitPromise.catch(() => {});
    }
  }
  app.waitUntilRenderFlush = waitUntilRenderFlush;

  return app;
}
