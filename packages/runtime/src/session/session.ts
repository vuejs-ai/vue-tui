import { type Component, type ComponentPublicInstance, type App as VueApp, nextTick } from "vue";
import { createRenderer } from "vue";
import type { TerminalBackend, TerminalLease, TerminalOutput } from "../terminal/backend.ts";
import { createNodeTerminalBackend } from "../terminal/node/backend.ts";
import {
  INTERNAL_KITTY_KEYBOARD,
  createKittyKeyboardController,
  type InternalKittyKeyboardMountOptions,
} from "../terminal/kitty-keyboard.ts";
import {
  createStdinController,
  type ManagedInputSession,
  type StdinController,
} from "./stdin-controller.ts";
import { createRoot, type TuiNode, type TuiRoot, type TuiStatic } from "../host/nodes.ts";
import type { LayoutHeightConstraint } from "../layout/layout-transaction.ts";
import { attachYoga, detachYoga } from "../layout/yoga.ts";
import { buildNodeOps } from "../vue/node-ops.ts";
import {
  createHostYogaAllocationLedger,
  type HostYogaAllocationLedger,
  type HostYogaLifecycle,
  type HostYogaNode,
} from "../layout/yoga-allocation-ledger.ts";
import { createCommitScheduler } from "./scheduler.ts";
import { runRenderCommit } from "./render-commit.ts";
import { releasePaintCaches } from "../paint/paint.ts";
import type { Frame } from "../frame/frame.ts";
import { sanitizeAnsiMultiline } from "../text/sanitize-ansi.ts";
import { resolveTerminalStyle, type TerminalStyle } from "../text/terminal-style.ts";
import { findStatics, type PreparedStaticOutput } from "../paint/static-channel.ts";
import { createFrameWriter } from "../surface/frame-writer.ts";
import { createSurface, type Surface, type SurfaceRuntime } from "../surface/surface.ts";
import { encodeFrame } from "../surface/frame-encoder.ts";
import {
  createOutputCoordinator,
  type CoordinatedWriteResult,
  type OutputCoordinator,
} from "../terminal/output-coordinator.ts";
import {
  createMountedStreamLifecycle,
  type MountedStreamLifecycle,
} from "../terminal/stream-lifecycle.ts";
import {
  registerConsoleSink,
  type ConsoleSinkRegistration,
} from "../terminal/node/console-manager.ts";
import { nextLineEscape } from "../surface/cursor-helpers.ts";
import { bsu, esu, shouldSynchronize } from "../terminal/write-synchronized.ts";
import { emitTestEvent, hasTestEventSink, RUNTIME_TEST_EVENT } from "./test-events.ts";
import {
  AppContextKey,
  InternalGeometryServiceKey,
  InternalRenderSessionKey,
  RenderedTargetControllerKey,
  StdinContextKey,
  type AppContext,
} from "../vue/context.ts";
import {
  createLiveRenderSessionService,
  normalizeRequestedMode,
  resolveLiveDimensions,
  resolveLiveSurface,
  validateExitOnCtrlC,
  type InternalRenderSessionService,
  type RenderMode,
} from "./render-session.ts";
import type { ResolvedLiveDimensions } from "../surface/surface-types.ts";
import {
  INTERNAL_TERMINAL_SIZE_PROBE,
  type TerminalSizeProbe,
} from "../terminal/node/terminal-size-probe.ts";
import type { SuspensionHost } from "../terminal/node/process-suspension.ts";
import { createRenderedTargetController } from "./rendered-target.ts";
import {
  createInternalGeometryService,
  type InternalGeometryPaintFrame,
} from "./geometry-service.ts";
import { createInternalFocusController, type InternalFocusController } from "./focus-controller.ts";
import { InternalFocusControllerKey } from "../vue/focus-context.ts";
import { formatErrorForStderr } from "./error-report.ts";
import { isErrorInput, messageForNonError } from "../vue/error-value.ts";
import { normalizeColorOption, type ColorProfile } from "../frame/color-profile.ts";

/** Values Session accepts before the Node backend validates borrowed streams. */
export interface SessionMountOptions {
  readonly stdout?: unknown;
  readonly stdin?: unknown;
  readonly stderr?: unknown;
  readonly mode?: RenderMode;
  readonly color?: boolean | ColorProfile;
  readonly patchConsole?: boolean;
  readonly exitOnCtrlC?: boolean;
}

/** One renderer content commit before output-writer transformation. */
export interface InternalContentFrame {
  /**
   * Current dynamic region. Renderer-emitted SGR styling is retained; output-
   * writer lifecycle and screen-update controls are excluded.
   */
  readonly dynamic: string;
  /**
   * New `<Static>` content produced by this commit, without accumulated replay.
   * Renderer-emitted SGR styling is retained; output-writer controls are excluded.
   */
  readonly staticOutput: string;
  /** Whether the renderer committed during the mounted lifetime or teardown. */
  readonly phase: "update" | "teardown";
}

/** Deterministic instrumentation for a Session content commit. */
export interface InternalRenderObserver {
  onCommit?(frame: InternalContentFrame): void;
}

export const INTERNAL_RENDER_OBSERVER: unique symbol = Symbol.for(
  "@vue-tui/runtime:internal-render-observer",
);

/** Repository-only controls paired with an otherwise ordinary mount-options object. */
export interface InternalMountOptionPayload {
  readonly onRender?: (info: { renderTime: number }) => void;
  readonly maxFps?: number;
  readonly terminalStyle?: TerminalStyle;
  readonly [INTERNAL_KITTY_KEYBOARD]?: InternalKittyKeyboardMountOptions;
  readonly [INTERNAL_RENDER_OBSERVER]?: InternalRenderObserver;
  readonly [INTERNAL_TERMINAL_SIZE_PROBE]?: TerminalSizeProbe;
  readonly suspensionHost?: SuspensionHost;
}

const internalMountOptions = new WeakMap<object, InternalMountOptionPayload>();
const noInternalMountOptions = Object.freeze({}) as InternalMountOptionPayload;

/** Register controls constructed by Runtime's repository-only API entry. */
export function registerInternalMountOptions(
  options: object,
  payload: InternalMountOptionPayload,
): void {
  internalMountOptions.set(options, Object.freeze(payload));
}

function getInternalMountOptions(options: object): InternalMountOptionPayload {
  return internalMountOptions.get(options) ?? noInternalMountOptions;
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

function assertKnownMountOptionKeys(options: unknown): asserts options is SessionMountOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("Mount options must be an object or undefined.");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (acceptedMountOptionKeys.has(key)) continue;
    if (typeof key === "symbol") throw new TypeError("Unknown symbol mount option.");
    throw new TypeError(`Unknown mount option ${JSON.stringify(key)}.`);
  }
}

/** Concrete application shape used by Session and owning entrypoints. */
export interface SessionApp {
  mount(options?: SessionMountOptions): ComponentPublicInstance;
  unmount(): void;
  waitUntilExit(): Promise<void>;
  waitUntilRenderFlush(): Promise<void>;
}

type InternalMountInvoker = (this: void, options: SessionMountOptions) => ComponentPublicInstance;
const internalMountInvokers = new WeakMap<SessionApp, InternalMountInvoker>();

export function mountWithInternalOptions(
  app: SessionApp,
  options: SessionMountOptions,
): ComponentPublicInstance {
  const mount = internalMountInvokers.get(app);
  if (!mount) {
    throw new TypeError("Internal test mounting requires an app created by this Runtime instance.");
  }
  return mount(options);
}

export type RootProps = Record<string, unknown>;

/** Options that control one Session teardown. */
export interface SessionDisposeOptions {
  /** Bypass deferred output so a replacement can reserve the terminal immediately. */
  readonly sync?: boolean;
  /** A non-returning process exit must synchronously restore terminal modes. */
  readonly immediateTermination?: boolean;
  /** Release resources without settling the application's exit promise. */
  readonly abandonExit?: boolean;
}

/** The narrow lifecycle boundary that can own a mounted Session. */
export interface SessionMember {
  dispose(options?: SessionDisposeOptions): void;
}

/**
 * Optional integration points around one Session lifetime. The session stays
 * unaware of the owner; development supplies these hooks to replace sessions.
 */
export interface SessionAppExtension {
  prepareRoot?(
    root: Component,
    rootProps: RootProps | null,
    captureUserRoot: (instance: ComponentPublicInstance | null) => void,
  ): {
    readonly root: Component;
    readonly rootProps: RootProps | null;
  };
  configureApp?(app: VueApp<unknown>, options: { readonly fixedViewport: boolean }): void;
  mounted?(
    session: SessionMember,
    controls: {
      readonly settleExit: () => void;
      readonly waitUntilExit: () => Promise<void>;
    },
  ): void;
  disposed?(session: SessionMember): void;
  exitSettled?(): void;
}

function currentStdoutFacts(terminal: TerminalBackend, freshSize = false) {
  const stdout = terminal.capabilities.stdout;
  const size = freshSize ? terminal.refreshSize() : terminal.size;
  return { isTTY: stdout.isTTY, canWrite: stdout.canWrite, ...size };
}

const FULLSCREEN_STATIC_ERROR =
  "[vue-tui] <Static> cannot render on an effective visual Fullscreen surface. Use Inline mode for terminal history, or keep history in application state (for example, ScrollBox).";

// Module-level registry: maps each output owner to the one live application that
// owns its renderer. Keyed weakly so closed hosts do not leak memory.
// A Session with asOwner=true removes its entry during disposal.
const liveInstances = new WeakMap<object, SessionApp>();

// Error classification and fallback messages share one UI-independent source
// with render-to-string so fatal settlement stays consistent across hosts.

function validatePatchConsole(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value === "boolean") return value;
  throw new TypeError('Mount option "patchConsole" must be a boolean.');
}

function assertFullscreenCapability(stdout: ReturnType<typeof currentStdoutFacts>): void {
  // Non-TTY stdout selects the supported secondary document host for either
  // mode; Fullscreen does not throw solely because no TTY exists.
  if (!stdout.isTTY) return;
  const dimensions = resolveLiveDimensions(stdout);
  if (dimensions.terminal === null) {
    throw new Error("Fullscreen mode requires positive terminal columns and rows.");
  }
}

/**
 * One live Runtime mount and the resources it acquires.
 *
 * The application factory deliberately owns only application-lifetime state. A Session is
 * constructed after mount preflight succeeds, then dispose() reaches the exact
 * resources that mount acquired through this single object.
 */
interface SessionRuntime {
  readonly resolveExit: () => void;
  readonly requestRuntimeFailure: (error: unknown, options?: { readonly silent?: boolean }) => void;
  readonly stopScheduling: () => void;
  readonly runMountedVueCleanup: (session: Session) => void;
  readonly notifyDisposed: (session: Session) => void;
}

class Session implements SessionMember {
  readonly #runtime: SessionRuntime;
  root: TuiRoot | null = null;
  stdinController: StdinController | null = null;
  terminal: TerminalBackend | null;
  appContext: AppContext | null = null;
  resizeHandler: (() => void) | null = null;
  resizeRefresh: Promise<void> | null = null;
  exitListener: (() => void) | null = null;
  unsubscribeExit: (() => void) | null = null;
  beforeExitHandler: (() => void) | null = null;
  unsubscribeSuspension: (() => void) | null = null;
  surface: Surface | null;
  renderSession: InternalRenderSessionService | null = null;
  renderedTargets: ReturnType<typeof createRenderedTargetController> | null = null;
  geometry: ReturnType<typeof createInternalGeometryService> | null = null;
  focusController: InternalFocusController | null = null;
  consoleSink: ConsoleSinkRegistration | null = null;
  hostYogaLedger: HostYogaAllocationLedger | null = createHostYogaAllocationLedger();
  scheduler: ReturnType<typeof createCommitScheduler> | null = null;
  outputCoordinator: OutputCoordinator | null = null;
  streamLifecycle: MountedStreamLifecycle | null = null;
  commit: (() => CoordinatedWriteResult) | null = null;
  createOutputStateRollback: (() => () => void) | null = null;
  surfaceRuntime: SurfaceRuntime | null = null;
  kittyController: ReturnType<typeof createKittyKeyboardController> | null = null;
  emergencyKittyController: ReturnType<typeof createKittyKeyboardController> | null = null;
  emergencyStdinController: StdinController | null = null;
  synchronizedOutputReleases: Set<() => void> | null = null;
  abandonPendingTerminalOutput:
    | ((options?: { readonly physicalStateUncertain?: boolean }) => void)
    | null = null;
  terminalReconcile: Promise<void> | null = null;
  userRoot: ComponentPublicInstance | null = null;
  // Tracks whether this Session owns the liveInstances entry for stdout. An
  // instance-reuse guard never constructs a Session, so its teardown is inert.
  asOwner = false;
  terminalEventOwnershipActive = false;
  lifecycle: SessionLifecycle = { state: "mounting" };
  exitSelection: ExitSelection = { kind: "open" };
  exitSettlement: ExitSettlement = "open";
  runtimeFailure: Error | null = null;
  runtimeFailureQueue: RuntimeFailureQueue = "idle";
  mountRuntimeFailure: Error | null = null;
  mountFailure: MountFailureState = "none";
  fatalReport: string | null = null;
  teardown: TeardownControl = {
    request: "none",
    sync: "async",
    execution: "idle",
    outputWait: "idle",
    consoleWait: "idle",
    finalCommit: "pending",
    emergency: "idle",
    flushing: "idle",
  };
  lifecycleTransactionDepth = 0;
  vueMountStarted = false;
  vueMountCompleted = false;
  vueCleanupCompleted = false;
  consoleTeardownWritesAllowed = false;
  suspensionGate: { readonly ready: Promise<void>; readonly open: () => void } | null = null;

  constructor(terminal: TerminalBackend, surface: Surface, runtime: SessionRuntime) {
    this.terminal = terminal;
    this.surface = surface;
    this.#runtime = runtime;
  }

  isState(state: SessionLifecycleState): boolean {
    return this.lifecycle.state === state;
  }

  isMounting(): boolean {
    return this.isState("mounting");
  }

  isSuspended(): boolean {
    return this.isState("suspended");
  }

  /**
   * Suspension outlives the transition into teardown. The terminal was released
   * for the suspension and has not been reacquired, so anything that would write
   * to it -- a commit, a console line from an unmount hook, an input acquisition
   * -- must still be refused while the session tears down.
   */
  isTerminalSuspended(): boolean {
    const { lifecycle } = this;
    return (
      lifecycle.state === "suspended" ||
      (lifecycle.state === "tearing-down" && lifecycle.from === "suspended")
    );
  }

  isTearingDown(): boolean {
    return this.isState("tearing-down") || this.isState("torn-down");
  }

  isTornDown(): boolean {
    return this.isState("torn-down");
  }

  waitForSuspensionEnd(): Promise<void> {
    if (!this.suspensionGate) {
      let open!: () => void;
      const ready = new Promise<void>((resolve) => {
        open = resolve;
      });
      this.suspensionGate = { ready, open };
    }
    return this.suspensionGate.ready;
  }

  endSuspensionGate(): void {
    const gate = this.suspensionGate;
    this.suspensionGate = null;
    gate?.open();
  }

  transition(next: SessionLifecycleState): void {
    const current = this.lifecycle;
    if (current.state === next) return;

    switch (current.state) {
      case "mounting":
        if (next === "running") break;
        if (next === "tearing-down") {
          this.lifecycle = { state: "tearing-down", from: current.state };
          return;
        }
        throw new Error(`Cannot transition Runtime Session from ${current.state} to ${next}.`);
      case "running":
        if (next === "suspended") break;
        if (next === "tearing-down") {
          this.lifecycle = { state: "tearing-down", from: current.state };
          return;
        }
        throw new Error(`Cannot transition Runtime Session from ${current.state} to ${next}.`);
      case "suspended":
        if (next === "running") break;
        if (next === "tearing-down") {
          this.lifecycle = { state: "tearing-down", from: current.state };
          return;
        }
        throw new Error(`Cannot transition Runtime Session from ${current.state} to ${next}.`);
      case "tearing-down":
        if (next === "torn-down") break;
        throw new Error(`Cannot transition Runtime Session from ${current.state} to ${next}.`);
      case "torn-down":
        throw new Error(`Cannot transition Runtime Session from ${current.state} to ${next}.`);
      default:
        unreachableLifecycle(current);
    }

    this.lifecycle = { state: next };
  }

  hasExitFailure(): boolean {
    return this.exitSelection.kind === "failure";
  }

  selectedExitError(): unknown {
    return this.exitSelection.kind === "failure" ? this.exitSelection.error : undefined;
  }

  isSelectedExitSilent(): boolean {
    return this.exitSelection.kind === "failure" && this.exitSelection.silent;
  }

  shouldReportSelectedExitFailure(): boolean {
    return this.exitSelection.kind === "failure" && this.exitSelection.report;
  }

  selectExitFailure(
    error: unknown,
    options: { readonly silent?: boolean; readonly report?: boolean } = {},
  ): void {
    if (this.exitSelection.kind === "failure") return;
    this.exitSelection = {
      kind: "failure",
      error,
      silent: options.silent === true,
      report: options.report !== false,
    };
  }

  selectExitSuccess(): boolean {
    if (this.exitSelection.kind !== "open") return false;
    this.exitSelection = { kind: "success" };
    return true;
  }

  recordTeardownError(error: unknown, options?: { readonly report?: boolean }): void {
    this.selectExitFailure(
      isErrorInput(error) ? error : new Error(messageForNonError(error)),
      options,
    );
  }

  reportTerminalAcquired(): void {
    if (this.terminalEventOwnershipActive) return;
    this.terminalEventOwnershipActive = true;
    emitTestEvent(RUNTIME_TEST_EVENT.terminalAcquired);
  }

  reportTerminalReleased(): void {
    if (!this.terminalEventOwnershipActive) return;
    this.terminalEventOwnershipActive = false;
    emitTestEvent(RUNTIME_TEST_EVENT.terminalReleased);
  }

  acquireSynchronizedOutputLease(): () => void {
    const releases = this.synchronizedOutputReleases;
    const lease: TerminalLease<"synchronized-output"> | undefined =
      this.terminal?.acquire("synchronized-output");
    let active = true;
    const release = (): void => {
      if (!active) return;
      active = false;
      releases?.delete(release);
      lease?.release();
    };
    releases?.add(release);
    return release;
  }

  closeOutstandingSynchronizedOutput(): void {
    const releases = this.synchronizedOutputReleases;
    if (!releases || releases.size === 0) return;
    if (this.terminal) this.writeBestEffort("stdout", esu, true);
    for (const release of releases) release();
  }

  writeBestEffort(
    output: TerminalOutput,
    data: string,
    sync = false,
    onHandoff?: () => void,
  ): boolean {
    const terminal = this.terminal;
    if (!terminal?.capabilities[output].canWrite) {
      if (!sync) {
        this.#runtime.requestRuntimeFailure(
          new Error("Runtime output stream became unwritable during terminal restoration."),
        );
      }
      return false;
    }
    try {
      if (sync) {
        terminal.writeSync(output, data);
        onHandoff?.();
      } else if (this.outputCoordinator) {
        const result = this.outputCoordinator.continue(() => {
          this.outputCoordinator?.write(output, data, undefined, onHandoff);
        });
        if (result.status === "blocked") return false;
      } else {
        terminal.write(output, data);
        onHandoff?.();
      }
      return true;
    } catch (error) {
      // Stream may already be destroyed during shutdown, or the fd may be
      // unwritable; restore is best-effort.
      if (!sync) this.#runtime.requestRuntimeFailure(error);
      return false;
    }
  }

  enterLifecycleTransaction(): () => void {
    this.lifecycleTransactionDepth++;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.lifecycleTransactionDepth--;
      if (this.lifecycleTransactionDepth === 0) this.#flushDeferredLifecycle();
    };
  }

  runLifecycleTransaction<T>(operation: () => T): T {
    const leave = this.enterLifecycleTransaction();
    try {
      return operation();
    } finally {
      leave();
    }
  }

  /** Release this mount's resources through its one lifecycle entry point. */
  dispose(options: SessionDisposeOptions = {}): void {
    const { sync = false, immediateTermination = false, abandonExit = false } = options;
    if (abandonExit && !this.isTornDown()) this.exitSettlement = "abandoned";
    // Without an app context, this Session has no renderer resources or stream ownership.
    if (!this.appContext) {
      if (!this.isTornDown()) {
        this.transition("tearing-down");
        this.transition("torn-down");
      }
      return;
    }
    if (this.isTearingDown()) {
      const control = this.teardown;
      if (!this.isTornDown() && sync) control.sync = "sync";
      if (immediateTermination && control.execution !== "idle" && !this.isTornDown()) {
        this.#performEmergencyTerminalRestore();
        return;
      }
      if (immediateTermination && !this.isTornDown() && control.execution === "idle") {
        const effectiveSync = sync || control.sync === "sync";
        control.request = "none";
        control.sync = "async";
        this.#performTeardown(effectiveSync, true);
        return;
      }
      if (sync && !this.isTornDown() && control.execution === "idle") {
        control.request = "none";
        control.sync = "async";
        this.#performTeardown(true, false);
        return;
      }
      if (sync && !this.isTornDown() && control.execution === "waiting") {
        this.outputCoordinator?.abort(
          new Error("Output transaction was interrupted by synchronous teardown."),
        );
        this.abandonPendingTerminalOutput?.();
        control.execution = "idle";
        control.sync = "async";
        this.#performTeardown(true, false);
      }
      return;
    }
    this.transition("tearing-down");
    this.endSuspensionGate();

    // A normal unmount can wait for an in-flight lifecycle transaction. A
    // synchronous teardown must restore terminal ownership immediately.
    if (this.lifecycleTransactionDepth > 0 && !immediateTermination && !sync) {
      this.teardown.request = "deferred";
      return;
    }

    this.#performTeardown(sync, immediateTermination);
  }

  #flushDeferredLifecycle(): void {
    const control = this.teardown;
    if (this.lifecycleTransactionDepth > 0 || control.flushing === "flushing") return;
    control.flushing = "flushing";
    try {
      while (this.lifecycleTransactionDepth === 0) {
        if (control.request === "deferred" && this.isTearingDown() && !this.isTornDown()) {
          const sync = control.sync === "sync";
          control.request = "none";
          control.sync = "async";
          this.#performTeardown(sync, false);
          continue;
        }

        if (this.exitSettlement === "deferred" && (!this.isTearingDown() || this.isTornDown())) {
          this.#runtime.resolveExit();
          continue;
        }

        break;
      }
    } finally {
      control.flushing = "idle";
    }
  }

  #performEmergencyTerminalRestore(): void {
    const control = this.teardown;
    if (control.emergency === "restoring") return;
    control.emergency = "restoring";
    this.outputCoordinator?.abort(
      new Error("Output transaction was interrupted by emergency terminal restoration."),
    );
    this.abandonPendingTerminalOutput?.();
    const runBestEffort = (operation: () => void): void => {
      try {
        operation();
      } catch {
        // A non-returning exit leaves no later retry opportunity. Continue with
        // every independent terminal resource even when one release fails.
      }
    };
    const appContext = this.appContext;

    this.closeOutstandingSynchronizedOutput();

    runBestEffort(() => this.scheduler?.cancel());
    const emergencyKittyController = this.kittyController ?? this.emergencyKittyController;
    this.kittyController = null;
    this.emergencyKittyController = null;
    if (emergencyKittyController) {
      runBestEffort(() => emergencyKittyController.dispose(true));
    }
    const emergencyStdinController = this.stdinController ?? this.emergencyStdinController;
    this.stdinController = null;
    this.emergencyStdinController = null;
    if (emergencyStdinController) {
      runBestEffort(() => emergencyStdinController.dispose(true));
    }

    if (this.surface && this.surfaceRuntime && appContext) {
      runBestEffort(() =>
        this.surface?.dispose(this.surfaceRuntime!, { cleanExit: false, sync: true }),
      );
    }
  }

  #performTeardown(sync = false, immediateTermination = false): void {
    const control = this.teardown;
    if (this.isTornDown() || control.execution !== "idle") return;
    if (!this.appContext) {
      this.transition("torn-down");
      return;
    }
    const coordinator = this.outputCoordinator;
    if (sync || immediateTermination) {
      coordinator?.abort(new Error("Output transaction was interrupted by synchronous teardown."));
      this.abandonPendingTerminalOutput?.();
    }

    const waitForCoordinator = (): void => {
      if (!coordinator || control.outputWait === "waiting") return;
      control.outputWait = "waiting";
      void coordinator.waitForIdle().then(
        () => {
          control.outputWait = "idle";
          if (!this.isTornDown() && control.execution === "idle") {
            const effectiveSync = control.sync === "sync";
            control.sync = "async";
            this.#performTeardown(effectiveSync, false);
          }
        },
        () => {
          control.outputWait = "idle";
          if (!this.isTornDown() && control.execution === "idle")
            this.#performTeardown(false, false);
        },
      );
    };

    const waitForConsoleSink = (): void => {
      const consoleSink = this.consoleSink;
      if (!consoleSink || control.consoleWait === "waiting") return;
      control.consoleWait = "waiting";
      void consoleSink.waitForIdle().then(
        () => {
          control.consoleWait = "idle";
          if (!this.isTornDown() && control.execution === "idle") {
            const effectiveSync = control.sync === "sync";
            control.sync = "async";
            this.#performTeardown(effectiveSync, false);
          }
        },
        () => {
          control.consoleWait = "idle";
          if (!this.isTornDown() && control.execution === "idle")
            this.#performTeardown(false, false);
        },
      );
    };

    this.#runtime.stopScheduling();
    this.scheduler?.cancel();
    if (!sync && !immediateTermination && coordinator?.isBlocked()) {
      waitForCoordinator();
      return;
    }

    const stdoutWritable = this.terminal?.capabilities.stdout.canWrite === true;
    if (
      !sync &&
      !immediateTermination &&
      control.finalCommit === "pending" &&
      this.mountFailure === "none" &&
      !this.isSelectedExitSilent() &&
      this.commit &&
      stdoutWritable &&
      (this.surface?.isLive !== false || !this.hasExitFailure())
    ) {
      control.finalCommit = "complete";
      try {
        const finalCommit = this.commit();
        if (finalCommit.status === "blocked") {
          control.finalCommit = "pending";
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
      control.finalCommit = "complete";
    }

    if (!immediateTermination && !this.vueCleanupCompleted) {
      this.#runtime.runMountedVueCleanup(this);
    }
    if (!sync && !immediateTermination && this.consoleSink?.isIdle() === false) {
      waitForConsoleSink();
      return;
    }
    if ((sync || immediateTermination) && this.consoleSink?.isIdle() === false) {
      coordinator?.abort(
        new Error("Console output was abandoned by synchronous terminal teardown."),
      );
    }

    const completeTeardown = (): void => {
      if (this.isTornDown()) return;
      if (this.asOwner && this.terminal) {
        liveInstances.delete(this.terminal.outputOwnerFor("stdout"));
        this.asOwner = false;
      }
      try {
        this.#runtime.notifyDisposed(this);
      } catch (error) {
        this.recordTeardownError(error);
      }
      this.createOutputStateRollback = null;
      this.emergencyKittyController = null;
      this.emergencyStdinController = null;
      this.abandonPendingTerminalOutput = null;
      this.terminalReconcile = null;
      this.closeOutstandingSynchronizedOutput();
      this.synchronizedOutputReleases = null;
      this.transition("torn-down");
      this.reportTerminalReleased();
      this.surface = null;
      this.surfaceRuntime = null;
      if (this.exitSettlement === "abandoned") {
        const streamLifecycle = this.streamLifecycle;
        this.streamLifecycle = null;
        try {
          streamLifecycle?.dispose();
        } catch (error) {
          this.recordTeardownError(error);
        }
        this.outputCoordinator = null;
        this.appContext = null;
        this.terminal = null;
        this.commit = null;
        return;
      }
      this.#flushDeferredLifecycle();
    };

    control.execution = "running";
    if (sync || immediateTermination || !coordinator) {
      this.#performTeardownNow(sync, immediateTermination);
      completeTeardown();
      return;
    }

    const rollbackRestoration = this.createOutputStateRollback?.();
    try {
      const restoration = coordinator.run(
        () => this.#performTeardownNow(sync, immediateTermination),
        {
          onUnhandedFailure: rollbackRestoration,
        },
      );
      if (restoration.status === "blocked") {
        control.execution = "idle";
        waitForCoordinator();
        return;
      }
      if (restoration.writable) completeTeardown();
      else {
        if (control.sync === "sync") {
          control.sync = "async";
          coordinator.abort(
            new Error("Output transaction was interrupted by synchronous teardown."),
          );
          this.abandonPendingTerminalOutput?.();
          control.execution = "idle";
          this.#performTeardown(true, false);
          return;
        }
        control.execution = "waiting";
        void restoration.ready.then(
          () => {
            if (control.execution !== "waiting" || this.isTornDown()) return;
            control.execution = "running";
            completeTeardown();
          },
          (error) => {
            if (control.execution !== "waiting" || this.isTornDown()) return;
            control.execution = "running";
            this.recordTeardownError(error);
            rollbackRestoration?.();
            this.#performEmergencyTerminalRestore();
            completeTeardown();
          },
        );
      }
    } catch (error) {
      this.recordTeardownError(error);
      rollbackRestoration?.();
      this.#performEmergencyTerminalRestore();
      completeTeardown();
    }
  }

  #performTeardownNow(sync: boolean, immediateTermination: boolean): void {
    try {
      const runBestEffort = (operation: () => void): void => {
        try {
          operation();
        } catch (error) {
          this.recordTeardownError(error);
        }
      };
      const appContext = this.appContext!;

      if (this.unsubscribeSuspension) {
        const unsubscribe = this.unsubscribeSuspension;
        this.unsubscribeSuspension = null;
        runBestEffort(unsubscribe);
      }
      if (this.unsubscribeExit && !immediateTermination) {
        const unsubscribe = this.unsubscribeExit;
        this.unsubscribeExit = null;
        runBestEffort(unsubscribe);
      }
      if (this.consoleSink) {
        const consoleSink = this.consoleSink;
        this.consoleSink = null;
        runBestEffort(consoleSink.release);
      }
      this.consoleTeardownWritesAllowed = false;
      if (this.renderedTargets) {
        const renderedTargets = this.renderedTargets;
        this.renderedTargets = null;
        runBestEffort(() => renderedTargets.dispose());
      }
      if (this.geometry) {
        const geometry = this.geometry;
        this.geometry = null;
        runBestEffort(() => geometry.dispose());
      }
      if (this.focusController) {
        const focusController = this.focusController;
        this.focusController = null;
        runBestEffort(() => focusController.dispose());
      }
      if (this.kittyController) {
        const kittyController = this.kittyController;
        this.emergencyKittyController = kittyController;
        this.kittyController = null;
        runBestEffort(() => kittyController.dispose(sync));
      }
      if (this.surface && this.surfaceRuntime) {
        runBestEffort(() =>
          this.surface?.dispose(this.surfaceRuntime!, { cleanExit: !this.hasExitFailure(), sync }),
        );
      }
      if (this.root) runBestEffort(() => releasePaintCaches(this.root!));
      runBestEffort(() => this.hostYogaLedger?.rollback());
      if (this.root) runBestEffort(() => detachYoga(this.root!));
      this.root = null;
      this.hostYogaLedger = null;
      this.vueMountCompleted = false;
      if (this.resizeHandler) {
        const unsubscribeResize = this.resizeHandler;
        runBestEffort(unsubscribeResize);
        this.resizeHandler = null;
      }
      if (this.exitListener) {
        const unsubscribeExit = this.exitListener;
        runBestEffort(unsubscribeExit);
        this.exitListener = null;
      }
      if (this.beforeExitHandler) {
        const unsubscribeBeforeExit = this.beforeExitHandler;
        runBestEffort(unsubscribeBeforeExit);
        this.beforeExitHandler = null;
      }
      if (this.stdinController) {
        const stdinController = this.stdinController;
        this.emergencyStdinController = stdinController;
        this.stdinController = null;
        stdinController.setCleanupErrorSink((error) => this.recordTeardownError(error));
        runBestEffort(() => stdinController.dispose(sync, immediateTermination));
        stdinController.setCleanupErrorSink(null);
      }
      if (this.renderSession) {
        const renderSession = this.renderSession;
        runBestEffort(() => renderSession.dispose());
      }
      this.renderSession = null;
      const selectedError = this.selectedExitError();
      if (
        this.shouldReportSelectedExitFailure() &&
        !this.isSelectedExitSilent() &&
        isErrorInput(selectedError)
      ) {
        const report = sanitizeAnsiMultiline(formatErrorForStderr(selectedError));
        const terminalHasTtyOutput =
          this.terminal !== null &&
          this.terminal.capabilities.stdout.isTTY &&
          this.terminal.capabilities.stderr.isTTY;
        const output = `${terminalHasTtyOutput ? nextLineEscape : ""}${report}`;
        if (sync) {
          this.writeBestEffort("stderr", output, true);
        } else {
          this.fatalReport = output;
        }
      }

      this.appContext = appContext;
    } finally {
      // The caller releases stream ownership and settles lifecycle work only
      // after this restoration transaction has drained (or definitively failed).
    }
  }
}

type SessionLifecycle =
  | { readonly state: "mounting" }
  | { readonly state: "running" }
  | { readonly state: "suspended" }
  | {
      readonly state: "tearing-down";
      readonly from: "mounting" | "running" | "suspended";
    }
  | { readonly state: "torn-down" };

type SessionLifecycleState = SessionLifecycle["state"];

type ExitSelection =
  | { readonly kind: "open" }
  | { readonly kind: "success" }
  | {
      readonly kind: "failure";
      readonly error: unknown;
      readonly silent: boolean;
      readonly report: boolean;
    };

type ExitSettlement = "open" | "deferred" | "settling" | "settled" | "abandoned";
type RuntimeFailureQueue = "idle" | "queued";
type MountFailureState = "none" | "failed";

interface TeardownControl {
  request: "none" | "deferred";
  sync: "async" | "sync";
  execution: "idle" | "running" | "waiting";
  outputWait: "idle" | "waiting";
  consoleWait: "idle" | "waiting";
  finalCommit: "pending" | "complete";
  emergency: "idle" | "restoring";
  flushing: "idle" | "flushing";
}

function unreachableLifecycle(value: never): never {
  throw new Error(`Unexpected Runtime Session lifecycle: ${JSON.stringify(value)}`);
}

/**
 * Build a terminal application for an owning entrypoint.
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
export function createSessionApp(
  root: Component,
  rootProps: RootProps | null = null,
  extension: SessionAppExtension = {},
): SessionApp {
  // Exit promise — created with the application so waitUntilExit() works even
  // before mount (it just hangs until mount + exit).
  let exitResolve!: () => void;
  let exitReject!: (reason?: unknown) => void;
  const exitPromise = new Promise<void>((res, rej) => {
    exitResolve = res;
    exitReject = rej;
  });
  exitPromise.catch(() => {});
  if (extension.exitSettled) {
    void exitPromise
      .finally(() => {
        extension.exitSettled?.();
      })
      .catch(() => {});
  }

  // Mount constructs one Session after deterministic preflight. Keeping the
  // nullable reference here makes pre-mount unmount/settlement an inert no-op;
  // all actual resources live on the Session itself.
  let session: Session | null = null;

  function isSessionState(state: SessionLifecycleState): boolean {
    return session?.isState(state) ?? false;
  }

  function isMounting(): boolean {
    return isSessionState("mounting");
  }

  function isSuspended(): boolean {
    return isSessionState("suspended");
  }

  function isTerminalSuspended(): boolean {
    return session?.isTerminalSuspended() ?? false;
  }

  function isTearingDown(): boolean {
    return isSessionState("tearing-down") || isSessionState("torn-down");
  }

  function isTornDown(): boolean {
    return isSessionState("torn-down");
  }

  function selectedExitError(): unknown {
    return session?.selectedExitError();
  }

  function selectExitFailure(
    error: unknown,
    options: { readonly silent?: boolean; readonly report?: boolean } = {},
  ): void {
    session?.selectExitFailure(error, options);
  }

  function selectExitSuccess(): boolean {
    return session?.selectExitSuccess() ?? false;
  }

  function reportTerminalAcquired(): void {
    session?.reportTerminalAcquired();
  }

  function reportTerminalReleased(): void {
    session?.reportTerminalReleased();
  }

  function acquireSynchronizedOutputLease(): () => void {
    return session?.acquireSynchronizedOutputLease() ?? (() => {});
  }

  function closeOutstandingSynchronizedOutput(): void {
    session?.closeOutstandingSynchronizedOutput();
  }

  // The renderer's onCommit closure is wired during application construction but only does
  // real work after mount swaps in scheduler.schedule. One renderer per app
  // even though it's not used until mount.
  let scheduledCommit: () => void = () => {};

  function recordTeardownError(error: unknown, options?: { readonly report?: boolean }): void {
    session?.recordTeardownError(error, options);
  }

  function recordVueMountFailure(error: unknown): void {
    // An unhandled initial component throw escaped through Vue itself. Preserve
    // that exact JavaScript value at the consumed mount boundary; Runtime does
    // not install a hidden component boundary or turn it into a durable report.
    session?.selectExitFailure(error, { report: false });
  }

  // After accepting Static output, Vue may still flush the acceptance patch that
  // replaces committed hosts with anchors. Exit settlement waits for those
  // deferred ticks so waitUntilExit does not resolve mid-patch.
  const pendingAcceptedStaticCleanupBatches = new Set<object>();

  function settleAcceptedStaticCleanup(batch: object): void {
    if (!pendingAcceptedStaticCleanupBatches.delete(batch)) return;
    if (isTearingDown()) resolveExit();
  }

  function disposeMountedStreamLifecycle(): void {
    const activeSession = session;
    if (!activeSession) return;
    const streamLifecycle = activeSession.streamLifecycle;
    activeSession.streamLifecycle = null;
    if (!streamLifecycle) return;
    try {
      streamLifecycle.dispose();
    } catch (error) {
      recordTeardownError(error);
    }
  }

  function requestRuntimeFailure(error: unknown, options?: { readonly silent?: boolean }): void {
    const normalizedError = isErrorInput(error) ? error : new Error(messageForNonError(error));
    const activeSession = session;
    if (!activeSession) return;
    const exitWasOpen = activeSession.exitSelection.kind === "open";
    activeSession.runtimeFailure ??= normalizedError;
    selectExitFailure(normalizedError, { silent: options?.silent });
    if (isMounting()) {
      activeSession.mountRuntimeFailure ??= normalizedError;
      return;
    }
    if (activeSession.exitSettlement === "abandoned" && isTearingDown()) return;
    if (isTearingDown()) {
      resolveExit();
      return;
    }
    if (!exitWasOpen || activeSession.runtimeFailureQueue === "queued") return;
    activeSession.runtimeFailureQueue = "queued";
    queueMicrotask(() => {
      activeSession.runtimeFailureQueue = "idle";
      try {
        activeSession.dispose();
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
    const activeSession = session;
    if (activeSession?.exitSettlement === "abandoned") return;
    if (
      activeSession?.exitSettlement === "settling" ||
      activeSession?.exitSettlement === "settled"
    ) {
      return;
    }
    if (pendingAcceptedStaticCleanupBatches.size > 0) {
      if (activeSession) activeSession.exitSettlement = "deferred";
      return;
    }
    // A custom stream or renderer callback may synchronously call unmount()
    // from inside a terminal acquisition/repaint. Settling here would let the
    // exit promise resolve before the surrounding write has finished and before
    // the terminal has been restored. Record the request; the outermost
    // lifecycle transaction flushes it after teardown completes.
    if ((activeSession?.lifecycleTransactionDepth ?? 0) > 0 || (isTearingDown() && !isTornDown())) {
      if (activeSession) activeSession.exitSettlement = "deferred";
      return;
    }
    if (activeSession) activeSession.exitSettlement = "settling";
    // Nothing wired: this app never reached stream reservation.
    if (!activeSession?.appContext) {
      disposeMountedStreamLifecycle();
      if (activeSession) activeSession.exitSettlement = "settled";
      if (activeSession?.exitSelection.kind === "failure") {
        exitReject(activeSession.exitSelection.error);
      } else {
        exitResolve();
      }
      return;
    }
    const finish = () => {
      disposeMountedStreamLifecycle();
      if (activeSession) activeSession.exitSettlement = "settled";
      if (activeSession?.exitSelection.kind === "failure") {
        exitReject(activeSession.exitSelection.error);
      } else {
        exitResolve();
      }
    };

    const report = activeSession.fatalReport;
    activeSession.fatalReport = null;
    void (async () => {
      try {
        try {
          await session?.streamLifecycle?.waitForIdle();
        } catch (error) {
          recordTeardownError(error);
        }
        try {
          await writeOutputBarrier("stdout");
        } catch (error) {
          recordTeardownError(error);
        }
        if (report) {
          try {
            await writeOutputBarrier("stderr", report);
          } catch (error) {
            recordTeardownError(error);
          }
        }
        try {
          await session?.streamLifecycle?.waitForIdle();
        } catch (error) {
          recordTeardownError(error);
        }
      } finally {
        finish();
      }
    })();
  }

  async function writeOutputBarrier(output: TerminalOutput, data = ""): Promise<void> {
    const activeSession = session;
    const terminal = activeSession?.terminal;
    if (!terminal?.capabilities[output].canWrite) {
      throw new Error("Runtime output stream became unwritable before exit settlement.");
    }

    const coordinator = activeSession?.outputCoordinator;
    if (!coordinator) {
      await new Promise<void>((resolve, reject) => {
        const done = (error?: Error | null) => {
          if (error) reject(error);
          else resolve();
        };
        try {
          terminal.write(output, data, done);
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
        coordinator.write(output, data);
      });
      if (result.status === "blocked") continue;
      if (!bodyRan) continue;
      if (!result.writable) await result.ready;
      await activeSession?.streamLifecycle?.waitForIdle();
      return;
    }
  }

  function writeBestEffort(
    output: TerminalOutput,
    data: string,
    sync = false,
    onHandoff?: () => void,
  ): boolean {
    return session?.writeBestEffort(output, data, sync, onHandoff) ?? false;
  }

  function enterLifecycleTransaction(): () => void {
    return session?.enterLifecycleTransaction() ?? (() => {});
  }

  function runLifecycleTransaction<T>(operation: () => T): T {
    const activeSession = session;
    return activeSession ? activeSession.runLifecycleTransaction(operation) : operation();
  }

  const hostYogaLifecycle: HostYogaLifecycle = {
    attach(node: HostYogaNode, onDetach?: () => void): void {
      const activeSession = session;
      if (!activeSession?.hostYogaLedger) {
        throw new Error("Runtime Session is not ready for host Yoga allocation.");
      }
      activeSession.hostYogaLedger.attach(node, onDetach);
    },
    detach(node: HostYogaNode): void {
      session?.hostYogaLedger?.detach(node);
    },
  };
  const renderer = createRenderer<TuiNode, TuiNode>(
    buildNodeOps({
      onCommit: () => scheduledCommit(),
      invalidateRenderedSubtree: (target) => {
        session?.renderedTargets?.invalidateSubtree(target);
      },
      isProduction: () => session?.terminal?.capabilities.environment.NODE_ENV === "production",
      hostYogaLifecycle,
    }),
  );

  const captureUserRoot = (instance: ComponentPublicInstance | null): void => {
    if (session) session.userRoot = instance;
  };
  const preparedRoot = extension.prepareRoot?.(root, rootProps, captureUserRoot);
  const baseApp = renderer.createApp(
    preparedRoot?.root ?? root,
    preparedRoot?.rootProps ?? rootProps,
  );
  const originalMount = baseApp.mount.bind(baseApp);
  const originalUnmount = baseApp.unmount.bind(baseApp);

  function runMountedVueCleanup(activeSession: Session): void {
    if (activeSession.vueCleanupCompleted) return;
    activeSession.vueCleanupCompleted = true;
    if (!activeSession.vueMountStarted) return;
    activeSession.vueMountStarted = false;
    activeSession.consoleTeardownWritesAllowed = activeSession.consoleSink !== null;
    try {
      originalUnmount();
    } catch (error) {
      activeSession.recordTeardownError(error);
    }
  }

  function rollbackPartialVueMount(activeSession: Session): void {
    if (activeSession.vueCleanupCompleted) return;
    activeSession.vueCleanupCompleted = true;
    activeSession.vueMountStarted = false;
    activeSession.consoleTeardownWritesAllowed = activeSession.consoleSink !== null;
    // Vue-side rollback goes exactly as far as Vue itself does, and no further.
    // If app.mount() returned and a later Runtime step failed, the ordinary Vue
    // unmount tears the tree down. If Vue's own mount threw, Vue never took
    // container ownership, so there is nothing it can unmount — plain Vue runs
    // no cleanup for that case either, and Runtime does not manufacture the
    // missing ownership link out of Vue-private state to do more. Runtime-owned
    // resources are still released: the Yoga ledger below frees every
    // allocation, and the caller's rollback restores terminal and stream state.
    if (activeSession.vueMountCompleted) {
      activeSession.vueMountCompleted = false;
      try {
        originalUnmount();
      } catch (error) {
        activeSession.recordTeardownError(error);
      }
    }
    activeSession.hostYogaLedger?.rollback();
  }

  // Vue creates the backing App object; Runtime replaces mount and installs the
  // two wait methods below before this object can escape createSessionApp().
  const app = baseApp as unknown as SessionApp;
  let mountAttemptConsumed = false;

  const runtimeMount = function mount(
    this: void,
    options: SessionMountOptions = {},
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
    const terminal = createNodeTerminalBackend(
      {
        stdin: options.stdin,
        stdout: options.stdout,
        stderr: options.stderr,
        sizeProbe: internalOptions[INTERNAL_TERMINAL_SIZE_PROBE],
      },
      {
        suspensionHost: internalOptions.suspensionHost,
      },
    );
    const processLifecycle = terminal.processLifecycle;
    if (liveInstances.has(terminal.outputOwnerFor("stdout"))) {
      throw new Error("Cannot mount vue-tui: the selected stdout already has a live app.");
    }
    const stdoutFacts = currentStdoutFacts(terminal);
    const terminalStyle =
      color === true && internalOptions.terminalStyle !== undefined
        ? internalOptions.terminalStyle
        : color === true
          ? resolveTerminalStyle({
              color,
              stdout: terminal.capabilities.stdout,
              environment: terminal.capabilities.environment,
            })
          : resolveTerminalStyle({ color });
    // Internal deterministic-test observer. It observes the resolved session
    // and renderer content commits without selecting another output path.
    const renderObserver = internalOptions[INTERNAL_RENDER_OBSERVER];
    const kittyKeyboard = internalOptions[INTERNAL_KITTY_KEYBOARD];
    if (requestedMode === "fullscreen") {
      assertFullscreenCapability(stdoutFacts);
    }
    const resolvedSurface = resolveLiveSurface({
      requestedMode,
      stdout: stdoutFacts,
    });
    const outputSurface = createSurface(resolvedSurface.kind);

    // Deterministic option, stream, capability, ownership, and surface
    // preflight ends here. From this point every consumed operation is covered
    // by the rollback catch below.
    let leaveMountLifecycleTransaction: (() => void) | null = null;
    mountAttemptConsumed = true;
    session = new Session(terminal, outputSurface, {
      resolveExit,
      requestRuntimeFailure,
      stopScheduling() {
        scheduledCommit = () => {};
      },
      runMountedVueCleanup,
      notifyDisposed(activeSession) {
        extension.disposed?.(activeSession);
      },
    });
    try {
      const renderSession = createLiveRenderSessionService(resolvedSurface, terminalStyle);

      function readCurrentDimensions(preferFreshProbe = false): ResolvedLiveDimensions | null {
        const currentStdout = currentStdoutFacts(terminal, preferFreshProbe);
        const next = resolveLiveDimensions(currentStdout);
        return next.terminal === null ? null : { ...next, layout: next.terminal };
      }

      let failureOutputCoordinator: OutputCoordinator | null = null;
      const streamLifecycle = createMountedStreamLifecycle({
        terminal,
        hasManagedInputDemand: () => session!.stdinController?.hasManagedInputDemand() ?? false,
        onFailure(error) {
          failureOutputCoordinator?.abort(error);
          requestRuntimeFailure(error);
        },
      });
      session!.streamLifecycle = streamLifecycle;
      const outputCoordinator = createOutputCoordinator({
        terminal,
        trackWrite: (output) => streamLifecycle.trackWrite(output),
        onDeferredError(error) {
          session!.abandonPendingTerminalOutput?.({ physicalStateUncertain: true });
          // A prior BSU may already have been accepted while its matching ESU was
          // still queued behind the failed segment. Close that terminal mode
          // synchronously before the fatal lifecycle turn starts.
          closeOutstandingSynchronizedOutput();
          requestRuntimeFailure(error);
        },
      });
      failureOutputCoordinator = outputCoordinator;
      session!.outputCoordinator = outputCoordinator;
      session!.synchronizedOutputReleases = new Set();
      let terminalReconcileTurn: Promise<void> | null = null;
      let terminalReconcileRequested = false;
      let reconcileManagedTerminalOutput: () => void = () => {};

      function requestTerminalReconcile(): void {
        if (isTearingDown()) return;
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
              if (!isTearingDown()) reconcileManagedTerminalOutput();
            },
            () => {},
          )
          .finally(() => {
            if (terminalReconcileTurn === turn) terminalReconcileTurn = null;
            if (session!.terminalReconcile === turn) session!.terminalReconcile = null;
            if (terminalReconcileRequested && !isTearingDown()) requestTerminalReconcile();
          });
        terminalReconcileTurn = turn;
        session!.terminalReconcile = turn;
        void turn.catch(() => {});
      }

      function writeRuntimeOutput(
        output: TerminalOutput,
        data: string,
        callback?: () => void,
        onHandoff?: () => void,
      ): boolean {
        let writable = false;
        const result = outputCoordinator.continue(() => {
          writable = outputCoordinator.write(output, data, callback, onHandoff);
        });
        if (result.status === "blocked") {
          throw new Error("Runtime output transaction is backpressured.");
        }
        // `false` from Node means accepted backpressure, not rejected bytes. The
        // output gate itself prevents a later transaction until drain.
        return writable;
      }

      function writeTerminalOutput(
        data: string,
        onAccepted?: () => void,
        onAttempt?: () => void,
      ): boolean {
        let captured = false;
        let result: CoordinatedWriteResult;
        try {
          result = outputCoordinator.continue(() => {
            captured = outputCoordinator.write("stdout", data, undefined, onAccepted, onAttempt);
          });
        } catch (error) {
          session!.abandonPendingTerminalOutput?.({ physicalStateUncertain: true });
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

      /**
       * Whether a side-channel write may reach the terminal, and how to say no.
       *
       * The console sink retries on the ready promise without re-reading the
       * lifecycle, so a refusal is only safe if its promise cannot resolve while
       * the answer is still no -- a retry that runs immediately starves the event
       * loop, and the state it is waiting for can no longer change.
       *
       * A suspended session resumes, so the write is worth holding: it waits on
       * the suspension gate, which opens when suspension actually ends, not on
       * the output gate, which is idle precisely because nothing may be written.
       * Teardown never reopens, so there is nothing to wait for and the write is
       * dropped, which is what `commit()` does for the same reason.
       */
      function refuseSideChannelWrite(): CoordinatedWriteResult | undefined {
        if (isTearingDown()) {
          const allowed = session!.consoleTeardownWritesAllowed && !isTerminalSuspended();
          return allowed ? undefined : acceptedCoordinatedWrite;
        }
        if (!isTerminalSuspended()) return undefined;
        return Object.freeze({
          status: "blocked",
          ready: session!.waitForSuspensionEnd(),
        } as const);
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
          session!.abandonPendingTerminalOutput?.({ physicalStateUncertain: true });
          closeOutstandingSynchronizedOutput();
          throw error;
        }
      }

      const acceptedCoordinatedWrite = Object.freeze({
        status: "accepted",
        writable: true,
      }) satisfies CoordinatedWriteResult;

      let pendingMountSuspension = false;
      let terminalResumeInProgress = false;
      let terminalResumePainting = false;
      let resizeEventGeneration = 0;
      let resizeHandledGeneration = 0;
      let resizePaintPending = false;
      let requestPendingResizeRefresh: () => void = () => {};
      let prepareResumeSurface: (() => (() => CoordinatedWriteResult) | null) | null = null;
      let surfaceRuntime: SurfaceRuntime | null = null;
      let rejectedFullscreenStatic = false;
      session!.abandonPendingTerminalOutput = (abandonment) => {
        outputSurface.abandonPendingOutput(abandonment);
        (session!.kittyController ?? session!.emergencyKittyController)?.abandonPendingOutput();
        (
          session!.stdinController ?? session!.emergencyStdinController
        )?.abandonPendingTerminalOutput(abandonment);
        if (!abandonment?.physicalStateUncertain) requestTerminalReconcile();
      };
      function rejectUnsupportedFullscreenStatic(statics = findStatics(tuiRoot)): boolean {
        if (outputSurface.acceptsHistory || statics.length === 0) return false;
        if (!rejectedFullscreenStatic) {
          // Static is terminal history, not fixed-viewport layout. Reject on
          // component presence (including an empty region) before preparation,
          // layout, observers, onRender, commit-time surface reacquisition, or
          // frame output.
          // Existing setup-owned terminal leases are released by the ordinary
          // fatal teardown before its durable stderr report is written.
          rejectedFullscreenStatic = true;
          session!.scheduler?.cancel();
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

      function releaseOutputSurfaceForSuspension(): void {
        if (!surfaceRuntime) return;
        outputSurface.suspend(surfaceRuntime);
      }

      function suspendSession(): void {
        if (isTearingDown() || isSuspended()) return;
        if (isMounting()) {
          // A hostile raw/stream callback can request suspension while mount is
          // only halfway through acquiring terminal resources. Finish the mount
          // transaction first, then release the complete resource set once.
          pendingMountSuspension = true;
          return;
        }
        outputCoordinator.abort(new Error("Output transaction was interrupted by suspension."));
        session!.abandonPendingTerminalOutput?.();
        closeOutstandingSynchronizedOutput();
        runLifecycleTransaction(() => {
          session!.transition("suspended");
          terminalResumeInProgress = false;
          runSuspensionStep(() => session!.scheduler?.cancel());
          runSuspensionStep(() => session!.kittyController?.suspend(true));
          runSuspensionStep(() => session!.stdinController?.suspend(true));
          releaseOutputSurfaceForSuspension();
        });
      }

      async function resumeSession(): Promise<void> {
        if (pendingMountSuspension) {
          // The host resumed before the mount transaction reached its deferred
          // suspend boundary, so no physical transition is needed.
          pendingMountSuspension = false;
          return;
        }
        if (isTearingDown() || !isSuspended() || terminalResumeInProgress) return;
        let applyPreparedSurface: (() => CoordinatedWriteResult) | null = null;
        let resumeCoveredResizeGeneration = resizeHandledGeneration;
        let resumed = false;
        const prepareContinuedSurface = (): void => {
          resumeCoveredResizeGeneration = resizeEventGeneration;
          applyPreparedSurface = prepareResumeSurface?.() ?? null;
          if (!applyPreparedSurface) {
            const repaint = session!.commit;
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
            if (outputSurface.isLive) {
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
            !isTearingDown() &&
            isSuspended() &&
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
                !isTearingDown() &&
                isSuspended() &&
                resumeCoveredResizeGeneration !== resizeEventGeneration
              ) {
                runLifecycleTransaction(prepareContinuedSurface);
                if (!(await awaitVueUpdate())) return;
              }
            }
            retryForNewerResize = false;
            if (isTearingDown() || !isSuspended() || !terminalResumeInProgress) break;
            if (rejectUnsupportedFullscreenStatic()) break;

            const surfaceResult = runOutputTransaction(() => {
              runLifecycleTransaction(() => {
                if (surfaceRuntime) outputSurface.resume(surfaceRuntime);
                session!.geometry?.setSurfaceAvailable(true);
              });
            });
            if (!(await waitForAcceptedOutput(surfaceResult))) {
              retryForNewerResize = true;
              continue;
            }
            if (isTearingDown()) break;
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
            if (isTearingDown()) break;
            if (resumeCoveredResizeGeneration !== resizeEventGeneration) {
              retryForNewerResize = true;
              continue;
            }

            // Input is reacquired only after the output surface is complete. All
            // mode escapes share one gate transaction, so a false return delays
            // later setup instead of letting it overtake the repaint.
            const inputResult = runOutputTransaction(() => {
              runLifecycleTransaction(() => {
                session!.kittyController?.resume();
                session!.stdinController?.resume();
              });
            });
            if (!(await waitForAcceptedOutput(inputResult))) {
              runSuspensionStep(() => session!.kittyController?.suspend(true));
              runSuspensionStep(() => session!.stdinController?.suspend(true));
              retryForNewerResize = true;
              continue;
            }
            if (isTearingDown()) break;
            if (resumeCoveredResizeGeneration !== resizeEventGeneration) {
              runSuspensionStep(() => session!.kittyController?.suspend(true));
              runSuspensionStep(() => session!.stdinController?.suspend(true));
              retryForNewerResize = true;
              continue;
            }

            runLifecycleTransaction(() => {
              session!.transition("running");
              session!.endSuspensionGate();
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
            !isTearingDown() &&
            isSuspended() &&
            terminalResumeInProgress
          );
          if (resumed) requestPendingResizeRefresh();
        } catch {
          if (!isTearingDown()) {
            runLifecycleTransaction(() => {
              runSuspensionStep(() => session!.kittyController?.suspend(true));
              runSuspensionStep(() => session!.stdinController?.suspend(true));
              releaseOutputSurfaceForSuspension();
            });
          }
        } finally {
          terminalResumePainting = false;
          terminalResumeInProgress = false;
        }
      }

      function requireSurfaceRuntime(): SurfaceRuntime {
        if (!surfaceRuntime) throw new Error("output surface runtime is not ready");
        return surfaceRuntime;
      }

      function writeToStdout(data: string): CoordinatedWriteResult {
        // A late or suspended write is not retained. Its ready promise covers
        // only the current output gate; lifecycle availability must still be
        // re-checked by a caller that chooses to retry.
        const refusal = refuseSideChannelWrite();
        if (refusal) return refusal;
        const rollback = createOutputStateRollback();
        return runOutputTransaction(
          () => {
            runLifecycleTransaction(() => {
              const outputData = terminal.capabilities.stdout.isTTY
                ? sanitizeAnsiMultiline(data)
                : data;
              if (outputData === "") return;
              outputSurface.handoffHistory("stdout", outputData, requireSurfaceRuntime());
            });
          },
          { onUnhandedFailure: rollback },
        );
      }

      function writeToStderr(data: string): CoordinatedWriteResult {
        const refusal = refuseSideChannelWrite();
        if (refusal) return refusal;
        const rollback = createOutputStateRollback();
        return runOutputTransaction(
          () => {
            runLifecycleTransaction(() => {
              const outputData = terminal.capabilities.stderr.isTTY
                ? sanitizeAnsiMultiline(data)
                : data;
              if (outputData === "") return;
              outputSurface.handoffHistory("stderr", outputData, requireSurfaceRuntime());
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
          // app.unmount() runs Session.dispose()+resolveExit() without selecting an
          // explicit exit result, so a retained useApp().exit() called
          // re-entrantly during unmount must still be inert.
          // Gating on isTearingDown() too makes exit() a no-op once unmount/
          // teardown is in progress. At the FIRST exit() both flags are false, so
          // a normal exit-from-Vue-cycle still proceeds.
          if (session!.exitSelection.kind !== "open" || isTearingDown()) return;
          if (error !== undefined && !isErrorInput(error)) {
            throw new TypeError("useApp().exit() accepts only an Error or no argument");
          }
          // Record the FIRST value/error synchronously (before the deferred
          // teardown microtask) so a re-entrant exit() — which is blocked above
          // anyway — and the eventual resolveExit() always settle on this value.
          if (error !== undefined) {
            selectExitFailure(error);
          } else {
            selectExitSuccess();
          }
          // Defer teardown to a microtask: exit() is frequently called from
          // inside the Vue update cycle (useInput handler, setup(), errorHandler)
          // and unmounting synchronously would tear Vue down mid-flush.
          queueMicrotask(() => {
            try {
              session!.dispose();
            } finally {
              resolveExit();
            }
          });
        },
        writeToStdout,
        writeToStderr,
      };
      session!.appContext = appContext;
      // Reserve the stream only after every mount option and session fact needed
      // above has been read successfully. From this point teardown can always
      // find Session.appContext and release the reservation on a setup failure.
      liveInstances.set(terminal.outputOwnerFor("stdout"), app);
      session!.asOwner = true;
      session!.renderSession = renderSession;
      streamLifecycle.activate();
      if (session!.mountRuntimeFailure) throw session!.mountRuntimeFailure;
      // From stream reservation through Vue's first render and final listener
      // wiring, a synchronous host callback may request teardown but may not run
      // it in the middle of terminal acquisition or before Vue finishes mount.
      leaveMountLifecycleTransaction = enterLifecycleTransaction();

      // Everything after stdout reservation is one mount transaction. Listener
      // registration happens before the first terminal acquisition, and any later
      // failure rolls back through the same complete teardown path.
      // A host exit never returns after its synchronous exit event. It
      // therefore cannot wait for an enclosing render transaction to unwind;
      // restore immediately and skip user-facing final rendering callbacks.
      session!.exitListener = processLifecycle.onExit(() =>
        session?.dispose({ sync: true, immediateTermination: true }),
      );

      // Termination cleanup is independent from output cadence. A final-output
      // app can still acquire raw, paste, or explicit Kitty state through
      // input composables, so every real mount gets the same idempotent handler.
      // signal-exit re-raises the terminating signal as soon as this callback
      // returns, so this path has the same non-returning cleanup requirement as
      // abrupt termination.
      session!.unsubscribeExit = processLifecycle.onTermination(() =>
        session?.dispose({ sync: true, immediateTermination: true }),
      );

      // Install job-control interception before raw mode, Kitty, cursor, or the
      // alternate screen can be acquired. The stable delegates above inspect
      // only resources that have become available so far, so even a signal in a
      // partially initialized mount restores what that mount already owns.
      const unsubscribeSuspension = processLifecycle.registerSuspension({
        suspend: suspendSession,
        resume: resumeSession,
      });
      if (unsubscribeSuspension) {
        session!.unsubscribeSuspension = unsubscribeSuspension;
      }

      // Register beforeExit on successful reservation rather than waiting for a
      // caller to request the promise. This lets natural event-loop drain flush a
      // deferred final frame and its stream barrier before Node exits.
      session!.beforeExitHandler = processLifecycle.onBeforeExit(() => app.unmount());

      let kittyController: ReturnType<typeof createKittyKeyboardController> | undefined;
      const inputSession = {
        prepareManagedInput: () => outputSurface.resume(requireSurfaceRuntime()),
        get isManagedInputReady() {
          return !isTerminalSuspended() && outputSurface.isInputReady;
        },
        get isKittyKeyboardReady() {
          return kittyController?.isReady ?? true;
        },
        acquireKittyKeyboard() {
          return kittyController?.acquireDemand() ?? (() => {});
        },
        writeTerminal: writeTerminalOutput,
        requestTerminalReconcile,
        reportManagedInputFailure(error) {
          requestRuntimeFailure(error);
        },
      } satisfies ManagedInputSession;
      const stdinController = createStdinController(
        terminal,
        terminal.stdinForUseStdin,
        inputSession,
        {
          exitOnCtrlC,
          exit: () => appContext.exit(),
        },
      );
      session!.stdinController = stdinController;

      // These pre-mount steps can throw SYNCHRONOUSLY on a hostile/broken
      // terminal: attachYoga() allocates a WASM yoga node, and later Vue setup
      // may acquire semantic input whose exposed raw-mode or protocol operations
      // fail. liveInstances.set(stdout, app) already ran above, so a
      // throw HERE — before the originalMount try/catch — would leave the stdout
      // registry entry behind, reject later mounts, leak the yoga root, and leave raw
      // mode / kitty on. Wrap these in
      // the same dispose-then-rethrow guard as originalMount so Session.dispose()
      // (idempotent; safe at this early stage — it derives all cleanup from the
      // wired state set so far) restores everything and frees the registry entry,
      // while the caller still sees the original error.
      let tuiRoot: ReturnType<typeof createRoot>;
      try {
        kittyController = createKittyKeyboardController(
          terminal,
          stdinController.startKittyQueryResponseDetection,
          kittyKeyboard,
          writeTerminalOutput,
          requestTerminalReconcile,
        );
        // Register before Vue setup. Configuration is inert at mount; the first
        // semantic input demand asks this controller to query or push Kitty only
        // when raw mode is available; the shared listener itself needs only data.
        session!.kittyController = kittyController;
        reconcileManagedTerminalOutput = () => {
          try {
            kittyController?.reconcile();
            stdinController.reconcileTerminalState();
          } catch (error) {
            if (!isTearingDown()) {
              requestRuntimeFailure(error);
            }
          }
        };

        tuiRoot = createRoot(appContext);
        attachYoga(tuiRoot);
        // Record the root immediately after attachment so teardown frees it if
        // later setup fails.
        session!.root = tuiRoot;
        const focusController = createInternalFocusController({
          root: tuiRoot,
        });
        session!.focusController = focusController;
        const geometry = createInternalGeometryService(() => scheduledCommit());
        session!.geometry = geometry;
        const renderedTargets = createRenderedTargetController(tuiRoot, [
          focusController,
          geometry,
        ]);
        session!.renderedTargets = renderedTargets;
      } catch (err) {
        recordTeardownError(err);
        try {
          session!.dispose(); // best-effort: free yoga, restore raw mode/kitty, evict registry entry
        } catch {
          // A failing best-effort restore must NOT replace `err` — the ORIGINAL
          // pre-mount error must survive and be rethrown (mirrors the
          // originalMount catch below).
        }
        throw err;
      }

      const writer = createFrameWriter(terminal, {
        output: "stdout",
        write: (data) => writeRuntimeOutput("stdout", data),
      });
      outputSurface.attachWriter(writer);

      function createOutputStateRollback(): () => void {
        return outputSurface.createRollback();
      }
      session!.createOutputStateRollback = createOutputStateRollback;

      const synchronize = shouldSynchronize(terminal);

      function runSynchronizedOutput(body: () => void): void {
        if (!synchronize) {
          body();
          return;
        }

        let error: unknown;
        let releaseSynchronizedOutput: (() => void) | undefined;
        try {
          writeRuntimeOutput("stdout", bsu, undefined, () => {
            releaseSynchronizedOutput ??= acquireSynchronizedOutputLease();
          });
          body();
        } catch (caught) {
          error = caught;
        } finally {
          try {
            writeRuntimeOutput("stdout", esu, undefined, () => {
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
            writeRuntimeOutput("stdout", bsu, undefined, () => {
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
              writeRuntimeOutput("stdout", esu, undefined, () => {
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

      surfaceRuntime = {
        terminal,
        stdout: "stdout",
        get isResumeInProgress() {
          return terminalResumeInProgress;
        },
        get isStdoutTty() {
          return terminal.capabilities.stdout.isTTY;
        },
        get isStdoutWritable() {
          return terminal.capabilities.stdout.canWrite;
        },
        get viewportColumns() {
          return renderSession.session.dimensions.layout.columns;
        },
        get viewportRows() {
          return renderSession.session.dimensions.layout.rows;
        },
        write(output, data, onHandoff) {
          return writeRuntimeOutput(output, data, undefined, onHandoff);
        },
        writeBestEffort,
        writeTerminal: writeTerminalOutput,
        runCoordinatedWrite,
        runLifecycleTransaction,
        runSynchronizedOutput,
        requestTerminalReconcile,
        reportTerminalAcquired,
        reportTerminalReleased,
        setSurfaceAvailable(available) {
          session!.geometry?.setSurfaceAvailable(available);
        },
      };
      session!.surfaceRuntime = surfaceRuntime;

      function writePreparedStatic(
        prepared: PreparedStaticOutput,
        chunk: string,
        onHandoff?: () => void,
      ): void {
        writeRuntimeOutput("stdout", chunk, undefined, () => {
          onHandoff?.();
          prepared.accept(guardAcceptedStaticCleanup);
        });
      }

      function presentFrame(
        frame: Frame | undefined,
        encoded: string | undefined,
        staticOutput: string,
        preparedStatic: PreparedStaticOutput,
        staticHooks?: {
          readonly onHandoff: () => void;
          readonly onPrepared: () => void;
        },
      ): boolean {
        return outputSurface.present(
          {
            frame,
            ...(encoded === undefined ? {} : { encoded }),
            history: {
              output: staticOutput,
              handoff(onHandoff) {
                writePreparedStatic(preparedStatic, staticOutput, onHandoff);
              },
            },
            onHistoryHandoff: staticHooks?.onHandoff,
            onHistoryPrepared: staticHooks?.onPrepared,
          },
          requireSurfaceRuntime(),
        );
      }

      let blockedFrameRetryPending = false;

      function requestBlockedFrameRetry(ready: Promise<void>): void {
        if (blockedFrameRetryPending || isTearingDown()) return;
        blockedFrameRetryPending = true;
        void ready.then(
          () => {
            blockedFrameRetryPending = false;
            if (!isTearingDown() && !isSuspended()) scheduledCommit();
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
        readonly markStaticHanded: (frame: Frame | undefined, encoded?: string) => void;
        readonly markFrameWritten: (frame: Frame | undefined, encoded?: string) => void;
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
        if (session!.runtimeFailure || session!.mountFailure !== "none") {
          return acceptedCoordinatedWrite;
        }
        if (rejectedFullscreenStatic) return acceptedCoordinatedWrite;
        if (isTerminalSuspended() && !terminalResumePainting) {
          // Suspension pauses physical terminal ownership, not Vue or accepted
          // component lifetimes. Keep rendered-target validity current so a
          // hidden or detached focus boundary cannot retain logical ownership
          // until the terminal resumes.
          session!.renderedTargets?.reconcile();
          return acceptedCoordinatedWrite;
        }
        if (rejectUnsupportedFullscreenStatic()) return acceptedCoordinatedWrite;

        // A surface that has a physical input lease establishes it before user
        // onRender callbacks. Keep acquisition in its own finite transaction so
        // a blocked terminal write cannot overtake the first frame.
        if (!outputSurface.isInputReady) {
          const surface = runOutputTransaction(() => {
            // A rendered target can establish state only after Vue has
            // attached its host node. Reconcile it before the first terminal
            // mutation so input acquisition observes the current tree.
            session!.renderedTargets?.reconcile();
            outputSurface.resume(requireSurfaceRuntime());
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
        let committedFrame: Frame | undefined;
        let committedFrameEncoding: string | undefined;
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
              markStaticHanded(frame, encoded) {
                staticHanded = true;
                frameWritten = true;
                committedFrame = frame;
                committedFrameEncoding = encoded;
              },
              markFrameWritten(frame, encoded) {
                frameWritten = true;
                committedFrame = frame;
                committedFrameEncoding = encoded;
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
                if (hasTestEventSink()) {
                  emitTestEvent(RUNTIME_TEST_EVENT.paintCommitted, {
                    frame:
                      committedFrameEncoding ??
                      (committedFrame === undefined ? "" : encodeFrame(committedFrame)),
                  });
                }
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
        if (session!.runtimeFailure || session!.mountFailure !== "none") return;
        if (rejectedFullscreenStatic) return;
        if (isTerminalSuspended() && !terminalResumePainting) return;
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
        session!.renderedTargets?.reconcile();

        // Only non-empty Static blocks participate in settlement; output-free
        // instances stay open for later content or ordinary Vue unmount. A
        // prepared block is accepted only after its stdout write returns normally.
        const w = renderSession.session.dimensions.layout.columns;
        const dynamicHeight: LayoutHeightConstraint = outputSurface.layoutHeight(
          renderSession.session.dimensions.layout.rows,
        );
        geometryFrame = session!.geometry?.beginFrame();
        const {
          frame,
          preparedStatic: prepared,
          layout,
        } = runRenderCommit({
          dynamicRoot: tuiRoot,
          staticRoots: staticNodes,
          columns: w,
          dynamicHeight,
          terminalStyle: renderSession.terminalStyle,
          paintViewport: "height-constraint",
          focusController: session!.focusController,
          geometry: geometryFrame,
        });
        preparedStatic = prepared;
        try {
          const staticOutput = outputSurface.encodeHistory(prepared.frames);
          const hasStaticOutput = staticOutput !== "";
          let encodedFrame: string | undefined;
          if (renderObserver?.onCommit) {
            encodedFrame = frame === undefined ? "" : encodeFrame(frame);
            renderObserver.onCommit({
              dynamic: encodedFrame,
              staticOutput: hasStaticOutput ? staticOutput : "",
              phase: isTearingDown() ? "teardown" : "update",
            });
          }
          if (!outputSurface.isInputReady) {
            // A setup-owned managed-input demand may already own the physical
            // surface. Otherwise this idempotent acquisition happens only after
            // renderer-owned target and geometry preparation has succeeded.
            outputSurface.resume(requireSurfaceRuntime());
          }

          if (onRender) onRender({ renderTime: performance.now() - start });
          if (
            presentFrame(frame, encodedFrame, staticOutput, prepared, {
              onHandoff: () => hooks.markStaticHanded(frame, encodedFrame),
              onPrepared: hooks.capturePostStaticRollback,
            })
          ) {
            hooks.markFrameWritten(frame, encodedFrame);
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
          if (!isTearingDown()) requestRuntimeFailure(error);
        },
      });
      session!.scheduler = scheduler;
      session!.commit = commit;
      prepareResumeSurface = () => commit;
      scheduledCommit = () => {
        if (!session!.runtimeFailure && session!.mountFailure === "none" && !resizePaintPending) {
          scheduler.schedule();
        }
      };

      // Internal provides — set before the actual mount so components can inject
      // them. User .use/.provide calls made earlier on the chain stay intact;
      // our keys are Symbols so there's no collision risk.
      baseApp.provide(InternalRenderSessionKey, renderSession);
      baseApp.provide(AppContextKey, appContext);
      baseApp.provide(RenderedTargetControllerKey, session!.renderedTargets!);
      baseApp.provide(InternalGeometryServiceKey, session!.geometry!);
      baseApp.provide(InternalFocusControllerKey, session!.focusController!);
      baseApp.provide(StdinContextKey, stdinController);
      extension.configureApp?.(baseApp, {
        fixedViewport: outputSurface.kind === "fullscreen-terminal",
      });
      extension.mounted?.(session!, {
        settleExit: resolveExit,
        waitUntilExit: () => exitPromise,
      });

      // Patch console.log/warn/error etc. to route through writeToStdout /
      // writeToStderr so console output doesn't corrupt the rendered frame.
      // Installed before originalMount so setup-time user and dependency output
      // is coordinated from the first component turn.
      // The mount-throw catch below calls Session.dispose(), which restores the console,
      // so a synchronous mount failure cannot leak a patched console.
      if (patchConsole) {
        session!.consoleSink = registerConsoleSink((stream, data) => {
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
      session!.vueMountStarted = true;
      try {
        proxy = originalMount(tuiRoot);
        session!.vueMountCompleted = true;
        // A semantic route created during Vue setup can begin Kitty detection,
        // but its shared stdin ingress already exists. Ordinary input beside a
        // synchronous reply is retained until setup has installed the complete
        // initial route set, then delivered in its original order here.
        stdinController.activateInputDelivery();
        if (session!.mountRuntimeFailure) throw session!.mountRuntimeFailure;
      } catch (err) {
        session!.mountFailure = "failed";
        recordVueMountFailure(err);
        const mountError = selectedExitError();
        rollbackPartialVueMount(session!);
        try {
          session!.dispose(); // best-effort cursor/alt-screen restore
        } catch {
          // teardown delegates restoration to the mounted surface, whose
          // writer or terminal escape write can itself throw if
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
      if (outputSurface.isLive) {
        // Track the physical geometry that the current relative-writer baseline
        // was painted against. A real dimension change can invalidate that
        // baseline even when the logical component output is unchanged.
        let lastPaintedTerminalWidth = renderSession.session.dimensions.layout.columns;
        let lastPaintedTerminalRows = renderSession.session.dimensions.terminal?.rows ?? null;

        const prepareDimensionUpdate = (
          preferFreshProbe: boolean,
          allowWhileResuming: boolean,
        ): (() => CoordinatedWriteResult) | null => {
          if (isTerminalSuspended() && !allowWhileResuming) return null;
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
          const mappingChanged = dimensionsChanged;

          return () =>
            commit({
              retryWhenBlocked: false,
              beforeFrame() {
                // Vue may have scheduled a host commit while reacting to the new
                // dimensions. This explicit commit is the authoritative paint for
                // the resize/continue boundary.
                scheduler.cancel();
                outputSurface.resize(requireSurfaceRuntime(), {
                  currentColumns: currentWidth,
                  currentRows,
                  mappingChanged,
                  previousColumns: previousTerminalWidth,
                });
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
              !isTearingDown() &&
              !isSuspended() &&
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

              if (isTearingDown() || isSuspended()) break;
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
            if (!isTearingDown()) requestRuntimeFailure(error);
          } finally {
            resizePaintPending = false;
            resizeRefreshRunning = false;
            if (
              !isTearingDown() &&
              !isSuspended() &&
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
            isTearingDown()
          )
            return;
          const refresh = refreshPendingResize();
          session!.resizeRefresh = refresh;
          void refresh.then(() => {
            if (session!.resizeRefresh === refresh) session!.resizeRefresh = null;
          });
        };
        const onResize = () => {
          resizeEventGeneration++;
          requestPendingResizeRefresh();
        };
        prepareResumeSurface = () => prepareDimensionUpdate(true, true);
        session!.resizeHandler = terminal.onResize(onResize);
      }

      const leaveLifecycleTransaction = leaveMountLifecycleTransaction;
      leaveMountLifecycleTransaction = null;
      leaveLifecycleTransaction();
      if (!isTearingDown()) session!.transition("running");
      session!.endSuspensionGate();
      if (pendingMountSuspension && !isTearingDown()) {
        pendingMountSuspension = false;
        suspendSession();
      }
      if (session!.mountRuntimeFailure) throw session!.mountRuntimeFailure;
      return session!.userRoot ?? proxy;
    } catch (error) {
      session!.mountFailure = "failed";
      recordTeardownError(error);
      const mountError = selectedExitError();
      const leaveLifecycleTransaction = leaveMountLifecycleTransaction;
      leaveMountLifecycleTransaction = null;
      leaveLifecycleTransaction?.();
      try {
        session!.dispose();
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
      session?.dispose();
    } finally {
      resolveExit();
    }
  };

  app.waitUntilExit = function waitUntilExit(): Promise<void> {
    return exitPromise;
  };

  // The app owner can wait for Vue, console, renderer, and stream work to settle.
  async function waitUntilRenderFlush(): Promise<void> {
    if (!session?.appContext || !session.vueMountStarted || isTearingDown()) {
      if (isTearingDown() && !isTornDown()) {
        await exitPromise.catch(() => {});
      }
      return;
    }
    const activeSession = session;
    const terminal = activeSession?.terminal;
    const coordinator = activeSession?.outputCoordinator;

    // A blocked commit resolves its scheduler turn immediately, then registers
    // exactly one retry for `drain`. Loop through both layers so a waiter cannot
    // observe the old frame between those two turns.
    while (true) {
      await activeSession?.consoleSink?.waitForIdle();
      while (activeSession?.resizeRefresh) await activeSession.resizeRefresh;
      const terminalReconcile = activeSession?.terminalReconcile;
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

      if (activeSession?.scheduler) {
        if (terminal?.capabilities.stdout.canWrite) await activeSession.scheduler.flush();
        else activeSession.scheduler.cancel();
      }

      if (
        !coordinator?.isBlocked() &&
        !activeSession?.resizeRefresh &&
        !activeSession?.terminalReconcile
      ) {
        break;
      }
    }

    try {
      await writeOutputBarrier("stdout");
    } catch (error) {
      requestRuntimeFailure(error);
      await exitPromise.catch(() => {});
    }
  }
  app.waitUntilRenderFlush = waitUntilRenderFlush;

  return app;
}
