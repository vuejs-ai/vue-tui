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
import { attachYoga, detachYoga } from "./host/yoga.ts";
import { buildNodeOps } from "./host/node-ops.ts";
import { createCommitScheduler } from "./scheduler.ts";
import { createAnimationScheduler } from "./animation-scheduler.ts";
import { paint } from "./paint/paint.ts";
import { renderScreenReaderOutput } from "./paint/screen-reader.ts";
import { findStatics, paintStaticNode } from "./paint/static-channel.ts";
import { createFrameWriter } from "./io/frame-writer.ts";
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
import { ErrorOverview } from "./components/ErrorOverview.ts";
import { resolveSize } from "./composables/useTerminalSize.ts";

export interface MountOptions {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
  debug?: boolean;
  exitOnCtrlC?: boolean;
  rawMode?: boolean;
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
  // Tracks whether this app is the owner of the liveInstances entry for its
  // stdout. A second mount that hits the guard sets this to false so teardown()
  // does not evict the first app's entry.
  let mountedAsOwner = false;
  // Set to true when mount() hit the instance-reuse guard and returned early.
  // unmount()/teardown()/resolveExit() must be complete no-ops in that case —
  // they must not touch the owner's stream or WeakMap entry.
  let skippedMount = false;

  // The renderer's onCommit closure is wired at createApp time but only does
  // real work after mount swaps in scheduler.schedule. One renderer per app
  // even though it's not used until mount.
  let scheduledCommit: () => void = () => {};

  // Pending exit state — stored so resolveExit() can flush stdout before
  // settling the exit promise.
  let pendingExitError: unknown = undefined;
  let pendingExitResult: unknown = undefined;

  function resolveExit() {
    // Skipped mount: no stream was ever wired; resolve the exit promise directly
    // without any write-barrier so the owner's stdout is never touched.
    if (skippedMount) {
      if (pendingExitError instanceof Error) {
        exitReject(pendingExitError);
      } else {
        exitResolve(pendingExitResult);
      }
      return;
    }
    const stdout = mountedAppContext?.stdout ?? process.stdout;
    const canWrite = stdout && !stdout.destroyed && !(stdout as any).writableEnded;
    const hasWritableState = (stdout as any)._writableState !== undefined;

    const finish = () => {
      if (pendingExitError instanceof Error) {
        exitReject(pendingExitError);
      } else {
        exitResolve(pendingExitResult);
      }
    };

    if (canWrite && hasWritableState) {
      stdout.write("", () => finish());
    } else {
      setImmediate(() => finish());
    }
  }

  function writeBestEffort(stream: NodeJS.WriteStream, data: string, sync = false) {
    if (stream.destroyed || stream.writableEnded) return;
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
    // Skipped mount: this app never wired a renderer, so teardown is a
    // complete no-op — do not touch any stream or the owner's WeakMap entry.
    if (skippedMount) return;
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
    const stdoutWritable = stdout && !stdout.destroyed && !stdout.writableEnded;
    if (mountedInteractive && !mountedDebug && mountedCommit && stdoutWritable) {
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
    if (!mountedDebug && !mountedInteractive && mountedAppContext) {
      // Non-interactive: write the deferred last frame at unmount (matching Ink).
      const lastFrame = mountedGetLastOutput?.() ?? "";
      if (lastFrame) {
        writeBestEffort(mountedAppContext.stdout, lastFrame + "\n");
      }
    }
    if (mountedWriter && !mountedDebug && mountedInteractive) mountedWriter.done();
    if (mountedAlternateScreen && mountedAppContext) {
      writeBestEffort(mountedAppContext.stdout, ansiEscapes.exitAlternativeScreen, sync);
      writeBestEffort(mountedAppContext.stdout, "\x1b[?25h", sync);
      mountedAlternateScreen = false;
    } else if (!mountedDebug && mountedInteractive && mountedAppContext) {
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
      const error = shallowRef<Error | null>(null);

      onErrorCaptured((err) => {
        const e = err instanceof Error ? err : new Error(String(err));
        error.value = e;
        // Flush the ErrorOverview frame, then exit
        void nextTick(() => {
          exitWithError(e);
        });
        return false; // stop propagation
      });

      return () => {
        if (error.value) {
          return h(ErrorOverview, { error: error.value });
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

    // Instance-reuse guard (Ink parity G14): if a live Vue TUI instance is
    // already rendering to this stdout, warn on stderr and skip wiring a second
    // competing renderer. The second mount is a deliberate no-op: the caller
    // must unmount() the first app before mounting on the same stream.
    // We write the warning directly to native process.stderr so an existing
    // alternate-screen renderer cannot swallow it via patchConsole.
    if (liveInstances.has(stdout)) {
      process.stderr.write(
        "Warning: createApp()/mount() was called again for the same stdout before the previous Vue TUI instance was unmounted. Reusing stdout across multiple mount() calls is unsupported. Call unmount() first.\n",
      );
      // Mark this app as skipped so unmount()/teardown()/resolveExit() are
      // complete no-ops — they must never touch the owner's stream or WeakMap entry.
      skippedMount = true;
      return {} as ComponentPublicInstance;
    }

    // Register this app as the owner of the stdout entry.
    liveInstances.set(stdout, app);
    mountedAsOwner = true;
    const exitOnCtrlC = options.exitOnCtrlC ?? true;
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
      writer.write(frameState.lastOutputToRender ?? frameState.lastOutput + "\n");
    }

    function writeToStdout(data: string) {
      // Mirror Ink ink.tsx:673: return early after teardown so a late write
      // (e.g. a stray useStdout().write after unmount) cannot run
      // clear()/write/restore on an already-torn-down renderer.
      if (teardownStarted) return;
      if (debug) {
        stdout.write(data + frameState.fullStaticOutput + frameState.lastOutput);
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
        stdout.write(frameState.fullStaticOutput + frameState.lastOutput);
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
        if (errorOrResult instanceof Error) {
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
      } else if (synchronize && writer.willRender(outputToRender)) {
        // Only emit BSU/ESU when log-update will actually write, so unchanged
        // frames don't produce empty synchronized-update pairs.
        stdout.write(bsu);
        writer.write(outputToRender);
        stdout.write(esu);
      } else {
        writer.write(outputToRender);
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
        // Non-interactive: write static output immediately, defer dynamic frame.
        if (hasStaticOutput) {
          stdout.write(staticOutput);
        }

        tuiRoot.yoga.setWidth(w);
        tuiRoot.yoga.calculateLayout(w, undefined, Yoga.DIRECTION_LTR);
        emitLayoutListeners(tuiRoot);
        const frame = renderFrame(w);
        frameState.lastOutput = frame;
        frameState.lastOutputToRender = frame + "\n";
        frameState.outputHeight = frame === "" ? 0 : frame.split("\n").length;
        if (onRender) onRender({ renderTime: performance.now() - start });
        return;
      }

      tuiRoot.yoga.setWidth(w);
      tuiRoot.yoga.calculateLayout(w, undefined, Yoga.DIRECTION_LTR);
      emitLayoutListeners(tuiRoot);
      const frame = renderFrame(w);
      const outputHeight = frame === "" ? 0 : frame.split("\n").length;

      if (debug) {
        // Debug mode: write static output directly to stdout, then frame
        // through the frame writer (which appends "\n" in debug mode).
        // Clear the writer first so the frame is always emitted even when
        // the dynamic content is unchanged (static output was written above
        // as a separate chunk, so the test harness sees it separately).
        if (hasStaticOutput) {
          writer.clear();
          stdout.write(staticOutput);
        }
        frameState.lastOutput = frame;
        frameState.lastOutputToRender = frame;
        frameState.outputHeight = outputHeight;
        writer.write(frame);
        if (onRender) onRender({ renderTime: performance.now() - start });
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
          if (onRender) onRender({ renderTime: performance.now() - start });
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
        if (onRender) onRender({ renderTime: performance.now() - start });
        return;
      }

      // Interactive path
      renderInteractiveFrame(frame, outputHeight, hasStaticOutput ? staticOutput : "");
      if (onRender) onRender({ renderTime: performance.now() - start });
    }

    // A single render-throttle window derived from maxFps drives BOTH the
    // commit scheduler and the animation scheduler, mirroring Ink where one
    // `renderThrottleMs` (from `maxFps ?? 30`) throttles renders and is handed
    // to useAnimation (ink.tsx:337-344, 650). Debug / screen-reader paths and
    // non-positive maxFps are unthrottled (0 = commit every tick), matching
    // Ink's `unthrottled` gate.
    const unthrottled = debug || isScreenReaderEnabled;
    const renderThrottleMs = !unthrottled && maxFps > 0 ? Math.max(1, Math.ceil(1000 / maxFps)) : 0;

    const schedulerOptions: { immediate: boolean; throttleMs?: number } = {
      immediate: unthrottled,
    };
    if (!unthrottled) {
      schedulerOptions.throttleMs = renderThrottleMs;
    }
    const scheduler = createCommitScheduler(commit, schedulerOptions);
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

    const proxy = originalMount(tuiRoot) as unknown as ComponentPublicInstance;

    // errorHandler as fallback for errors that bypass onErrorCaptured (e.g.
    // async errors in Vue's internal scheduler). The error boundary returns
    // false to stop propagation, so caught errors won't reach here.
    baseApp.config.errorHandler = (err) => {
      appContext.exit(err instanceof Error ? err : new Error(String(err)));
    };

    // Hide cursor on mount (matching Ink). Only in interactive mode — in
    // debug/test mode or non-interactive the stream may not be a real TTY.
    // Screen-reader mode leaves the cursor VISIBLE (Ink parity G59): Ink's SR
    // path never hides the cursor (the dedicated SR write branch above does no
    // cursor management), so a screen-reader user keeps a real terminal cursor.
    if (!debug && interactive && !mountedAlternateScreen && !isScreenReaderEnabled) {
      stdout.write("\x1b[?25l");
    }

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

    // Patch console.log/warn/error etc. to route through writeToStdout /
    // writeToStderr so console output doesn't corrupt the rendered frame.
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
    // Flush any pending OR scheduled render. Gating on hasPending() alone
    // misses the window after schedule() queues a commit but before the
    // post-flush callback sets hasPendingFlag, letting this resolve early.
    // flush() resolves immediately when nothing is scheduled or pending, so
    // delegating unconditionally is safe and closes that window.
    if (mountedScheduler) {
      await mountedScheduler.flush();
    }
    // Wait for stdout write barrier — ensures the written frame is
    // flushed to the underlying stream.
    const stream = mountedAppContext?.stdout ?? process.stdout;
    await new Promise<void>((resolve) => {
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
  let activeId: string | null = null;
  const activeIdRef = shallowRef<string | null>(null);

  function notify(id: string, focused: boolean) {
    subs.get(id)?.forEach((fn) => fn(focused));
  }

  function setActive(next: string | null) {
    if (activeId === next) return;
    const prev = activeId;
    activeId = next;
    ctx.activeId = activeId;
    activeIdRef.value = activeId;
    if (prev) notify(prev, false);
    if (next) notify(next, true);
  }

  function findNextActive(startIdx: number, direction: 1 | -1): string | null {
    const len = focusables.length;
    for (let i = 0; i < len; i++) {
      const idx = (startIdx + direction * (i + 1) + len * len) % len;
      if (focusables[idx]!.isActive) return focusables[idx]!.id;
    }
    return null;
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
    // focusing on an unmounted/empty tree is a harmless no-op.
    focusNext() {
      if (focusables.length === 0) return;
      const idx = activeId ? focusables.findIndex((f) => f.id === activeId) : -1;
      const next = findNextActive(idx, 1);
      if (next) setActive(next);
    },
    focusPrevious() {
      if (focusables.length === 0) return;
      const idx = activeId ? focusables.findIndex((f) => f.id === activeId) : focusables.length;
      const prev = findNextActive(idx, -1);
      if (prev) setActive(prev);
    },
    focus(id) {
      const entry = focusables.find((f) => f.id === id);
      if (entry) setActive(id);
    },
    blur() {
      setActive(null);
    },
    add(id, options) {
      if (!focusables.some((f) => f.id === id)) {
        focusables.push({ id, isActive: true });
      }
      if (options.autoFocus && activeId == null) {
        setActive(id);
      }
    },
    remove(id) {
      const idx = focusables.findIndex((f) => f.id === id);
      if (idx >= 0) focusables.splice(idx, 1);
      if (activeId === id) setActive(null);
    },
    activate(id) {
      const entry = focusables.find((f) => f.id === id);
      if (entry) entry.isActive = true;
    },
    deactivate(id) {
      const entry = focusables.find((f) => f.id === id);
      if (entry) {
        entry.isActive = false;
        if (activeId === id) setActive(null);
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
}

interface RawModeState {
  refs: number;
  prevRaw: boolean | null;
}
const rawModeRegistry = new WeakMap<NodeJS.ReadStream, RawModeState>();

function getRawModeState(stdin: NodeJS.ReadStream): RawModeState {
  let state = rawModeRegistry.get(stdin);
  if (!state) {
    state = { refs: 0, prevRaw: null };
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

  const controller: StdinController = {
    stdin,
    setRawMode(mode: boolean) {
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
        // Match Ink's handleSetRawMode (App.tsx): enabling raw mode on an
        // unsupported stdin throws a descriptive error rather than silently
        // no-opping. Two messages — one for the default process.stdin, one for
        // a custom stream — both pointing at the isRawModeSupported docs. The
        // unguarded useInput path surfaces this; useFocus guards before calling
        // (see composables/useFocus.ts), so it degrades to a no-op like Ink.
        if (stdin === process.stdin) {
          throw new Error(
            "Raw mode is not supported on the current process.stdin, which Vue TUI uses as input stream by default.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported",
          );
        }
        throw new Error(
          "Raw mode is not supported on the stdin provided to Vue TUI.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported",
        );
      }
      const state = getRawModeState(stdin);
      if (state.refs === 0) {
        state.prevRaw = (stdin as { isRaw?: boolean }).isRaw ?? false;
        if (typeof stdin.ref === "function") stdin.ref();
        if (typeof (stdin as any).setEncoding === "function") (stdin as any).setEncoding("utf8");
        appCtx.setRawMode(true);
        stdin.on("data", handleData);
      }
      state.refs++;
      localRefs++;
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
        if (bracketedPasteModeCount === 0 && appCtx.stdout.isTTY) {
          appCtx.stdout.write("\x1b[?2004l");
        }
      }
    },
    releaseRawMode() {
      if (!appCtx.isRawModeSupported) return;
      if (localRefs === 0) return;
      const state = getRawModeState(stdin);
      state.refs = Math.max(0, state.refs - 1);
      localRefs = Math.max(0, localRefs - 1);
      if (state.refs === 0 && state.prevRaw !== null) {
        // Defer the actual disable: when components swap (v-if key change),
        // Vue unmounts the old before mounting the new, so refs briefly hits 0.
        // Disabling synchronously would drop raw mode between the two mounts.
        queueMicrotask(() => {
          if (state.refs > 0 || state.prevRaw === null) return;
          appCtx.setRawMode(state.prevRaw);
          state.prevRaw = null;
          stdin.off("readable", handleReadable);
          stdin.off("data", handleData);
          if (typeof stdin.unref === "function") stdin.unref();
          inputParser.reset();
        });
      }
    },
    dispose() {
      clearPendingFlush();
      stdin.off("readable", handleReadable);
      stdin.off("data", handleData);
      emitter.off("input", focusInputListener);
      if (bracketedPasteModeCount > 0 && appCtx.stdout.isTTY) {
        appCtx.stdout.write("\x1b[?2004l");
      }
      bracketedPasteModeCount = 0;
      if (localRefs > 0 && appCtx.isRawModeSupported) {
        const state = getRawModeState(stdin);
        state.refs = Math.max(0, state.refs - localRefs);
        localRefs = 0;
        if (state.refs === 0 && state.prevRaw !== null) {
          appCtx.setRawMode(state.prevRaw);
          state.prevRaw = null;
          if (typeof stdin.unref === "function") stdin.unref();
          inputParser.reset();
        }
      }
    },
  };

  return controller;
}
