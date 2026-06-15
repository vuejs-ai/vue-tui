import type { Component } from "vue";
import { shallowRef } from "vue";
import { createRenderer } from "@vue/runtime-core";
import { EventEmitter } from "node:events";
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
  FocusContextKey,
  StdinContextKey,
  AnimationSchedulerKey,
  type AppContext,
  type FocusContext,
  type StdinContext,
} from "./context.ts";
import { createNoOpAnimationScheduler } from "./animation-scheduler.ts";
import { isErrorInput, messageForNonError } from "./components/error-overview.ts";

export interface RenderToStringOptions {
  /**
   * Width of the virtual terminal in columns.
   *
   * @default 80
   */
  columns?: number;
}

/**
 * Options for the internal, screen-reader-capable render-to-string used by the
 * accessibility test suite. NOT part of the public API: Ink likewise keeps
 * screen-reader string rendering out of its public `renderToString` (layout
 * only) and reaches it through a private test helper. Exposed via
 * `@vue-tui/runtime/internal` as `renderToStringWithScreenReader`.
 */
interface RenderToStringInternalOptions extends RenderToStringOptions {
  /**
   * Enable screen reader mode. When enabled, the output is plain text
   * suitable for screen readers (no ANSI styling, with role/state annotations).
   *
   * @default false
   */
  isScreenReaderEnabled?: boolean;
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
 * Terminal-specific composables (`useInput`, `useStdin`, `useStdout`,
 * `useStderr`, `useApp`, `useFocus`, `useFocusManager`) return default
 * no-op values since there is no terminal session. They will not throw, but
 * they will not function as in a live terminal.
 *
 * The `<Static>` component is supported --- its output is prepended to the
 * dynamic output.
 *
 * If a component throws during rendering, the error is propagated to the
 * caller after cleanup.
 */
export function renderToString(component: Component, options?: RenderToStringOptions): string {
  return renderToStringInternal(component, options);
}

/**
 * Screen-reader-capable variant of {@link renderToString}, for the accessibility
 * test suite only (exported from `@vue-tui/runtime/internal`). The public
 * `renderToString` is layout-only, matching Ink, which keeps screen-reader
 * string rendering in a private test helper rather than its public API.
 */
export function renderToStringWithScreenReader(
  component: Component,
  options?: RenderToStringInternalOptions,
): string {
  return renderToStringInternal(component, options);
}

function renderToStringInternal(
  component: Component,
  options?: RenderToStringInternalOptions,
): string {
  const columns = options?.columns ?? 80;
  const isScreenReaderEnabled = options?.isScreenReaderEnabled ?? false;

  // Create a standalone root node --- no stdout, stdin, or terminal bindings.
  const appContext = createNoOpAppContext(isScreenReaderEnabled);
  const root = createRoot(appContext);
  attachYoga(root);
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

  // Provide no-op contexts so composables don't throw when injecting.
  app.provide(AppContextKey, appContext);
  app.provide(FocusContextKey, createNoOpFocusContext());
  app.provide(StdinContextKey, createNoOpStdinContext());
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

  let teardownSucceeded = false;
  let mounted = false;

  try {
    // Synchronously render the Vue tree into the root.
    app.mount(root);
    mounted = true;

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
    teardownSucceeded = true;

    // Free the root yoga node itself (children already freed by unmount).
    detachYoga(root);

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
    // that registered an external listener (e.g. useWindowSize's `resize` listener on
    // the shared process.stdout) leaks one per failed call, accumulating toward Node's
    // MaxListenersExceededWarning. Guard with `mounted` (never unmount a tree that
    // never mounted) and `teardownSucceeded` (the happy path already unmounted — no
    // double-unmount). app.unmount() also frees the CHILD yoga nodes via the node-ops
    // remove handler, leaving only the root for freeRecursive below.
    if (mounted && !teardownSucceeded) {
      try {
        app.unmount();
      } catch {
        // Best-effort teardown: a throw here must not mask the original error.
      }
    }

    // Ensure native yoga memory is freed even if rendering or teardown threw.
    // Yoga nodes are WASM-backed and not garbage collected. In the happy path
    // detachYoga(root) already freed the root; here (error path) freeRecursive
    // cleans up the root and any child nodes the unmount above couldn't free.
    if (!teardownSucceeded) {
      try {
        root.yoga.freeRecursive();
      } catch {
        // Best-effort: node may already be partially freed
      }
    }
  }
}

function createNoOpAppContext(isScreenReaderEnabled = false): AppContext {
  return {
    exit: () => {},
    // No terminal session: nothing to flush, resolve immediately (mirrors Ink's
    // default AppContext `async waitUntilRenderFlush() {}`).
    waitUntilRenderFlush: async () => {},
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    debug: false,
    interactive: false,
    isScreenReaderEnabled,
    isRawModeSupported: false,
    setRawMode: () => {},
    writeToStdout: () => {},
    writeToStderr: () => {},
    cursorPosition: undefined,
    setCursorPosition: () => {},
  };
}

function createNoOpFocusContext(): FocusContext {
  return {
    activeId: null,
    activeIdRef: shallowRef(null),
    enabled: false,
    enableFocus: () => {},
    disableFocus: () => {},
    focusNext: () => {},
    focusPrevious: () => {},
    focus: () => {},
    blur: () => {},
    add: () => {},
    remove: () => {},
    activate: () => {},
    deactivate: () => {},
    subscribe: () => () => {},
  };
}

function createNoOpStdinContext(): StdinContext {
  return {
    stdin: process.stdin,
    setRawMode: () => {},
    isRawModeSupported: false,
    internal_eventEmitter: new EventEmitter(),
    internal_exitOnCtrlC: false,
    acquireRawMode: () => {},
    releaseRawMode: () => {},
    setBracketedPasteMode: () => {},
  };
}
