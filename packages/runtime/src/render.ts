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
import isInCi from "is-in-ci";
import patchConsoleFn from "patch-console";
import ansiEscapes from "ansi-escapes";
import { createInputParser, type InputEvent } from "./io/input-parser.ts";
import { createKittyKeyboardController, type KittyKeyboardOptions } from "./io/kitty-keyboard.ts";
import { createRoot, emitLayoutListeners, type TuiRoot, type TuiNode } from "./host/nodes.ts";
import { attachYoga, detachYoga } from "./host/yoga.ts";
import { buildNodeOps } from "./host/node-ops.ts";
import { createCommitScheduler } from "./scheduler.ts";
import { createAnimationScheduler } from "./animation-scheduler.ts";
import { paint } from "./paint/paint.ts";
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

  let mountedRoot: TuiRoot | null = null;
  let mountedWriter: ReturnType<typeof createFrameWriter> | null = null;
  let mountedStdinController: StdinController | null = null;
  let mountedAppContext: AppContext | null = null;
  let mountedResizeHandler: (() => void) | null = null;
  let mountedExitListener: (() => void) | null = null;
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

  // The renderer's onCommit closure is wired at createApp time but only does
  // real work after mount swaps in scheduler.schedule. One renderer per app
  // even though it's not used until mount.
  let scheduledCommit: () => void = () => {};

  // Pending exit state — stored so resolveExit() can flush stdout before
  // settling the exit promise.
  let pendingExitError: unknown = undefined;
  let pendingExitResult: unknown = undefined;

  function resolveExit() {
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

  function writeBestEffort(stream: NodeJS.WriteStream, data: string) {
    if (stream.destroyed || stream.writableEnded) return;
    try {
      stream.write(data);
    } catch {
      // Stream may already be destroyed during shutdown.
    }
  }

  let teardownStarted = false;
  function teardown() {
    if (teardownStarted) return;
    teardownStarted = true;

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
      mountedKittyController.dispose();
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
      writeBestEffort(mountedAppContext.stdout, ansiEscapes.exitAlternativeScreen);
      writeBestEffort(mountedAppContext.stdout, "\x1b[?25h");
      mountedAlternateScreen = false;
    } else if (!mountedDebug && mountedInteractive && mountedAppContext) {
      writeBestEffort(mountedAppContext.stdout, "\x1b[?25h");
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
      if (debug) {
        stdout.write(data + frameState.fullStaticOutput + frameState.lastOutput);
        return;
      }
      if (!interactive) {
        stdout.write(data);
        return;
      }
      writer.clear();
      stdout.write(data);
      restoreLastOutput();
    }

    function writeToStderr(data: string) {
      if (debug) {
        stderr.write(data);
        stdout.write(frameState.fullStaticOutput + frameState.lastOutput);
        return;
      }
      if (!interactive) {
        stderr.write(data);
        return;
      }
      writer.clear();
      stderr.write(data);
      restoreLastOutput();
    }

    const appContext: AppContext = {
      exit(errorOrResult?: unknown) {
        // Defer teardown to a microtask: exit() is frequently called from
        // inside the Vue update cycle (useInput handler, setup(), errorHandler)
        // and unmounting synchronously would tear Vue down mid-flush.
        queueMicrotask(() => {
          teardown();
          if (errorOrResult instanceof Error) {
            pendingExitError = errorOrResult;
          } else {
            pendingExitResult = errorOrResult;
          }
          resolveExit();
        });
      },
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
      const outputToRender = isFullscreen ? output : output + "\n";

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
        const staticFrame = paintStaticNode(stat, w);
        if (staticFrame.length > 0) {
          staticOutput += staticFrame + "\n";
        }
      }
      const hasStaticOutput = staticOutput !== "" && staticOutput !== "\n";
      if (hasStaticOutput) {
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
        const frame = paint(tuiRoot);
        frameState.lastOutput = frame;
        frameState.lastOutputToRender = frame + "\n";
        frameState.outputHeight = frame === "" ? 0 : frame.split("\n").length;
        if (onRender) onRender({ renderTime: performance.now() - start });
        return;
      }

      tuiRoot.yoga.setWidth(w);
      tuiRoot.yoga.calculateLayout(w, undefined, Yoga.DIRECTION_LTR);
      emitLayoutListeners(tuiRoot);
      const frame = paint(tuiRoot);
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
    if (!debug && interactive && !mountedAlternateScreen) {
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
      const onResize = () => {
        // Cancel any pending trailing commit before painting synchronously.
        // Otherwise the throttle timer fires a second doCommit() right after
        // this paint, and because shouldClearTerminalForFrame clears whenever
        // the previous frame overflowed, that second commit emits a duplicate
        // clearTerminal (issue #26). The synchronous commit below already
        // reflects the current tree, so the pending commit is redundant.
        scheduler.cancel();
        commit();
      };
      stdout.on("resize", onResize);
      mountedResizeHandler = onResize;
    }

    // Auto-cleanup on process exit (process.exit, event-loop drain, uncaught
    // exception — anything that fires Node's 'exit' event). teardown() is
    // sync and idempotent, safe to call from this hook. If the user already
    // called unmount() / useExit(), this is a no-op.
    const exitListener = () => teardown();
    process.on("exit", exitListener);
    mountedExitListener = exitListener;

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

  app.waitUntilRenderFlush = async function waitUntilRenderFlush(): Promise<void> {
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
  };

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
  let enabled = true;

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
      enabled = true;
      ctx.enabled = true;
    },
    disableFocus() {
      enabled = false;
      ctx.enabled = false;
    },
    focusNext() {
      if (!enabled || focusables.length === 0) return;
      const idx = activeId ? focusables.findIndex((f) => f.id === activeId) : -1;
      const next = findNextActive(idx, 1);
      if (next) setActive(next);
    },
    focusPrevious() {
      if (!enabled || focusables.length === 0) return;
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
    // exitOnCtrlC: intercept \x03 BEFORE dispatching to useInput
    if (input === "\x03" && opts.exitOnCtrlC) {
      appCtx.exit();
      return;
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
      if (!appCtx.isRawModeSupported) return;
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
