import type { Component } from "vue";
import { createRenderer } from "vue";
import { Readable, Writable } from "node:stream";
import Yoga from "yoga-layout";
import { createRoot, type TuiNode } from "./host/nodes.ts";
import { calculateLayoutWithContentGuards } from "./host/layout-guards.ts";
import { attachYoga, detachYoga } from "./host/yoga.ts";
import { buildNodeOps } from "./host/node-ops.ts";
import { paint } from "./paint/paint.ts";
import { renderScreenReaderOutput } from "./paint/screen-reader.ts";
import { findStatics, paintStaticNode } from "./paint/static-channel.ts";
import {
  AppContextKey,
  StdinContextKey,
  AnimationSchedulerKey,
  type AppContext,
  type StdinContext,
} from "./context.ts";
import { createNoOpAnimationScheduler } from "./animation-scheduler.ts";
import { createInternalInputRoutingRuntime } from "./io/input-route-runtime.ts";
import { createInputAvailabilityRef, stringInputUnavailable } from "./io/input-availability.ts";
import { createRenderedTargetController, setRenderedTargetController } from "./rendered-target.ts";
import { createInternalFocusController } from "./focus/focus-controller.ts";
import { InternalFocusControllerKey } from "./focus/focus-context.ts";
import { createInternalCaretController } from "./caret/caret-controller.ts";
import { InternalCaretControllerKey } from "./caret/caret-context.ts";
import { isErrorInput, messageForNonError } from "./components/error-overview.ts";
import {
  InternalRenderSessionKey,
  createStringRenderSessionService,
  type InternalStringRenderSessionService,
  type RenderPresentation,
} from "./render-session.ts";

export interface RenderToStringOptions {
  /**
   * Width of the virtual terminal in columns.
   *
   * @default 80
   */
  columns?: number;
}

/**
 * Render a Vue component to a string synchronously. Unlike `createApp()`,
 * this function does not write to stdout, does not set up any terminal event
 * listeners, and returns the rendered output as a string.
 *
 * Useful for generating documentation, writing output to files, testing, or
 * any scenario where you need the rendered output as a string without
 * starting a persistent terminal application.
 *
 * Terminal-specific input, focus, and stream composables receive isolated inert
 * services because there is no terminal session. `useApp()` can be called while
 * sharing a component with a live tree, but invoking either lifecycle operation
 * reports that the operation is unavailable for synchronous string rendering.
 *
 * The `<Static>` component is supported --- its output is prepended to the
 * dynamic output.
 *
 * If a component throws during rendering, the error is propagated to the
 * caller after cleanup.
 */
export function renderToString(component: Component, options?: RenderToStringOptions): string {
  return renderToStringInternal(component, normalizePublicOptions(options), "visual");
}

/**
 * Screen-reader-capable variant of {@link renderToString}, for the accessibility
 * test suite only (exported from `@vue-tui/runtime/internal`). The public
 * `renderToString` is layout-only, matching Ink, which keeps screen-reader
 * string rendering in a private test helper rather than its public API.
 */
export function renderToStringWithScreenReader(
  component: Component,
  options?: RenderToStringOptions,
): string {
  return renderToStringInternal(component, normalizeInternalOptions(options), "screen-reader");
}

function renderToStringInternal(
  component: Component,
  options: { readonly columns: number },
  presentation: RenderPresentation,
): string {
  const renderSession = createStringRenderSessionService({
    columns: options.columns,
    presentation,
  });
  const contexts = createStringContexts(options.columns);
  try {
    return renderStringDocument(component, options.columns, presentation, renderSession, contexts);
  } finally {
    renderSession.dispose();
    contexts.dispose();
  }
}

function renderStringDocument(
  component: Component,
  columns: number,
  presentation: RenderPresentation,
  renderSession: InternalStringRenderSessionService,
  contexts: ReturnType<typeof createStringContexts>,
): string {
  const isScreenReaderEnabled = presentation === "screen-reader";
  // Create a standalone root node --- no stdout, stdin, or terminal bindings.
  const { appContext, stdinContext } = contexts;
  const root = createRoot(appContext);
  const focusController = createInternalFocusController({
    root,
    inputRouting: stdinContext.internal_inputRouting,
    inert: true,
  });
  const caretController = createInternalCaretController({
    focus: focusController,
    outputAvailable: false,
    requestPaint: () => {},
  });
  const renderedTargets = createRenderedTargetController(root, focusController);
  setRenderedTargetController(appContext, renderedTargets);
  let yogaAttached = false;
  let rootDetached = false;
  let appUnmounted = false;
  let mounted = false;
  let unmountApp: (() => void) | undefined;

  try {
    attachYoga(root);
    yogaAttached = true;
    root.yoga.setWidth(columns);

    // Capture static output from intermediate renders.
    // The <Static> component uses watchEffect / onMounted to clear its children
    // after the first commit. The onCommit callback fires on each DOM mutation,
    // giving us a chance to capture static content before it is cleared.
    let capturedStaticOutput = "";

    const renderer = createRenderer<TuiNode, TuiNode>(
      buildNodeOps({
        onCommit: () => {
          const restoreLayoutGuards = calculateLayoutWithContentGuards(
            root,
            columns,
            undefined,
            Yoga.DIRECTION_LTR,
          );
          try {
            // Flush static output from intermediate renders
            for (const stat of findStatics(root)) {
              const staticFrame = paintStaticNode(stat, columns, isScreenReaderEnabled);
              if (staticFrame && staticFrame !== "\n") {
                capturedStaticOutput += staticFrame + "\n";
              }
            }
          } finally {
            restoreLayoutGuards();
          }
        },
      }),
    );

    const app = renderer.createApp(component);
    unmountApp = () => app.unmount();

    // Provide isolated string-host contexts so shared components can inject
    // their normal services without acquiring a terminal.
    app.provide(InternalRenderSessionKey, renderSession);
    app.provide(AppContextKey, appContext);
    app.provide(InternalFocusControllerKey, focusController);
    app.provide(InternalCaretControllerKey, caretController);
    app.provide(StdinContextKey, stdinContext);
    app.provide(AnimationSchedulerKey, createNoOpAnimationScheduler());

    // Capture the first uncaught error so we can re-throw after cleanup.
    // Vue's error handling catches component errors internally; for a
    // synchronous utility like renderToString, callers expect errors to throw.
    //
    // Track occurrence with a SEPARATE boolean — NOT a `uncaughtError !== undefined`
    // sentinel. A component can throw literal `undefined` (e.g.
    // `onMounted(() => { throw undefined })`); a sentinel can't tell that apart from
    // "no error", so it would SWALLOW the error and return the normal frame,
    // violating the documented "errors propagate to the caller" contract. First-wins
    // (guarded by `errored`) matches the live renderer's onErrorCaptured.
    let errored = false;
    let caught: unknown;
    app.config.errorHandler = (err) => {
      if (!errored) {
        errored = true;
        caught = err;
      }
    };

    // Synchronously render the Vue tree into the root.
    app.mount(root);
    mounted = true;
    renderedTargets.reconcile();

    const restoreLayoutGuards = calculateLayoutWithContentGuards(
      root,
      columns,
      undefined,
      Yoga.DIRECTION_LTR,
    );
    let output: string;
    try {
      // Render the dynamic frame to a string.
      output = isScreenReaderEnabled
        ? renderScreenReaderOutput(root, { skipStaticElements: true })
        : paint(root);
    } finally {
      restoreLayoutGuards();
    }

    // Tear down: unmount the tree so Vue cleans up child nodes and runs
    // effect cleanup functions. Child yoga nodes are freed by the node-ops
    // remove handler.
    app.unmount();
    appUnmounted = true;

    // Free the root yoga node itself (children already freed by unmount).
    detachYoga(root);
    rootDetached = true;

    // Re-throw after full cleanup so callers see the original error. Mirrors the
    // live renderer's exit-error path: a genuine Error — including a cross-realm
    // one (fails `instanceof Error`, passes the `[object Error]` brand check) — is
    // re-thrown AS-IS so its stack/message survive; a true non-Error throw
    // (`throw "x"`, `throw {message:'x'}`) is wrapped with messageForNonError, so
    // `{message:"detail"}` surfaces "detail" rather than the lossy "[object Object]".
    if (errored) {
      throw isErrorInput(caught) ? caught : new Error(messageForNonError(caught));
    }

    // The static channel appends a trailing newline for terminal rendering
    // (so dynamic output starts on a fresh line). Strip it here so
    // renderToString returns clean output. This applies in BOTH modes: SR mode
    // linearizes static items into plain text too (paintStaticNode branches on
    // isScreenReaderEnabled), and Ink's SR renderer likewise returns the static
    // output when node.staticNode exists (renderer.ts:24-33). Prepending the
    // captured static output mirrors the non-SR path so SR renderToString does
    // not silently drop <Static> content.
    const normalizedStaticOutput = capturedStaticOutput.endsWith("\n")
      ? capturedStaticOutput.slice(0, -1)
      : capturedStaticOutput;

    if (normalizedStaticOutput && output) {
      return normalizedStaticOutput + "\n" + output;
    }

    return normalizedStaticOutput || output;
  } finally {
    // If layout/paint threw, the happy-path app.unmount() above was skipped. Unmount
    // here so the tree's onScopeDispose cleanups ALWAYS run — otherwise a composable
    // that registered an external listener leaks one per failed call. Guard with
    // `mounted` (never unmount a tree that never mounted) and `appUnmounted`
    // (the happy path already unmounted, so avoid a second unmount).
    // app.unmount() also frees the CHILD yoga nodes via the node-ops remove
    // handler, leaving only the root for freeRecursive below.
    if (mounted && !appUnmounted) {
      try {
        unmountApp?.();
        appUnmounted = true;
      } catch {
        // Best-effort teardown: a throw here must not mask the original error.
      }
    }

    setRenderedTargetController(appContext, null);
    try {
      renderedTargets.dispose();
    } catch {
      // Best-effort: an adapter cleanup must not mask the render result or the
      // original render failure after the remaining host resources are freed.
    }
    try {
      caretController.dispose();
    } catch {
      // Best-effort: F4/string-host cleanup below must still run.
    }
    try {
      focusController.dispose();
    } catch {
      // Best-effort: F3/string-host cleanup below must still run.
    }

    // Ensure native yoga memory is freed even if rendering or teardown threw.
    // Yoga nodes are WASM-backed and not garbage collected. In the happy path
    // detachYoga(root) already freed the root; here (error path) freeRecursive
    // cleans up the root and any child nodes the unmount above couldn't free.
    if (yogaAttached && !rootDetached) {
      try {
        root.yoga.freeRecursive();
      } catch {
        // Best-effort: node may already be partially freed
      }
    }
  }
}

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function normalizeColumns(value: unknown): number {
  if (value === undefined) return 80;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  throw new TypeError('renderToString option "columns" must be a positive safe integer.');
}

function normalizeOptionsObject(options: unknown): Record<PropertyKey, unknown> {
  if (options === undefined) return {};
  if (typeof options !== "object" || options === null) {
    throw new TypeError("renderToString options must be an object or undefined.");
  }
  return options as Record<PropertyKey, unknown>;
}

function rejectModePassthrough(options: Record<PropertyKey, unknown>): void {
  for (const key of [
    "mode",
    "fullscreen",
    "alternateScreen",
    "rows",
    "presentation",
    "isScreenReaderEnabled",
  ] as const) {
    if (hasOwn(options, key)) {
      throw new TypeError(
        `renderToString option "${key}" is unavailable; public string rendering is a visual document with unbounded rows and no terminal mode.`,
      );
    }
  }
}

function normalizePublicOptions(options: unknown): { readonly columns: number } {
  const object = normalizeOptionsObject(options);
  // Recognizable attempts to select a terminal mode or the private transcript
  // renderer fail before any option getter can trigger rendering side effects.
  rejectModePassthrough(object);
  return { columns: normalizeColumns(object.columns) };
}

function normalizeInternalOptions(options: unknown): { readonly columns: number } {
  const object = normalizeOptionsObject(options);
  for (const key of ["mode", "fullscreen", "alternateScreen", "rows", "presentation"] as const) {
    if (hasOwn(object, key)) {
      throw new TypeError(
        `renderToStringWithScreenReader option "${key}" is unavailable; the helper renders a screen-reader document with unbounded rows and no terminal mode.`,
      );
    }
  }
  if (hasOwn(object, "isScreenReaderEnabled")) {
    throw new TypeError(
      'renderToStringWithScreenReader no longer accepts "isScreenReaderEnabled"; the helper name selects that presentation.',
    );
  }
  return { columns: normalizeColumns(object.columns) };
}

function createDiscardWritable(columns: number): NodeJS.WriteStream {
  const stream = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  }) as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: false, columns });
  return stream;
}

function createInertReadable(): NodeJS.ReadStream {
  const stream = new Readable({ read() {} }) as unknown as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: false,
    setRawMode() {
      return stream;
    },
  });
  return stream;
}

function unavailableOperation(name: string): Error {
  return new Error(`${name} is unavailable during renderToString().`);
}

function createStringContexts(columns: number): {
  readonly appContext: AppContext;
  readonly stdinContext: StdinContext;
  dispose(): void;
} {
  const stdout = createDiscardWritable(columns);
  const stderr = createDiscardWritable(columns);
  const stdin = createInertReadable();
  const appContext: AppContext = {
    exit: () => {
      throw unavailableOperation("useApp().exit()");
    },
    waitUntilRenderFlush: () =>
      Promise.reject(unavailableOperation("useApp().waitUntilRenderFlush()")),
    stdout,
    stderr,
    stdin,
    isRawModeSupported: false,
    setRawMode: () => {},
    writeToStdout: () => {},
    writeToStderr: () => {},
  };

  const stdinContext = createNoOpStdinContext(stdin);
  return {
    appContext,
    stdinContext,
    dispose() {
      stdinContext.internal_inputRouting.clear();
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    },
  };
}

function createNoOpStdinContext(stdin: NodeJS.ReadStream): StdinContext {
  return {
    stdin,
    isRawModeSupported: false,
    inputAvailability: createInputAvailabilityRef(stringInputUnavailable),
    internal_inputRouting: createInternalInputRoutingRuntime(),
    acquireRawMode: () => {},
    releaseRawMode: () => {},
    acquireSemanticInput: () => {},
    releaseSemanticInput: () => {},
    acquireSgrMouseMode: () => Symbol("noop-sgr-mouse"),
    releaseSgrMouseMode: () => {},
  };
}
