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
import { createInputParser, type InputEvent } from "./io/input-parser.ts";
import { createRoot, type TuiRoot, type TuiNode } from "./host/nodes.ts";
import { attachYoga, detachYoga } from "./host/yoga.ts";
import { buildNodeOps } from "./host/node-ops.ts";
import { createCommitScheduler } from "./scheduler.ts";
import { paint, paintIsolated } from "./paint/paint.ts";
import { flushStatic, findStatics } from "./paint/static-channel.ts";
import { createFrameWriter } from "./io/frame-writer.ts";
import {
  AppContextKey,
  FocusContextKey,
  StdinContextKey,
  type AppContext,
  type CursorPosition,
  type FocusContext,
  type StdinContext,
} from "./context.ts";
import { devState, DevStateKey, initHmrBridge } from "./hmr.ts";
import { createDevOverlayWrapper } from "./overlay.ts";
import { ErrorOverview } from "./components/ErrorOverview.ts";

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
   * Maximum frames per second. Controls the throttle interval used by the
   * commit scheduler. When not set, the default ~30fps (32ms) is used.
   *
   * Ignored in debug mode (commits are immediate).
   */
  maxFps?: number;
  /**
   * Enable screen reader mode. When enabled, the commit scheduler bypasses
   * throttling (immediate commits) so every frame is flushed without delay.
   *
   * @default true when `process.env["INK_SCREEN_READER"] === "true"`, otherwise false
   */
  isScreenReaderEnabled?: boolean;
}

export interface TuiApp extends Omit<VueApp<TuiNode>, "mount"> {
  mount(options?: MountOptions): ComponentPublicInstance;
  waitUntilExit(): Promise<unknown>;
  waitUntilRenderFlush(): Promise<void>;
}

type RootProps = Record<string, unknown>;

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
  let mountedDebug = false;
  let mountedInteractive = true;
  let mountedRawMode = false;
  let mountedGetLastOutput: (() => string) | null = null;
  let mountedRestoreConsole: (() => void) | null = null;
  let mountedScheduler: ReturnType<typeof createCommitScheduler> | null = null;

  // The renderer's onCommit closure is wired at createApp time but only does
  // real work after mount swaps in scheduler.schedule. One renderer per app
  // even though it's not used until mount.
  let scheduledCommit: () => void = () => {};

  let teardownStarted = false;
  function teardown() {
    if (teardownStarted) return;
    teardownStarted = true;
    scheduledCommit = () => {};
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
    if (!mountedDebug && !mountedInteractive && mountedAppContext) {
      // Non-interactive: write the deferred last frame at unmount (matching Ink).
      const lastFrame = mountedGetLastOutput?.() ?? "";
      if (lastFrame) {
        mountedAppContext.stdout.write(lastFrame + "\n");
      }
    }
    if (mountedWriter && !mountedDebug && mountedInteractive) mountedWriter.done();
    // Show cursor on unmount (matching Ink). Only in interactive mode.
    if (!mountedDebug && mountedInteractive && mountedAppContext) {
      mountedAppContext.stdout.write("\x1b[?25h");
    }
    if (mountedRoot) detachYoga(mountedRoot);
    if (mountedResizeHandler && mountedAppContext) {
      mountedAppContext.stdout.off("resize", mountedResizeHandler);
    }
    if (mountedExitListener) {
      process.off("exit", mountedExitListener);
    }
    if (mountedRawMode && mountedAppContext) {
      mountedAppContext.setRawMode(false);
      mountedRawMode = false;
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
    const rawMode = options.rawMode ?? true;
    const onRender = options.onRender;
    const maxFps = options.maxFps;
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
    const frameState = { lastOutput: "", outputHeight: 0, fullStaticOutput: "" };
    let cursorPosition: CursorPosition | undefined;
    mountedGetLastOutput = () => frameState.lastOutput;

    function restoreLastOutput() {
      if (!interactive) return;
      // Re-write the last frame through the frame writer (log-update) so
      // the cursor returns to the correct position after external writes.
      writer.write(frameState.lastOutput);
      // Cursor position handling (for Phase 5's useCursor integration):
      // If cursor position is set, move cursor there and show it;
      // otherwise hide it.
      if (cursorPosition) {
        stdout.write(`\x1b[${cursorPosition.y + 1};${cursorPosition.x + 1}H`);
        stdout.write("\x1b[?25h");
      } else {
        stdout.write("\x1b[?25l");
      }
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
            exitReject(errorOrResult);
          } else {
            exitResolve(errorOrResult);
          }
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

    const tuiRoot = createRoot(appContext);
    attachYoga(tuiRoot);
    tuiRoot.yoga.setWidth(stdout.columns ?? 80);
    mountedRoot = tuiRoot;

    // Reset accumulated static output when the <Static> identity changes
    // (unmount, remount via key change) so stale items are not replayed.
    tuiRoot.onStaticChange = () => {
      frameState.fullStaticOutput = "";
    };

    const writer = createFrameWriter(stdout, { debug });
    mountedWriter = writer;

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

      if (!interactive && !debug) {
        // Non-interactive: write static output immediately, defer dynamic frame.
        // We inline the static flush logic so we can both capture and write it.
        const w = stdout.columns ?? 80;
        for (const stat of findStatics(tuiRoot)) {
          const fresh = stat.children.slice(stat.writtenCount);
          if (fresh.length === 0) continue;
          const staticFrame = paintIsolated(fresh, w, stat);
          if (staticFrame.length > 0) {
            const output = staticFrame + "\n";
            frameState.fullStaticOutput += output;
            stdout.write(output);
          }
          stat.writtenCount = stat.children.length;
        }

        tuiRoot.yoga.setWidth(w);
        tuiRoot.yoga.calculateLayout(w, undefined, Yoga.DIRECTION_LTR);
        const frame = paint(tuiRoot);
        frameState.lastOutput = frame;
        frameState.outputHeight = frame === "" ? 0 : frame.split("\n").length;
        if (onRender) onRender({ renderTime: performance.now() - start });
        return;
      }

      writer.clear();
      flushStatic(tuiRoot, stdout);
      const w = stdout.columns ?? 80;
      tuiRoot.yoga.setWidth(w);
      tuiRoot.yoga.calculateLayout(w, undefined, Yoga.DIRECTION_LTR);
      const frame = paint(tuiRoot);

      // Track last output for writeToStdout/writeToStderr frame coordination
      frameState.lastOutput = frame;
      frameState.outputHeight = frame === "" ? 0 : frame.split("\n").length;

      writer.write(frame);
      if (onRender) onRender({ renderTime: performance.now() - start });
    }

    const schedulerOptions: { immediate: boolean; throttleMs?: number } = {
      immediate: debug || isScreenReaderEnabled,
    };
    if (maxFps != null && !debug && !isScreenReaderEnabled) {
      schedulerOptions.throttleMs = Math.round(1000 / maxFps);
    }
    const scheduler = createCommitScheduler(commit, schedulerOptions);
    mountedScheduler = scheduler;
    scheduledCommit = scheduler.schedule;

    // Internal provides — set before the actual mount so components can inject
    // them. User .use/.provide calls made earlier on the chain stay intact;
    // our keys are Symbols so there's no collision risk.
    baseApp.provide(AppContextKey, appContext);
    baseApp.provide(FocusContextKey, focusContext);
    baseApp.provide(StdinContextKey, stdinController);
    if (typeof __VUE_TUI_DEV__ !== "undefined" && __VUE_TUI_DEV__) {
      baseApp.provide(DevStateKey, devState);
    }

    // Wire exit-with-error for the error boundary (must be set before mount).
    exitWithError = (e: Error) => appContext.exit(e);

    const proxy = originalMount(tuiRoot) as unknown as ComponentPublicInstance;

    // errorHandler as fallback for errors that bypass onErrorCaptured (e.g.
    // async errors in Vue's internal scheduler). The error boundary returns
    // false to stop propagation, so caught errors won't reach here.
    baseApp.config.errorHandler = (err) => {
      appContext.exit(err instanceof Error ? err : new Error(String(err)));
    };

    if (rawMode && appContext.isRawModeSupported) {
      appContext.setRawMode(true);
      mountedRawMode = true;
    }

    // Hide cursor on mount (matching Ink). Only in interactive mode — in
    // debug/test mode or non-interactive the stream may not be a real TTY.
    if (!debug && interactive) {
      stdout.write("\x1b[?25l");
    }

    // Only listen for resize in interactive mode (matching Ink).
    if (interactive) {
      const onResize = () => scheduler.schedule();
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
    exitResolve();
  };

  app.waitUntilExit = function waitUntilExit(): Promise<unknown> {
    return exitPromise;
  };

  app.waitUntilRenderFlush = async function waitUntilRenderFlush(): Promise<void> {
    // Flush any pending throttled render
    if (mountedScheduler?.hasPending()) {
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

  stdin.on("readable", handleReadable);
  stdin.on("data", handleData);

  // Focus Tab / Shift+Tab navigation (Esc blur handled in emitInput)
  const focusInputListener = (data: string) => {
    if (data === "\t") focusContext.focusNext();
    else if (data === "\x1b[Z") focusContext.focusPrevious();
  };
  emitter.on("input", focusInputListener);

  let localRefs = 0;

  return {
    stdin,
    setRawMode: appCtx.setRawMode,
    isRawModeSupported: appCtx.isRawModeSupported,
    internal_eventEmitter: emitter,
    internal_exitOnCtrlC: opts.exitOnCtrlC,
    acquireRawMode() {
      if (!appCtx.isRawModeSupported) return;
      const state = getRawModeState(stdin);
      if (state.refs === 0) {
        state.prevRaw = (stdin as { isRaw?: boolean }).isRaw ?? false;
        appCtx.setRawMode(true);
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
          inputParser.reset();
        }
      }
    },
  };
}
