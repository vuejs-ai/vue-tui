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
import { createRenderer } from "@vue/runtime-core";
import { EventEmitter } from "node:events";
import { writeSync as fsWriteSync } from "node:fs";
import isInCi from "is-in-ci";
import { onExit } from "signal-exit";
import patchConsoleFn from "patch-console";
import ansiEscapes from "ansi-escapes";
import wrapAnsi from "wrap-ansi";
import { createInputParser, type InputEvent } from "./io/input-parser.ts";
import { parseKeypress } from "./io/parse-keypress.ts";
import { createKittyKeyboardController, type KittyKeyboardOptions } from "./io/kitty-keyboard.ts";
import { createRoot, emitLayoutListeners, type TuiRoot, type TuiNode } from "./host/nodes.ts";
import { calculateLayoutWithContentGuards } from "./host/layout-guards.ts";
import { attachYoga, detachYoga } from "./host/yoga.ts";
import { buildNodeOps } from "./host/node-ops.ts";
import { createCommitScheduler } from "./scheduler.ts";
import { createAnimationScheduler } from "./animation-scheduler.ts";
import { paint } from "./paint/paint.ts";
import { renderScreenReaderOutput } from "./paint/screen-reader.ts";
import { findStatics, paintStaticNode } from "./paint/static-channel.ts";
import { createFrameWriter } from "./io/frame-writer.ts";
import { INTERNAL_FRAME_SINK, type FrameSink } from "./io/frame-sink.ts";
import { bsu, esu, shouldSynchronize } from "./io/write-synchronized.ts";
import {
  AppContextKey,
  FocusContextKey,
  StdinContextKey,
  AnimationSchedulerKey,
  type AppContext,
  type CursorPosition,
  type FocusContext,
  type StdinContext,
} from "./context.ts";
import { devState, DevStateKey, initHmrBridge } from "./hmr.ts";
import { createDevOverlayWrapper } from "./overlay.ts";
import { ErrorOverview, messageForNonError } from "./components/error-overview.ts";
import { resolveSize } from "./composables/useWindowSize.ts";

export interface MountOptions {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
  debug?: boolean;
  exitOnCtrlC?: boolean;
  /**
   * Controls when the app holds the terminal's raw mode, which suppresses the
   * terminal's own echo and line-editing.
   *
   * - `'always'` (default): raw mode is enabled at mount and held for the whole
   *   run, even when no input composable is mounted, so typed keys never echo
   *   into the rendered frame and Ctrl+C behaves the same on every screen.
   * - `'auto'`: raw mode is enabled only while a `useInput`, `useFocus`, or
   *   `usePaste` is mounted, and released when the last one unmounts — so a
   *   screen with no input handler returns to the terminal's normal cooked mode
   *   (native echo, line-editing, Ctrl+C/Ctrl+Z). This is Ink's original behavior.
   *
   * Has no effect when non-interactive or when stdin is not a TTY (raw mode is
   * unsupported there).
   *
   * @default 'always'
   */
  rawMode?: "always" | "auto";
  /**
   * Override automatic interactive mode detection.
   *
   * By default, vue-tui detects whether the environment is interactive based
   * on CI detection (via `is-in-ci`) and `stdout.isTTY`. Most users should
   * not need to set this.
   *
   * When non-interactive, vue-tui disables ANSI erase sequences, cursor
   * manipulation, resize handling, writing only the final frame at unmount.
   *
   * @default true (false if in CI or `stdout.isTTY` is falsy)
   */
  interactive?: boolean;
  /**
   * Patch `console.*` methods to route output through the TUI frame
   * coordinator (writeToStdout / writeToStderr) so that console.log
   * calls don't corrupt the rendered UI.
   *
   * Automatically disabled in debug mode.
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
   * Ignored in debug / screen-reader mode (commits are immediate).
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
   * Enable incremental rendering. When enabled, the frame writer uses
   * line-diffing to minimize terminal writes — only changed lines are
   * rewritten instead of erasing and repainting the entire frame.
   *
   * @default false
   */
  incrementalRendering?: boolean;
  /**
   * Render in the terminal's alternate screen buffer. When enabled, the
   * terminal switches to a clean buffer on mount and restores the original
   * content on unmount — no rendering artifacts are left behind.
   *
   * Requires interactive mode and a TTY stdout. Silently ignored otherwise.
   *
   * @default false
   */
  alternateScreen?: boolean;
  /**
   * Configure kitty keyboard protocol support for enhanced keyboard input.
   * Enables additional modifiers (super, hyper, capsLock, numLock) and
   * disambiguated key events in terminals that support the protocol.
   *
   * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
   */
  kittyKeyboard?: KittyKeyboardOptions;
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

function shouldClearTerminalForFrame(opts: {
  isTty: boolean;
  viewportRows: number;
  previousOutputHeight: number;
  nextOutputHeight: number;
  isUnmounting: boolean;
}): boolean {
  if (!opts.isTty) return false;
  const hadPreviousFrame = opts.previousOutputHeight > 0;
  const wasFullscreen = opts.previousOutputHeight >= opts.viewportRows;
  const wasOverflowing = opts.previousOutputHeight > opts.viewportRows;
  const isOverflowing = opts.nextOutputHeight > opts.viewportRows;
  const isLeavingFullscreen = wasFullscreen && opts.nextOutputHeight < opts.viewportRows;
  const shouldClearOnUnmount = opts.isUnmounting && wasFullscreen;
  return (
    wasOverflowing ||
    (isOverflowing && hadPreviousFrame) ||
    isLeavingFullscreen ||
    shouldClearOnUnmount
  );
}

// Module-level registry: maps each NodeJS.WriteStream to the one live TuiApp
// that owns its renderer. Mirrors Ink's WeakMap<NodeJS.WriteStream, Ink> in
// instances.ts. Keyed weakly so closed/GC'd streams don't leak memory.
// Only the app that successfully wired a renderer (mountedAsOwner=true) owns
// the entry and removes it on teardown; a "no-op" second mount never touches it.
const liveInstances = new WeakMap<NodeJS.WriteStream, TuiApp>();

// Classify an exit() input as error-vs-result, matching Ink's isErrorInput
// (ink.tsx:154-159 @ v7.0.4). The plain `instanceof Error` check fails for a
// cross-realm Error — one created in a different VM context (e.g.
// `vm.runInNewContext("new Error()")`) has a prototype from the OTHER realm, so
// it isn't an instance of THIS realm's Error even though it is a genuine Error.
// The `[object Error]` brand (Symbol.toStringTag, not prototype-based) crosses
// realms, so it catches those foreign Errors and they REJECT waitUntilExit()
// instead of being silently swallowed as a resolved result value. Non-Error
// result values (string/number/plain object) brand as e.g. `[object String]`,
// so they still RESOLVE — exactly Ink's contract.
function isErrorInput(value: unknown): value is Error {
  return value instanceof Error || Object.prototype.toString.call(value) === "[object Error]";
}

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
  let mountedExitListener: (() => void) | null = null;
  // signal-exit unsubscribe fn (Ink parity G18). Registered at interactive
  // mount so SIGINT/SIGTERM/SIGHUP route to teardown(); called in teardown()
  // to remove the handler so it can't leak or double-run.
  let mountedUnsubscribeExit: (() => void) | null = null;
  let mountedBeforeExitHandler: (() => void) | null = null;
  let mountedDebug = false;
  let mountedInteractive = true;
  let mountedGetLastOutput: (() => string) | null = null;
  let mountedRestoreConsole: (() => void) | null = null;
  let mountedScheduler: ReturnType<typeof createCommitScheduler> | null = null;
  let mountedAnimationScheduler: ReturnType<typeof createAnimationScheduler> | null = null;
  let mountedCommit: (() => void) | null = null;
  let mountedAlternateScreen = false;
  let mountedClear: (() => void) | null = null;
  let mountedKittyController: ReturnType<typeof createKittyKeyboardController> | null = null;
  // Tracks whether this app currently owns the liveInstances entry for its
  // stdout — set when a mount() actually wires a renderer, cleared when
  // teardown() evicts the entry. A mount() that hits the instance-reuse guard
  // wires nothing and leaves this (and all other mounted* state) untouched:
  // whether unmount()/teardown() have real work to do is derived from the
  // actually-wired state, never from a sticky "was ever guarded" flag (audit
  // e18 — a sticky flag let one guarded call disable teardown of a mount the
  // app DID wire).
  let mountedAsOwner = false;

  // The renderer's onCommit closure is wired at createApp time but only does
  // real work after mount swaps in scheduler.schedule. One renderer per app
  // even though it's not used until mount.
  let scheduledCommit: () => void = () => {};

  // Pending exit state — stored so resolveExit() can flush stdout before
  // settling the exit promise.
  let pendingExitError: unknown = undefined;
  let pendingExitResult: unknown = undefined;

  function resolveExit() {
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
    const stdout = (mountedAppContext?.stdout ?? process.stdout) as MaybeWritableStream;
    const { canWriteToStdout, hasWritableState } = getWritableStreamState(stdout);

    const finish = () => {
      if (isErrorInput(pendingExitError)) {
        exitReject(pendingExitError);
      } else {
        exitResolve(pendingExitResult);
      }
    };

    if (canWriteToStdout && hasWritableState) {
      stdout.write("", () => finish());
    } else {
      setImmediate(() => finish());
    }
  }

  function writeBestEffort(stream: NodeJS.WriteStream, data: string, sync = false) {
    if (!getWritableStreamState(stream as MaybeWritableStream).canWriteToStdout) return;
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
        const streamFd = (stream as { fd?: number }).fd;
        const fd = typeof streamFd === "number" ? streamFd : 1;
        fsWriteSync(fd, data);
      } else {
        stream.write(data);
      }
    } catch {
      // Stream may already be destroyed during shutdown, or the fd may be
      // unwritable; restore is best-effort.
    }
  }

  let teardownStarted = false;
  // `sync` is set only when teardown is driven by the signal-exit callback
  // (G18, Finding A). On that path the restore escapes must be written
  // synchronously (fs.writeSync) so they reach the fd before signal-exit
  // re-raises the signal. The normal unmount()/exit() path keeps async writes.
  function teardown(sync = false) {
    // Nothing wired: this app never mounted a renderer (never mounted, or
    // every mount() hit the instance-reuse guard, which wires nothing), so
    // teardown is a complete no-op — do not touch any stream or another
    // app's WeakMap entry. Derived from actual wired state, NOT a sticky
    // "was ever guarded" flag: a guarded mount() call is inert for that call
    // only and must never disable teardown of a mount this app DID wire
    // (double-fire on its own live stdout, a later mount on a free stdout,
    // or merely targeting another app's busy stream — audit e18).
    if (!mountedAppContext) return;
    if (teardownStarted) return;
    teardownStarted = true;

    // Remove the signal-exit handler first (Ink parity G18, ink.tsx:765:
    // `this.unsubscribeExit()`). When teardown is triggered BY a signal,
    // signal-exit has already unloaded its own listeners, so this is a no-op;
    // when triggered by unmount()/exit(), it stops the handler from firing
    // later (no leak, no double-run — teardownStarted also guards re-entry).
    if (mountedUnsubscribeExit) {
      mountedUnsubscribeExit();
      mountedUnsubscribeExit = null;
    }

    // Remove this app from the live-instances registry so a subsequent mount()
    // on the same stdout works normally. Only the owning app removes its entry;
    // a no-op second mount (mountedAsOwner=false) must NOT evict the first
    // app's entry.
    if (mountedAsOwner && mountedAppContext) {
      liveInstances.delete(mountedAppContext.stdout);
      mountedAsOwner = false;
    }

    // Cancel any pending trailing-edge timer first, then do a final
    // synchronous commit so the latest state is always flushed before
    // unmount (matching Ink ink.tsx:755-761).
    // teardownStarted=true makes shouldClearTerminalForFrame see isUnmounting,
    // so fullscreen apps get clearTerminal on exit.
    scheduledCommit = () => {};
    mountedScheduler?.cancel();
    // Prevent post-unmount app.clear() from writing to a torn-down stream.
    mountedClear = null;
    const stdout = mountedAppContext?.stdout;
    const stdoutWritable = stdout
      ? getWritableStreamState(stdout as MaybeWritableStream).canWriteToStdout
      : false;
    // Final-frame re-emit at unmount. Ink's settleThrottle path (ink.tsx:749-762)
    // runs a final onRender when shouldRenderFinalFrame is true; for the DEBUG
    // path throttledOnRender is undefined, so `!this.throttledOnRender` makes
    // shouldRenderFinalFrame unconditionally true and Ink re-emits the last frame
    // before the unmount-time trailing write. Mirror that here: both interactive
    // and debug get a final mountedCommit() (debug commits are unthrottled, so a
    // re-commit always re-writes `fullStaticOutput + frame`). Non-interactive-
    // non-debug stays excluded — its frame is deferred to the trailing-write block
    // below, matching Ink's `this.lastOutput + '\n'` branch (ink.tsx:817-818).
    if ((mountedInteractive || mountedDebug) && mountedCommit && stdoutWritable) {
      try {
        mountedCommit();
      } catch {
        // Final render is best-effort; don't block teardown cleanup.
      }
    }
    // Restore console BEFORE Vue cleanup (matching Ink ink.tsx:779)
    if (mountedRestoreConsole) {
      mountedRestoreConsole();
      mountedRestoreConsole = null;
    }
    try {
      originalUnmount();
    } catch {
      // Vue's unmount may throw on double-unmount; swallow for idempotency.
    }
    // Dispose the animation scheduler after Vue unmount: each useAnimation's
    // onScopeDispose has already unsubscribed, so this is an idempotent backstop.
    mountedAnimationScheduler?.dispose();
    mountedAnimationScheduler = null;
    if (mountedKittyController) {
      // Disable-kitty is a restore escape: on the signal path it must flush
      // synchronously too (Finding A).
      mountedKittyController.dispose(sync);
      mountedKittyController = null;
    }
    if (!mountedInteractive && mountedAppContext) {
      // Non-interactive teardown write, mirroring Ink's finishUnmount branch
      // (ink.tsx:812-819: `stdout.write(this.options.debug ? '\n' : this.lastOutput + '\n')`).
      // In DEBUG each render already wrote its full frame to stdout (and the
      // final-frame re-emit above re-wrote the last one), so only a trailing
      // newline is owed — Ink writes a bare "\n" here unconditionally. In
      // non-debug non-interactive mode the dynamic frame was deferred during
      // rendering, so write it now as `lastFrame + "\n"`.
      if (mountedDebug) {
        writeBestEffort(mountedAppContext.stdout, "\n");
      } else {
        const lastFrame = mountedGetLastOutput?.() ?? "";
        writeBestEffort(mountedAppContext.stdout, lastFrame + "\n");
      }
    }
    if (mountedWriter && !mountedDebug && mountedInteractive && stdoutWritable)
      mountedWriter.done();
    if (mountedAlternateScreen && mountedAppContext) {
      writeBestEffort(mountedAppContext.stdout, ansiEscapes.exitAlternativeScreen, sync);
      writeBestEffort(mountedAppContext.stdout, "\x1b[?25h", sync);
      mountedAlternateScreen = false;
    } else if (
      !mountedDebug &&
      mountedInteractive &&
      mountedAppContext &&
      Boolean(mountedAppContext.stdout.isTTY)
    ) {
      // isTTY gate (cli-cursor short-circuit): Ink's non-alt-screen teardown
      // show goes through log.done() -> cliCursor.show, which no-ops on a
      // non-TTY stream. Forced-interactive on a piped stdout emits no show.
      writeBestEffort(mountedAppContext.stdout, "\x1b[?25h", sync);
    }
    if (mountedRoot) detachYoga(mountedRoot);
    if (mountedResizeHandler && mountedAppContext) {
      mountedAppContext.stdout.off("resize", mountedResizeHandler);
    }
    if (mountedExitListener) {
      process.off("exit", mountedExitListener);
    }
    if (mountedBeforeExitHandler) {
      process.off("beforeExit", mountedBeforeExitHandler);
      mountedBeforeExitHandler = null;
    }
    if (mountedStdinController) {
      mountedStdinController.dispose();
    }
  }

  const renderer = createRenderer<TuiNode, TuiNode>(
    buildNodeOps({ onCommit: () => scheduledCommit() }),
  );
  if (typeof __VUE_TUI_DEV__ !== "undefined" && __VUE_TUI_DEV__) {
    initHmrBridge();
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

      onErrorCaptured((err) => {
        // Preserve a genuine Error — including a cross-realm one (fails
        // `instanceof Error`, passes the `[object Error]` brand check) — so the
        // ORIGINAL thrown error reaches exit()/waitUntilExit() unchanged,
        // matching Ink's ErrorBoundary (rejects with the thrown value itself).
        // A true non-Error throw (`throw "x"`, `throw 0`, `throw {message:'x'}`)
        // is wrapped with the SAME message ErrorOverview displays
        // (messageForNonError), so the shown and rejected messages agree (e17).
        const e = isErrorInput(err) ? err : new Error(messageForNonError(err));
        caught.value = err;
        errored.value = true;
        // Flush the ErrorOverview frame, then exit
        void nextTick(() => {
          exitWithError(e);
        });
        return false; // stop propagation
      });

      return () => {
        if (errored.value) {
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
    const stdout = options.stdout ?? process.stdout;
    const stdin = options.stdin ?? process.stdin;
    const stderr = options.stderr ?? process.stderr;
    const debug = options.debug ?? false;

    // Internal, test-only per-app frame sink (see io/frame-sink.ts). Read off a
    // Symbol-keyed mount option so it never appears on the public MountOptions
    // type (which stays Ink-faithful). Closure-captured here — no module-global
    // state — so concurrent test files / multiple apps stay isolated. When set,
    // the debug commit branch forwards the EXACT content chunks it writes to
    // stdout (static-history chunk, then dynamic frame), MINUS escapes, so the
    // testing helper's frames[] are provably content-only.
    const frameSink = (options as { [INTERNAL_FRAME_SINK]?: FrameSink })[INTERNAL_FRAME_SINK];

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

    // Register this app as the owner of the stdout entry.
    liveInstances.set(stdout, app);
    mountedAsOwner = true;
    const exitOnCtrlC = options.exitOnCtrlC ?? true;
    // 'always' (default): own raw mode for the whole interactive run; 'auto':
    // Ink's lazy model where input composables acquire it on demand. See the
    // MountOptions.rawMode docs and .agents/docs/ink-divergences.md.
    const rawMode = options.rawMode ?? "always";
    const onRender = options.onRender;
    // Default maxFps to 30 to match Ink (ink.tsx: `options.maxFps ?? 30`), so
    // the render throttle engages by default — without this the animation
    // coalescing (G02) never kicks in on the normal non-debug path.
    const maxFps = options.maxFps ?? 30;
    const isScreenReaderEnabled =
      options.isScreenReaderEnabled ?? process.env["INK_SCREEN_READER"] === "true";
    mountedDebug = debug;

    // Interactive mode detection — matches Ink's logic:
    // CI detection takes precedence: even a TTY stdout in CI defaults to
    // non-interactive. Using Boolean(isTTY) (rather than an 'in' guard)
    // correctly handles piped streams where the property is absent.
    const interactive = options.interactive ?? (!isInCi && Boolean(stdout.isTTY));
    mountedInteractive = interactive;

    // Frame coordination state — tracks the last rendered output so
    // writeToStdout/writeToStderr can clear and restore the active frame.
    // Frame state: lastOutput is the most recent rendered frame string,
    // outputHeight is its line count (used for erase-lines on resize and
    // screen-reader mode in future tasks), fullStaticOutput is the
    // accumulated <Static> content.
    const frameState = {
      lastOutput: "",
      lastOutputToRender: "" as string | undefined,
      outputHeight: 0,
      fullStaticOutput: "",
    };
    let cursorPosition: CursorPosition | undefined;
    mountedGetLastOutput = () => frameState.lastOutput;

    function restoreLastOutput() {
      if (!interactive) return;
      // Clear() resets log-update's cursor state, so replay the latest cursor
      // intent before restoring output after external stdout/stderr writes.
      writer.setCursorPosition(cursorPosition);
      // Use `||` (not `??`): an EMPTY lastOutputToRender — its initial value before
      // the first content commit, the value the narrowing-resize path assigns
      // (render.ts:1043), and what an empty screen-reader frame leaves — must fall
      // back to `lastOutput + "\n"`, matching Ink (ink.tsx:507) and vue's own
      // mountedClear (render.ts:668). `??` only falls back for null/undefined, so an
      // empty string would pass through and restore nothing after an external write.
      writer.write(frameState.lastOutputToRender || frameState.lastOutput + "\n");
    }

    function writeToStdout(data: string) {
      // Mirror Ink ink.tsx:673: return early after teardown so a late write
      // (e.g. a stray useStdout().write after unmount) cannot run
      // clear()/write/restore on an already-torn-down renderer.
      if (teardownStarted) return;
      if (debug) {
        const out = data + frameState.fullStaticOutput + frameState.lastOutput;
        stdout.write(out);
        // Forward the EXACT stdout bytes to the test-only sink. This is content
        // (app data + replayed frame), not a terminal-control escape, so the
        // testing helper's frames[] reproduce today's verbatim capture — only
        // escapes are excluded under B′.
        frameSink?.(out);
        return;
      }
      if (!interactive) {
        stdout.write(data);
        return;
      }
      // Mirror the render path: wrap clear+write+restore in BSU/ESU when the
      // terminal supports synchronized updates, so the three-step sequence is
      // atomic and prevents tear/flicker (Ink parity G09, ink.tsx:687-698).
      if (synchronize) stdout.write(bsu);
      writer.clear();
      stdout.write(data);
      restoreLastOutput();
      if (synchronize) stdout.write(esu);
    }

    function writeToStderr(data: string) {
      // Mirror Ink ink.tsx:702: return early after teardown so a late write
      // cannot corrupt the restored terminal state.
      if (teardownStarted) return;
      if (debug) {
        stderr.write(data);
        const replay = frameState.fullStaticOutput + frameState.lastOutput;
        stdout.write(replay);
        // Forward the replayed-frame stdout bytes to the test-only sink (content,
        // not an escape). The stderr `data` is intentionally NOT forwarded: the
        // old verbatim capture wrapped STDOUT only, so stderr never appeared in
        // frames[]. Faithful B′ keeps frames[] = the stdout content stream.
        frameSink?.(replay);
        return;
      }
      if (!interactive) {
        stderr.write(data);
        return;
      }
      // Per Ink ink.tsx:717-728: BSU/ESU are emitted on STDOUT (not stderr)
      // because synchronized-update mode is a stdout capability, while the
      // actual data goes to stderr. The sync gate also uses stdout's isTTY.
      if (synchronize) stdout.write(bsu);
      writer.clear();
      stderr.write(data);
      restoreLastOutput();
      if (synchronize) stdout.write(esu);
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
          pendingExitError = errorOrResult;
        } else {
          pendingExitResult = errorOrResult;
        }
        // Defer teardown to a microtask: exit() is frequently called from
        // inside the Vue update cycle (useInput handler, setup(), errorHandler)
        // and unmounting synchronously would tear Vue down mid-flush.
        queueMicrotask(() => {
          teardown();
          resolveExit();
        });
      },
      waitUntilRenderFlush,
      stdout,
      stderr,
      stdin,
      debug,
      interactive,
      isScreenReaderEnabled,
      isRawModeSupported: !!(stdin as { isTTY?: boolean }).isTTY,
      setRawMode(mode: boolean) {
        if (
          typeof (stdin as { setRawMode?: (mode: boolean) => unknown }).setRawMode === "function"
        ) {
          (stdin as { setRawMode: (mode: boolean) => unknown }).setRawMode(mode);
        }
      },
      writeToStdout,
      writeToStderr,
      cursorPosition: undefined,
      setCursorPosition(pos: CursorPosition | undefined) {
        cursorPosition = pos;
        appContext.cursorPosition = pos;
        // Mirror Ink's single setCursorPosition (ink.tsx:494-497), which sets
        // BOTH the instance field AND this.log.setCursorPosition(position) on
        // every render. Forwarding to the frame writer updates log-update's
        // last-declared position (persistently re-emitted at every commit) and
        // marks cursorDirty so the commit gate (output !== lastOutput ||
        // isCursorDirty) fires even on a cursor-only move (same output, new pos).
        // Without this the cursor is never shown/moved on the interactive path.
        // `writer` is created below in mount() but is always initialized before
        // any render/setup can call this (originalMount runs after writer creation),
        // so the optional-chain guards only the pre-mount appContext shape.
        mountedWriter?.setCursorPosition(pos);
      },
    };
    mountedAppContext = appContext;

    const focusContext: FocusContext = createFocusController();
    const stdinController = createStdinController(stdin, {
      exitOnCtrlC,
      appCtx: appContext,
      focusContext,
    });
    mountedStdinController = stdinController;

    // rawMode 'always': the App itself acquires a lifetime raw-mode ref now, so
    // the refcount floor never drops to 0 while the app runs — raw mode is held
    // continuously regardless of which input composables come and go, and there
    // is no cooked-mode oscillation between input and no-input screens. Gated on
    // interactive + isRawModeSupported (a TTY stdin): a non-interactive/piped run
    // must not seize raw mode. The matching release happens in the controller's
    // dispose() at teardown. (Diverges from Ink's lazy default — see
    // .agents/docs/ink-divergences.md.)
    if (rawMode === "always" && interactive && stdinController.isRawModeSupported) {
      stdinController.holdRawModeForLifetime();
    }

    const kittyController = createKittyKeyboardController(stdin, stdout);
    kittyController.init(options.kittyKeyboard, interactive);
    mountedKittyController = kittyController;

    const tuiRoot = createRoot(appContext);
    attachYoga(tuiRoot);
    tuiRoot.yoga.setWidth(resolveSize(stdout).columns);
    mountedRoot = tuiRoot;

    // Reset accumulated static output when the <Static> identity changes
    // (unmount, remount via key change) so stale items are not replayed.
    tuiRoot.onStaticChange = () => {
      frameState.fullStaticOutput = "";
    };

    const writer = createFrameWriter(stdout, {
      debug,
      incremental: options.incrementalRendering,
    });
    mountedWriter = writer;
    mountedClear = () => {
      if (!interactive || debug) return;
      writer.clear();
      writer.sync(frameState.lastOutputToRender || frameState.lastOutput + "\n");
    };
    const synchronize = shouldSynchronize(stdout, interactive);

    function renderInteractiveFrame(output: string, outputHeight: number, staticOutput: string) {
      const hasStaticOutput = staticOutput !== "";
      const isTty = !!stdout.isTTY;
      // Keep non-TTY → 24 fallback (matching Ink: non-tty viewportRows is always 24).
      // Use resolveSize for TTY to handle the 0-columns/rows case (Ink parity G12).
      const viewportRows = isTty ? resolveSize(stdout).rows : 24;

      // Fullscreen: output fills or exceeds terminal height — no trailing newline.
      // Only apply when writing to a real TTY — piped output always gets trailing newlines.
      const isFullscreen = isTty && outputHeight >= viewportRows;
      // SR parity (G17 + G46): Ink's screen-reader branch (ink.tsx:617-621)
      // writes the wrapped output verbatim — `stdout.write(erase + wrappedOutput)`
      // with `lastOutputToRender = wrappedOutput` (NO appended "\n" in ANY case)
      // and `lastOutputHeight = wrappedOutput === "" ? 0 : split("\n").length`.
      // So EVERY SR frame, empty or not, must skip the trailing newline: an empty
      // frame emits zero lines instead of a spurious blank line (G17), and a
      // non-empty multi-line frame keeps its true line count so the next-frame
      // erase is eraseLines(N), not eraseLines(N+1) (G46 off-by-one). Non-SR
      // interactive frames are untouched — they still append "\n" as before.
      const outputToRender = isFullscreen || isScreenReaderEnabled ? output : output + "\n";

      const shouldClear = shouldClearTerminalForFrame({
        isTty,
        viewportRows,
        previousOutputHeight: frameState.outputHeight,
        nextOutputHeight: outputHeight,
        isUnmounting: teardownStarted,
      });

      if (shouldClear) {
        // Direct write: clearTerminal + accumulated static + raw output.
        // BSU/ESU wrap the actual stream writes (not embedded in the frame
        // string) so synchronization survives log-update's line diffing.
        if (synchronize) stdout.write(bsu);
        stdout.write(ansiEscapes.clearTerminal + frameState.fullStaticOutput + output);
        // Sync log-update state so next render computes correct erase
        writer.sync(outputToRender);
        if (synchronize) stdout.write(esu);
      } else if (hasStaticOutput) {
        // Clear frame -> write static -> re-render frame via log-update
        if (synchronize) stdout.write(bsu);
        writer.clear();
        stdout.write(staticOutput);
        writer.write(outputToRender);
        if (synchronize) stdout.write(esu);
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
        //    is never reached, so an empty app emits zero cursor escapes (cursor
        //    stays visible), matching Ink. Using willRender(outputToRender) here
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
          if (shouldWrap) stdout.write(bsu);
          writer.write(outputToRender);
          if (shouldWrap) stdout.write(esu);
        }
      }

      frameState.lastOutput = output;
      frameState.lastOutputToRender = outputToRender;
      frameState.outputHeight = outputHeight;
    }

    // Produce the dynamic frame for a given terminal width. In screen-reader
    // mode the tree is linearized to flat plain text (no borders / 2D grid)
    // via renderScreenReaderOutput, then wrapped with wrapAnsi(trim:false,
    // hard:true) — matching Ink's onRender SR branch (ink.tsx:598-603). The
    // <Static> channel is excluded here (skipStaticElements) just like
    // render-to-string.ts; static output is handled separately by commit().
    function renderFrame(width: number): string {
      if (!isScreenReaderEnabled) {
        return paint(tuiRoot);
      }
      const linear = renderScreenReaderOutput(tuiRoot, { skipStaticElements: true });
      return wrapAnsi(linear, width, { trim: false, hard: true });
    }

    function commit() {
      const start = onRender ? performance.now() : 0;

      // Detect <Static> identity changes (mount, unmount, key-driven remount).
      // Fire onStaticChange BEFORE flushing static output so accumulated
      // fullStaticOutput from a previous instance is cleared first.
      if (tuiRoot.staticNode !== tuiRoot.previousStaticNode) {
        tuiRoot.previousStaticNode = tuiRoot.staticNode;
        if (typeof tuiRoot.onStaticChange === "function") {
          tuiRoot.onStaticChange();
        }
      }

      // Capture static output as a string (for both interactive and non-interactive paths)
      // Use resolveSize to handle 0-columns case from non-TTY stdout (Ink parity G12).
      const w = resolveSize(stdout).columns;
      let staticOutput = "";
      for (const stat of findStatics(tuiRoot)) {
        const staticFrame = paintStaticNode(stat, w, isScreenReaderEnabled);
        if (staticFrame.length > 0) {
          staticOutput += staticFrame + "\n";
        }
      }
      const hasStaticOutput = staticOutput !== "" && staticOutput !== "\n";
      // fullStaticOutput is the accumulated <Static> history. Mirror Ink's three
      // onRender branches: it accumulates in the DEBUG branch (ink.tsx:550-553)
      // and the normal-interactive branch (ink.tsx:626-628), but NOT in the
      // dedicated interactive screen-reader branch (ink.tsx:573-625), which
      // writes static inline + never clears + never replays history. So we must
      // accumulate ALWAYS in debug (so the debug writeToStdout/writeToStderr
      // replay of `fullStaticOutput + lastOutput` still includes static history,
      // regardless of SR), and otherwise only when NOT in the interactive SR
      // path. The SR exclusion is non-debug only: accumulating for interactive SR
      // would also make a later non-SR remount on the same stream replay stale
      // history (the original G59 motivation).
      if (hasStaticOutput && (debug || !isScreenReaderEnabled)) {
        frameState.fullStaticOutput += staticOutput;
      }

      if (!interactive && !debug) {
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
          emitLayoutListeners(tuiRoot);
          const frame = renderFrame(w);
          frameState.lastOutput = frame;
          frameState.lastOutputToRender = frame + "\n";
          frameState.outputHeight = frame === "" ? 0 : frame.split("\n").length;
          if (onRender) onRender({ renderTime: performance.now() - start });
          if (hasStaticOutput) {
            stdout.write(staticOutput);
          }
        } finally {
          restoreLayoutGuards();
        }
        return;
      }

      tuiRoot.yoga.setWidth(w);
      const restoreLayoutGuards = calculateLayoutWithContentGuards(
        tuiRoot,
        w,
        undefined,
        Yoga.DIRECTION_LTR,
      );
      try {
        emitLayoutListeners(tuiRoot);
        const frame = renderFrame(w);
        const outputHeight = frame === "" ? 0 : frame.split("\n").length;

        if (debug) {
          // Debug mode mirrors Ink's onRender debug branch (ink.tsx:550-558): its
          // contract is "every update rendered as a separate, FULL output". Ink
          // writes `this.fullStaticOutput + output` UNCONDITIONALLY on every render
          // — the ENTIRE accumulated <Static> history (not just this commit's delta)
          // prepended to the current dynamic frame, with NO equality short-circuit.
          // Two fixes vs the old behavior, BOTH scoped to this debug branch only:
          //   (a) re-emit the FULL accumulated history (frameState.fullStaticOutput,
          //       accumulated at line 847-849) on every render, not just this
          //       commit's static delta — Ink re-prints all static every render; and
          //   (b) write straight to stdout, bypassing the FrameWriter, whose
          //       `frame === lastFrame` dedup would swallow a byte-identical debug
          //       rerender that Ink still emits.
          // The static history and dynamic frame are written as two consecutive
          // stdout.write calls: the byte stream reaching the terminal is identical
          // to Ink's single `fullStaticOutput + output` write (stdout.write inserts
          // no separator), while keeping the dynamic frame its own chunk so the
          // @vue-tui/testing render() helper can still split frames (its `lastFrame`
          // is the dynamic frame, `frames` distinguishes static from dynamic).
          // The non-debug interactive path below is untouched — it keeps the
          // per-commit static delta and the FrameWriter dedup (the correct,
          // efficient live-render behavior).
          if (frameState.fullStaticOutput !== "") {
            stdout.write(frameState.fullStaticOutput);
            // Forward the static-history chunk to the test-only frame sink in the
            // SAME order it reaches stdout (static first, dynamic next), with the
            // EXACT value written — so the testing helper's frames[] reproduce
            // today's content faithfully, minus the escapes (which only go to
            // stdout). No-op when no sink is registered (normal runs).
            //
            // Gate on !teardownStarted: the final mountedCommit() in teardown()
            // (every teardown route — unmount/cleanup/exit/Ctrl+C/signal/
            // process.exit — sets teardownStarted=true before re-emitting) is a
            // stdout byte-parity FLUSH, not a render, so it must keep writing to
            // stdout but must NOT push a spurious entry into the live frames[].
            if (!teardownStarted) frameSink?.(frameState.fullStaticOutput);
          }
          frameState.lastOutput = frame;
          frameState.lastOutputToRender = frame;
          frameState.outputHeight = outputHeight;
          if (onRender) onRender({ renderTime: performance.now() - start });
          // Ink writes `fullStaticOutput + output` with NO trailing newline
          // (ink.tsx:558; `output` is \n-joined and returned WITHOUT a trailing
          // \n — output.ts:305-312). Writing `frame` (not `frame + "\n"`) makes
          // the concatenation of these two stdout.write calls byte-identical to
          // Ink's single write.
          stdout.write(frame);
          // Forward the dynamic frame to the sink (mirrors the always-run
          // stdout.write above). lastFrame() is the most recent dynamic frame; an
          // empty render forwards "" so lastFrame() reads back "" (Ink-faithful).
          // Same teardown gate as the static chunk above: the teardown re-emit
          // flushes to stdout for byte parity but is not a render, so it must not
          // append a duplicate of the final frame to the live frames[].
          if (!teardownStarted) frameSink?.(frame);
          return;
        }

        if (isScreenReaderEnabled) {
          // Dedicated screen-reader write path (Ink parity G59), mirroring Ink's
          // onRender SR branch (ink.tsx:573-625). It writes the transcript with a
          // RAW stdout.write using manual ansiEscapes.eraseLines(previousHeight) +
          // (inline static, if any) + the wrapped output, then RETURNS — before the
          // normal interactive frame path. Crucially it:
          //   - NEVER calls shouldClearTerminalForFrame / emits clearTerminal, so a
          //     tall/overflowing SR transcript does not wipe the user's scrollback;
          //   - NEVER accumulates or replays fullStaticOutput (gated above);
          //   - NEVER routes through the log-update writer (raw writes only);
          //   - leaves the cursor visible (the mount-time hide is skipped for SR).
          // `frame` is already the wrapped SR output (renderFrame -> wrapAnsi), so
          // it plays the role of Ink's `wrappedOutput`.
          const sync = synchronize;
          if (onRender) onRender({ renderTime: performance.now() - start });
          if (sync) stdout.write(bsu);

          if (hasStaticOutput) {
            // Erase the previous main output before writing new static output
            // (ink.tsx:579-588), then reset the tracked height to 0.
            const erase =
              frameState.outputHeight > 0 ? ansiEscapes.eraseLines(frameState.outputHeight) : "";
            stdout.write(erase + staticOutput);
            frameState.outputHeight = 0;
          }

          if (frame === frameState.lastOutput && !hasStaticOutput) {
            // Unchanged frame and no new static: nothing to write (ink.tsx:590-596).
            if (sync) stdout.write(esu);
            return;
          }

          if (hasStaticOutput) {
            // Already erased above; write the wrapped output directly.
            stdout.write(frame);
          } else {
            const erase =
              frameState.outputHeight > 0 ? ansiEscapes.eraseLines(frameState.outputHeight) : "";
            stdout.write(erase + frame);
          }

          // Match Ink: lastOutputToRender = wrappedOutput (NO appended "\n" in ANY
          // case — empty frame => 0 lines, multi-line frame keeps its true count so
          // the next-frame erase is eraseLines(N), not eraseLines(N+1)).
          frameState.lastOutput = frame;
          frameState.lastOutputToRender = frame;
          frameState.outputHeight = frame === "" ? 0 : frame.split("\n").length;

          if (sync) stdout.write(esu);
          return;
        }

        // Interactive path
        if (onRender) onRender({ renderTime: performance.now() - start });
        renderInteractiveFrame(frame, outputHeight, hasStaticOutput ? staticOutput : "");
      } finally {
        restoreLayoutGuards();
      }
    }

    // A single render-throttle window derived from maxFps drives BOTH the
    // commit scheduler and the animation scheduler, mirroring Ink where one
    // `renderThrottleMs` (from `maxFps ?? 30`) throttles renders and is handed
    // to useAnimation (ink.tsx:337-344, 650). Debug / screen-reader paths and
    // non-positive maxFps are unthrottled (0 = commit every tick), matching
    // Ink's `unthrottled` gate.
    const unthrottled = debug || isScreenReaderEnabled;
    const renderThrottleMs = !unthrottled && maxFps > 0 ? Math.max(1, Math.ceil(1000 / maxFps)) : 0;

    // Unthrottled (debug / screen-reader) commits fire every tick, so the
    // throttle window is unused there — renderThrottleMs is already 0. Otherwise
    // it's the maxFps-derived window (34ms at the default maxFps=30).
    const scheduler = createCommitScheduler(commit, {
      immediate: unthrottled,
      throttleMs: renderThrottleMs,
    });
    mountedScheduler = scheduler;
    mountedCommit = commit;
    scheduledCommit = scheduler.schedule;

    // Internal provides — set before the actual mount so components can inject
    // them. User .use/.provide calls made earlier on the chain stay intact;
    // our keys are Symbols so there's no collision risk.
    baseApp.provide(AppContextKey, appContext);
    baseApp.provide(FocusContextKey, focusContext);
    baseApp.provide(StdinContextKey, stdinController);
    // useAnimation coalesces ticks within this same window so committed deltas
    // accumulate to the real wall-clock elapsed time (the value committed to
    // stdout), rather than a single scheduler interval. It shares the exact
    // renderThrottleMs the commit scheduler uses, so the animation cadence
    // tracks the actual commit cadence (Ink ink.tsx:650).
    const animationScheduler = createAnimationScheduler(renderThrottleMs);
    mountedAnimationScheduler = animationScheduler;
    baseApp.provide(AnimationSchedulerKey, animationScheduler);
    if (typeof __VUE_TUI_DEV__ !== "undefined" && __VUE_TUI_DEV__) {
      baseApp.provide(DevStateKey, devState);
    }

    // Wire exit-with-error for the error boundary (must be set before mount).
    exitWithError = (e: Error) => appContext.exit(e);

    // Alternate screen: enter BEFORE rendering starts (matching Ink ink.tsx:428).
    // Requires alternateScreen option + interactive + isTTY.
    const alternateScreen =
      Boolean(options.alternateScreen) && interactive && Boolean(stdout.isTTY);
    if (alternateScreen) {
      writeBestEffort(stdout, ansiEscapes.enterAlternativeScreen);
      writeBestEffort(stdout, "\x1b[?25l");
    }
    mountedAlternateScreen = alternateScreen;

    // Patch console.log/warn/error etc. to route through writeToStdout /
    // writeToStderr so console output doesn't corrupt the rendered frame.
    // Installed BEFORE originalMount (matching Ink, which patches in its
    // constructor before the first render — ink.tsx:435-436): a dev-only
    // [Vue warn] emitted DURING the initial mount (e.g. the missing-render-
    // function warn when the root's setup() throws) must hit the filter too.
    // The mount-throw catch below runs teardown(), which restores the console,
    // so a synchronous mount failure cannot leak a patched console.
    // Disabled in debug mode (matching Ink).
    if (options.patchConsole !== false && !debug) {
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
    // cursor escapes — the cursor stays visible — while a non-empty / useCursor
    // app hides on its first render via the same lazy path. The renderInteractive
    // commit gate below mirrors that `output !== frameState.lastOutput` outer
    // condition so the empty-frame skip (and thus the no-hide behavior) holds.
    //
    // Ordering for a useCursor app is preserved without an eager hide: log-update
    // hides-then-shows WITHIN a single render() (it hides at the top, then emits
    // the showCursor + cursorTo suffix for the active position), so the last
    // visibility change on the first frame is the SHOW — exactly Ink's ordering.
    //
    // Screen-reader mode leaves the cursor VISIBLE (Ink parity G59): its
    // dedicated write branch never routes through log-update, so no hide. The
    // only mount-time hide that remains is the alt-screen one above
    // (setAlternateScreen, alt-screen + isTTY gated), mirroring Ink.

    // The cursor (and alternate screen) have already been hidden/entered above,
    // but the process-exit and signal-exit teardown handlers are not wired until
    // after originalMount returns (the resize handler below needs `writer`). If
    // originalMount throws SYNCHRONOUSLY in a way the onErrorCaptured boundary
    // can't catch — a renderer/patch-level vnode error (e.g. a vnode whose
    // `type` getter throws) — nothing would ever restore the cursor and the
    // terminal would be left permanently invisible. Ink avoids this by wiring
    // signalExit(this.unmount) in its CONSTRUCTOR (ink.tsx:426), before any
    // hide/render. We get the same "teardown wired before hide" guarantee by
    // running teardown() (which shows the cursor, leaves the alt screen and
    // cleans up — idempotent) before rethrowing. The success path is unchanged:
    // teardown only runs on a throw, so the last visibility change on a normal
    // mount is still the SHOW emitted by the first commit.
    let proxy: ComponentPublicInstance;
    try {
      proxy = originalMount(tuiRoot) as unknown as ComponentPublicInstance;
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

    // Only listen for resize in interactive mode (matching Ink).
    // Render synchronously on resize rather than through the commit throttle:
    // a resize is a discrete event that changes the viewport, and Ink's
    // resized() handler calls onRender() directly. Deferring it through the
    // ~32ms throttle can leave stale/overlapping content on screen for a frame
    // and makes the clearTerminal-on-overflow behavior depend on wall-clock
    // timing rather than the resize itself.
    if (interactive) {
      // Track last known terminal width so we can detect narrowing on resize
      // (Ink parity G11: ink.tsx:302 declares lastTerminalWidth, ink.tsx:402
      // initializes it in the constructor).
      let lastTerminalWidth = resolveSize(stdout).columns;

      const onResize = () => {
        // Cancel any pending trailing commit before painting synchronously.
        // Otherwise the throttle timer fires a second doCommit() right after
        // this paint, and because shouldClearTerminalForFrame clears whenever
        // the previous frame overflowed, that second commit emits a duplicate
        // clearTerminal (issue #26). The synchronous commit below already
        // reflects the current tree, so the pending commit is redundant.
        scheduler.cancel();

        // Ink parity G11 (ink.tsx:459-474): when the terminal NARROWS, clear
        // the screen and reset frame state before repainting. Without this,
        // the previous wider frame and the new narrower frame can overlap and
        // produce duplicate/corrupted output. Width increase and pure height
        // changes do not trigger this path — only genuine narrowing does.
        const currentWidth = resolveSize(stdout).columns;
        if (currentWidth < lastTerminalWidth) {
          writer.clear();
          // Reset last-output strings so commit() repaints from scratch
          // (no stale diff), but preserve outputHeight — Ink ink.tsx:462-466
          // also leaves lastOutputHeight intact so shouldClearTerminalForFrame
          // still sees a non-zero previousOutputHeight and can fire the
          // clearTerminal path for overflowing frames on the resize commit.
          frameState.lastOutput = "";
          frameState.lastOutputToRender = "";
        }
        lastTerminalWidth = currentWidth;

        commit();
      };
      stdout.on("resize", onResize);
      mountedResizeHandler = onResize;
    }

    // Auto-cleanup on process exit (process.exit, event-loop drain, uncaught
    // exception — anything that fires Node's 'exit' event). teardown() is
    // sync and idempotent, safe to call from this hook. If the user already
    // called unmount() / exit() (via useApp()), this is a no-op.
    const exitListener = () => teardown();
    process.on("exit", exitListener);
    mountedExitListener = exitListener;

    // Signal-based teardown (Ink parity G18, ink.tsx:426). On SIGINT/SIGTERM/
    // SIGHUP signal-exit runs this callback BEFORE the process dies, so
    // teardown() restores the cursor, leaves the alternate screen, disables
    // kitty keyboard, flushes the final frame and restores raw mode — the
    // terminal isn't left corrupted. We do NOT return true / prevent exit
    // (mirroring Ink's {alwaysLast:false}): signal-exit lets the signal
    // proceed after the callback. teardown() is idempotent (teardownStarted
    // guard), so a signal-triggered teardown plus a later unmount() won't
    // double-run. Every interactive mount registers — including debug mode,
    // which still enters the alternate screen and hides the cursor (above), so
    // a debug-but-interactive app must restore on signal too (Ink registers
    // signal-exit unconditionally, ink.tsx:426, and allows alt-screen in
    // debug). Only render-to-string / non-interactive paths stay out, since
    // they have no cursor/alt-screen to restore and must not touch process
    // signal handlers. `!mountedUnsubscribeExit` guards against double-register
    // on a no-op second mount; `!teardownStarted` keeps a spent (already
    // torn-down) app instance from re-registering on a same-instance remount,
    // which would otherwise leak — the next unmount() returns early at the
    // teardownStarted guard before it could unsubscribe.
    if (interactive && !mountedUnsubscribeExit && !teardownStarted) {
      // sync=true: signal-exit re-raises the signal right after this callback
      // returns, so the restore escapes must be flushed to the fd
      // synchronously (Finding A) — a buffered async write can be lost.
      mountedUnsubscribeExit = onExit(() => teardown(true), { alwaysLast: false });
    }

    return proxy;
  };

  app.unmount = function unmount(): void {
    teardown();
    resolveExit();
  };

  app.waitUntilExit = function waitUntilExit(): Promise<unknown> {
    if (!mountedBeforeExitHandler) {
      mountedBeforeExitHandler = () => {
        app.unmount();
      };
      process.once("beforeExit", mountedBeforeExitHandler);
    }
    return exitPromise;
  };

  // Hoisted so the injected appContext (built inside mount()) can expose the
  // SAME implementation via useApp().waitUntilRenderFlush — both the
  // TuiApp handle and the in-tree composable resolve identically.
  async function waitUntilRenderFlush(): Promise<void> {
    const stream = (mountedAppContext?.stdout ?? process.stdout) as MaybeWritableStream;
    const { canWriteToStdout, hasWritableState } = getWritableStreamState(stream);

    // Flush any pending OR scheduled render. Gating on hasPending() alone
    // misses the window after schedule() queues a commit but before the
    // post-flush callback sets hasPendingFlag, letting this resolve early.
    // When stdout cannot be written, match Ink's settleThrottle behavior:
    // cancel instead of flushing so delayed callbacks cannot write later.
    if (mountedScheduler) {
      if (canWriteToStdout) {
        await mountedScheduler.flush();
      } else {
        mountedScheduler.cancel();
      }
    }
    // Wait for stdout write barrier — ensures the written frame is
    // flushed to the underlying stream.
    await new Promise<void>((resolve) => {
      if (!canWriteToStdout || !hasWritableState) {
        setImmediate(resolve);
        return;
      }
      // PassThrough (test fakes) may not support the write callback form;
      // fall back to setImmediate so we still yield the event loop.
      try {
        stream.write("", () => resolve());
      } catch {
        setImmediate(resolve);
      }
    });
  }
  app.waitUntilRenderFlush = waitUntilRenderFlush;

  app.clear = function clear(): void {
    mountedClear?.();
  };

  return app;
}

// --- Focus controller ----------------------------------------------------

interface Focusable {
  readonly id: string;
  isActive: boolean;
}

function createFocusController(): FocusContext {
  const focusables: Focusable[] = [];
  const subs = new Map<string, Set<(focused: boolean) => void>>();
  let activeFocusable: Focusable | null = null;
  let activeId: string | null = null;
  const activeIdRef = shallowRef<string | null>(null);

  function notify(id: string, focused: boolean) {
    subs.get(id)?.forEach((fn) => fn(focused));
  }

  function setActiveFocusable(next: Focusable | null) {
    if (next !== null && !focusables.includes(next)) {
      next = null;
    }
    if (activeFocusable === next) return;

    const prev = activeId;
    activeFocusable = next;
    const nextId = next?.id ?? null;

    if (prev === nextId) return;

    activeId = nextId;
    ctx.activeId = activeId;
    activeIdRef.value = activeId;
    if (prev) notify(prev, false);
    if (nextId) notify(nextId, true);
  }

  function findNextActive(startIdx: number, direction: 1 | -1): Focusable | null {
    const len = focusables.length;
    for (let i = 0; i < len; i++) {
      const idx = (startIdx + direction * (i + 1) + len * len) % len;
      if (focusables[idx]!.isActive) return focusables[idx]!;
    }
    return null;
  }

  // The start index a directional search begins FROM (it scans from the next slot
  // in `direction`). With duplicate ids, public `activeId` is not enough to know
  // which registry entry the user is leaving, so we track the active entry object
  // internally and only expose its id. With no current focus we begin just outside
  // the end we're moving away from, so the first candidate is the first focusable
  // (forward) or the last (backward) — symmetric for both directions.
  function startSearchIndex(direction: 1 | -1): number {
    if (activeFocusable) {
      const i = focusables.indexOf(activeFocusable);
      if (i >= 0) return i;
    }
    if (activeId) {
      const i = focusables.findIndex((f) => f.id === activeId);
      if (i >= 0) return i;
    }
    return direction === 1 ? -1 : focusables.length;
  }

  const ctx: FocusContext = {
    activeId: null,
    activeIdRef,
    enabled: true,
    enableFocus() {
      ctx.enabled = true;
    },
    disableFocus() {
      ctx.enabled = false;
    },
    // Ink parity (App.tsx focusNext/focusPrevious): NO isFocusEnabled guard here —
    // a programmatic focusNext()/focusPrevious() moves focus even while focus is
    // disabled. The isFocusEnabled check lives only in the Tab/Shift-Tab handler
    // (see focusInputListener). The focusables.length === 0 short-circuit stays so
    // focusing on an empty tree is a harmless no-op; with 0 focusables activeId is
    // already null (remove() clears it), matching Ink (findNextFocusable and
    // firstFocusableId both undefined → activeFocusId undefined), and it also avoids
    // the `% 0` NaN in findNextActive.
    //
    // Ink (App.tsx:455-470 / 472-487): focusNext = `findNextFocusable(...) ??
    // firstFocusableId` and ALWAYS reassigns activeFocusId. findNextActive already
    // wraps to the first active (or null if none), so it's equivalent to Ink's
    // `next ?? first` — including the clear-to-null case when NO focusable is active.
    // We must call setActiveFocusable UNCONDITIONALLY: a null result clears a stale activeId
    // (e.g. left by focus(id) pinning an isActive=false item), matching Ink.
    focusNext() {
      if (focusables.length === 0) return;
      setActiveFocusable(findNextActive(startSearchIndex(1), 1));
    },
    focusPrevious() {
      if (focusables.length === 0) return;
      setActiveFocusable(findNextActive(startSearchIndex(-1), -1));
    },
    focus(id) {
      const entry = focusables.find((f) => f.id === id);
      if (entry) setActiveFocusable(entry);
    },
    blur() {
      setActiveFocusable(null);
    },
    // Ink treats focus ids as registration entries, not unique keys: duplicate
    // explicit ids are user-created ambiguity, but they still participate in
    // focus order. Matching that means add pushes every registration, while
    // remove/activate/deactivate affect every entry with the same id.
    add(id, options) {
      const entry: Focusable = { id, isActive: true };
      focusables.push(entry);
      if (options.autoFocus && activeFocusable == null) {
        setActiveFocusable(entry);
      }
    },
    remove(id) {
      const removingActive = activeFocusable?.id === id;
      for (let i = focusables.length - 1; i >= 0; i--) {
        if (focusables[i]!.id === id) focusables.splice(i, 1);
      }
      if (removingActive) setActiveFocusable(null);
    },
    activate(id) {
      for (const entry of focusables) {
        if (entry.id === id) entry.isActive = true;
      }
    },
    deactivate(id) {
      let changed = false;
      for (const entry of focusables) {
        if (entry.id === id) {
          entry.isActive = false;
          changed = true;
        }
      }
      if (changed && activeFocusable?.id === id) {
        setActiveFocusable(null);
      }
    },
    subscribe(id, fn) {
      let set = subs.get(id);
      if (!set) {
        set = new Set();
        subs.set(id, set);
      }
      set.add(fn);
      return () => set!.delete(fn);
    },
  };

  return ctx;
}

// --- Stdin controller ----------------------------------------------------

interface StdinController extends StdinContext {
  dispose: () => void;
  // rawMode 'always': take a lifetime raw-mode hold (raw on + keep-alive + input
  // listener) that input composables stack on top of, with the per-consumer
  // input-state cleanup re-based to this floor.
  holdRawModeForLifetime: () => void;
}

interface RawModeState {
  refs: number;
  // True between a last-release (refs→0) and the microtask that actually disables
  // raw mode. A same-tick re-acquire reads this to know raw mode is still
  // physically on, so it can skip re-issuing ref()/setRawMode(true) and cancel the
  // queued disable — Ink's pendingDisableRawModeRef (App.tsx:335-336,361-368).
  pendingDisable: boolean;
}
const rawModeRegistry = new WeakMap<NodeJS.ReadStream, RawModeState>();

function getRawModeState(stdin: NodeJS.ReadStream): RawModeState {
  let state = rawModeRegistry.get(stdin);
  if (!state) {
    state = { refs: 0, pendingDisable: false };
    rawModeRegistry.set(stdin, state);
  }
  return state;
}

interface CreateStdinControllerOptions {
  exitOnCtrlC: boolean;
  appCtx: AppContext;
  focusContext: FocusContext;
}

function createStdinController(
  stdin: NodeJS.ReadStream,
  opts: CreateStdinControllerOptions,
): StdinController {
  const { appCtx, focusContext } = opts;
  const emitter = new EventEmitter();
  emitter.setMaxListeners(Infinity);
  const inputParser = createInputParser();
  let pendingFlushTimer: ReturnType<typeof setTimeout> | undefined;
  const FLUSH_DELAY = 20; // ms, matching Ink
  let bracketedPasteModeCount = 0;

  // Write the bracketed-paste-disable escape only when stdout can still take it.
  // `isTTY` stays cached-truthy after a stream is destroy()ed/end()ed, so gating
  // the paste-OFF write on isTTY alone throws ERR_STREAM_DESTROYED on a teardown
  // where stdout is already gone. Mirror Ink's `canWriteToStdout` guard
  // (App.tsx:620/633-635): isTTY AND `!destroyed && !writableEnded`. Matches the
  // render-level writeBestEffort helper, which isn't in this function's scope.
  function disableBracketedPaste() {
    const stdout = appCtx.stdout;
    if (!stdout.isTTY || stdout.destroyed || stdout.writableEnded) return;
    stdout.write("\x1b[?2004l");
  }

  function clearPendingFlush() {
    if (pendingFlushTimer !== undefined) {
      clearTimeout(pendingFlushTimer);
      pendingFlushTimer = undefined;
    }
  }

  function emitInput(input: string) {
    // exitOnCtrlC: intercept Ctrl+C here — at the always-on stdin controller,
    // BEFORE dispatching to any listener — so the app exits no matter which
    // composable holds raw mode (useInput / useFocus / usePaste, or none), and
    // there's a single source of truth (useInput no longer carries its own
    // copy). Legacy Ctrl+C is the bare \x03 byte; the kitty keyboard protocol
    // encodes it as a CSI-u sequence (\x1b[99;5u). Fast-path the \x03 byte and
    // parse only escape-prefixed sequences, so ordinary keystrokes aren't parsed
    // here just to be parsed again in useInput. (Ink only checks \x03 and so
    // never exits under kitty; see .agents/docs/ink-divergences.md.)
    if (opts.exitOnCtrlC) {
      if (input === "\x03") {
        appCtx.exit();
        return;
      }
      // Only an escape sequence can be a kitty-encoded Ctrl+C. `!key.shift`
      // keeps Ctrl+Shift+C (kitty \x1b[67;6u, a distinct "copy" combo) from
      // being read as Ctrl+C — the kitty parser lowercases `name` to "c", so
      // shift is the only signal. (Legacy can't disambiguate the two: both send
      // \x03 above, so legacy Ctrl+Shift+C still exits, as it always has.)
      if (input.charCodeAt(0) === 0x1b) {
        const key = parseKeypress(input);
        if (key.name === "c" && key.ctrl && !key.shift && key.eventType !== "release") {
          appCtx.exit();
          return;
        }
      }
    }
    // Esc resets focus when focus is enabled
    if (input === "\x1b" && focusContext.enabled) {
      focusContext.blur();
    }
    emitter.emit("input", input);
  }

  function schedulePendingFlush() {
    clearPendingFlush();
    pendingFlushTimer = setTimeout(() => {
      pendingFlushTimer = undefined;
      const pending = inputParser.flushPendingEscape();
      if (pending) emitInput(pending);
    }, FLUSH_DELAY);
  }

  // Use 'readable' event + stdin.read() loop instead of 'data'
  function handleReadable() {
    clearPendingFlush();
    let chunk: string | null;
    while ((chunk = stdin.read() as string | null) !== null) {
      const events: InputEvent[] = inputParser.push(
        typeof chunk === "string" ? chunk : String(chunk),
      );
      for (const event of events) {
        if (typeof event === "string") {
          emitInput(event);
        } else {
          // Paste event: if paste listeners exist, emit there; else fall through to input
          if (emitter.listenerCount("paste") > 0) {
            emitter.emit("paste", event.paste);
          } else {
            emitInput(event.paste);
          }
        }
      }
    }
    if (inputParser.hasPendingEscape()) {
      schedulePendingFlush();
    }
  }

  // Also handle "data" events for compatibility with test fake stdin streams
  // that emit "data" directly (PassThrough streams in non-flowing mode don't
  // fire "readable" when data is pushed via emit).
  function handleData(chunk: Buffer | string) {
    clearPendingFlush();
    const data = typeof chunk === "string" ? chunk : chunk.toString();
    const events: InputEvent[] = inputParser.push(data);
    for (const event of events) {
      if (typeof event === "string") {
        emitInput(event);
      } else {
        if (emitter.listenerCount("paste") > 0) {
          emitter.emit("paste", event.paste);
        } else {
          emitInput(event.paste);
        }
      }
    }
    if (inputParser.hasPendingEscape()) {
      schedulePendingFlush();
    }
  }

  // Focus Tab / Shift+Tab navigation (Esc blur handled in emitInput)
  const focusInputListener = (data: string) => {
    // Ink parity (handleTabNavigation): Tab/Shift-Tab navigation is gated by the
    // focus-enabled flag here — disableFocus() makes Tab a no-op, but a
    // programmatic focusNext()/focusPrevious() still works (see createFocusController).
    if (!focusContext.enabled) return;
    if (data === "\t") focusContext.focusNext();
    else if (data === "\x1b[Z") focusContext.focusPrevious();
  };
  emitter.on("input", focusInputListener);

  let localRefs = 0;
  // 0 normally; 1 once the App takes a lifetime raw-mode hold (rawMode 'always').
  // The hold keeps raw mode + the data listener alive for the whole run, so the
  // per-consumer "clear input state" must fire when localRefs returns to THIS
  // floor (last input composable gone), not 0 — otherwise a buffered partial
  // escape would survive into the next composable.
  let lifetimeFloor = 0;

  // Match Ink's handleSetRawMode (App.tsx): raw mode on an unsupported stdin
  // throws a descriptive error rather than silently no-opping. Two messages —
  // one for the default process.stdin, one for a custom stream — both pointing
  // at the isRawModeSupported docs.
  const throwRawModeUnsupported = (): never => {
    if (stdin === process.stdin) {
      throw new Error(
        "Raw mode is not supported on the current process.stdin, which Vue TUI uses as input stream by default.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported",
      );
    }
    throw new Error(
      "Raw mode is not supported on the stdin provided to Vue TUI.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported",
    );
  };

  const controller: StdinController = {
    stdin,
    setRawMode(mode: boolean) {
      // Guard at the TOP — BEFORE the enable/disable split — so the PUBLIC
      // useStdin().setRawMode throws symmetrically on an unsupported stdin,
      // matching Ink's handleSetRawMode (App.tsx:317-327): both setRawMode(true)
      // and setRawMode(false) throw. The guard lives here (not in the internal
      // releaseRawMode) because the framework's own composables — useInput /
      // useFocus / usePaste — call acquireRawMode()/releaseRawMode() DIRECTLY at
      // teardown, and that internal release MUST stay a no-op so an unsupported-
      // stdin app can unmount cleanly. Only this public wrapper enforces the
      // symmetric throw. (acquireRawMode also throws on its own, so the enable
      // path is unchanged for the unguarded useInput consumer.)
      if (!appCtx.isRawModeSupported) throwRawModeUnsupported();
      if (mode) {
        controller.acquireRawMode();
      } else {
        controller.releaseRawMode();
      }
    },
    isRawModeSupported: appCtx.isRawModeSupported,
    internal_eventEmitter: emitter,
    internal_exitOnCtrlC: opts.exitOnCtrlC,
    acquireRawMode() {
      if (!appCtx.isRawModeSupported) {
        // The unguarded useInput path surfaces this throw directly; useFocus
        // guards before calling (see composables/useFocus.ts), so it degrades to
        // a no-op like Ink.
        throwRawModeUnsupported();
      }
      const state = getRawModeState(stdin);
      if (state.refs === 0) {
        // SHARED (per-stdin) terminal raw-mode enable. If a same-tick swap left
        // raw mode physically enabled (its disable is still queued), don't re-ref
        // or re-toggle — just cancel the pending disable. Ink (App.tsx:331-344)
        // skips stdin.ref()/setRawMode(true) when isRawModeAlreadyEnabled;
        // re-issuing them is a redundant ioctl AND an unbalanced ref() (the
        // deferred disable would bail on refs>0 and never unref). setEncoding is
        // idempotent so it stays here.
        const alreadyEnabled = state.pendingDisable;
        state.pendingDisable = false;
        if (!alreadyEnabled) {
          if (typeof stdin.ref === "function") stdin.ref();
          appCtx.setRawMode(true);
        }
        if (typeof (stdin as any).setEncoding === "function") (stdin as any).setEncoding("utf8");
      }
      if (localRefs === 0) {
        // PER-CONTROLLER input listener. Each controller (one per render tree)
        // attaches its OWN handleData → its OWN parser → its OWN event emitter,
        // gated on THIS controller's ref count, NOT the shared one. So two apps
        // sharing one stdin both receive every keystroke: vue's 'data' (push)
        // event broadcasts to every listener — unlike Ink's 'readable' (pull)
        // model where the first-registered listener drains the buffer and a
        // second same-stdin app stays deaf until the first unmounts
        // (App.tsx:278-313). The terminal raw-mode toggle above stays shared so
        // one app's unmount can't drop raw mode while another still needs it.
        stdin.on("data", handleData);
      }
      if (localRefs === lifetimeFloor) {
        // The FIRST input consumer joining above the App's lifetime floor (and
        // the very first acquire in 'auto', where the floor is 0). Under rawMode
        // 'always' the lifetime listener keeps parsing on no-input screens, so an
        // escape typed while idle leaves a buffered partial + pending-flush timer;
        // discard it here so it can't bleed into this consumer ~20ms later. (The
        // mirror clear on the last consumer's release handles a same-tick swap;
        // this handles a delayed idle→input transition.)
        inputParser.reset();
        clearPendingFlush();
      }
      state.refs++;
      localRefs++;
    },
    holdRawModeForLifetime() {
      // Same as acquireRawMode (raw on + ref + data listener), but marks the
      // resulting ref as the App's lifetime floor: input composables stack above
      // it, and releaseRawMode's input-state cleanup fires when the last consumer
      // returns localRefs to this floor (1) rather than 0. So raw mode and the
      // listener stay alive across no-input screens, but a buffered partial escape
      // is still cleared when an input composable unmounts — no bleed into the next.
      controller.acquireRawMode();
      lifetimeFloor = 1;
    },
    setBracketedPasteMode(enabled: boolean) {
      if (enabled) {
        if (bracketedPasteModeCount === 0 && appCtx.stdout.isTTY) {
          appCtx.stdout.write("\x1b[?2004h");
        }
        bracketedPasteModeCount++;
      } else {
        if (bracketedPasteModeCount === 0) return;
        bracketedPasteModeCount--;
        if (bracketedPasteModeCount === 0) {
          disableBracketedPaste();
        }
      }
    },
    releaseRawMode() {
      if (!appCtx.isRawModeSupported) return;
      if (localRefs === 0) return;
      const state = getRawModeState(stdin);
      state.refs = Math.max(0, state.refs - 1);
      localRefs = Math.max(0, localRefs - 1);
      if (localRefs === lifetimeFloor) {
        // PER-CONSUMER: the last input composable on THIS controller released.
        // Clear pending parser state SYNCHRONOUSLY (Ink's clearInputState,
        // App.tsx:212-216,357): reset the parser and cancel the pending-escape
        // flush, so a partial escape (e.g. a lone ESC during a screen swap) can't
        // bleed into the next composable. Re-based to `lifetimeFloor`: under rawMode
        // 'always' the App holds a floor ref (and keeps the listener), so this fires
        // when consumers return to 1, not 0.
        inputParser.reset();
        clearPendingFlush();
      }
      if (localRefs === 0) {
        // CONTROLLER fully released (no App hold, no consumers): detach the input
        // listeners too. Gated on localRefs, not the shared refcount, so another
        // app on the same stdin keeps its own listener intact.
        stdin.off("readable", handleReadable);
        stdin.off("data", handleData);
      }
      if (state.refs === 0) {
        // Defer ONLY the SHARED terminal raw-mode toggle (Ink defers just disableRawMode,
        // App.tsx:359-368): when components swap (v-if/key change), Vue unmounts
        // the old before mounting the new, so refs briefly hits 0. Disabling
        // synchronously would drop raw mode between the two mounts; the microtask
        // short-circuits if a replacement re-acquired in the meantime — which it
        // signals by clearing pendingDisable (matching Ink's flag, App.tsx:362-365).
        state.pendingDisable = true;
        queueMicrotask(() => {
          if (!state.pendingDisable) return;
          state.pendingDisable = false;
          // Unconditionally setRawMode(false) — Ink's disableRawMode (App.tsx:218-222)
          // never restores a captured prior raw state. Restoring a captured prevRaw was a
          // vue-only invention that corrupts on a sync re-acquire swap: it gets
          // re-snapshotted as true (raw still active via the deferred toggle), leaving
          // the terminal in raw mode after exit.
          appCtx.setRawMode(false);
          if (typeof stdin.unref === "function") stdin.unref();
        });
      }
    },
    dispose() {
      clearPendingFlush();
      stdin.off("readable", handleReadable);
      stdin.off("data", handleData);
      emitter.off("input", focusInputListener);
      if (bracketedPasteModeCount > 0) {
        disableBracketedPaste();
      }
      bracketedPasteModeCount = 0;
      if (appCtx.isRawModeSupported) {
        const state = getRawModeState(stdin);
        // Drop this controller's outstanding refs (if Vue's unmount hasn't already
        // released them via onScopeDispose → releaseRawMode).
        let releasedLastRef = false;
        if (localRefs > 0) {
          state.refs = Math.max(0, state.refs - localRefs);
          localRefs = 0;
          releasedLastRef = state.refs === 0;
        }
        // Force the terminal raw-mode disable SYNCHRONOUSLY when raw mode is no
        // longer owned. This covers BOTH teardown orderings:
        //   (1) dispose() ran while this controller still held refs (above), or
        //   (2) Vue's unmount already fired releaseRawMode (localRefs is 0) which
        //       DEFERRED the disable to a microtask — but on the signal-exit path
        //       (teardown(true) re-raises the signal without draining microtasks)
        //       that microtask never runs, so the terminal would be left raw and
        //       the shell stops echoing after Ctrl+C.
        // Mirrors Ink's unmount cleanup guard `rawModeEnabledCount > 0 ||
        // pendingDisableRawModeRef.current` (App.tsx:626-631). Clearing
        // pendingDisable also cancels the queued microtask so it can't double-unref.
        if (state.refs === 0 && (releasedLastRef || state.pendingDisable)) {
          // Unconditionally setRawMode(false) — Ink's disableRawMode (App.tsx:218-222)
          // never restores a captured prior raw state. (A restored prevRaw could be
          // the framework's own raw=true snapshotted during a sync swap, which would
          // leave the terminal raw on exit.)
          state.pendingDisable = false;
          appCtx.setRawMode(false);
          if (typeof stdin.unref === "function") stdin.unref();
          inputParser.reset();
        }
      }
    },
  };

  return controller;
}
