import type { Component } from "vue";
import { shallowRef } from "vue";
import { createRenderer } from "@vue/runtime-core";
import { EventEmitter } from "node:events";
import Yoga from "yoga-layout";
import { createRoot, type TuiNode } from "./host/nodes.ts";
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

export interface RenderToStringOptions {
  /**
   * Width of the virtual terminal in columns.
   *
   * @default 80
   */
  columns?: number;
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
 * `useStderr`, `useAppContext`, `useFocus`, `useFocusManager`) return default
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
        root.yoga.calculateLayout(columns, undefined, Yoga.DIRECTION_LTR);
        // Flush static output from intermediate renders
        for (const stat of findStatics(root)) {
          const staticFrame = paintStaticNode(stat, columns, isScreenReaderEnabled);
          if (staticFrame && staticFrame !== "\n") {
            capturedStaticOutput += staticFrame + "\n";
          }
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
  let uncaughtError: unknown;
  app.config.errorHandler = (err) => {
    uncaughtError ??= err;
  };

  let teardownSucceeded = false;

  try {
    // Synchronously render the Vue tree into the root.
    app.mount(root);

    // Calculate final layout (onCommit may have already done this, but
    // ensure the final state is laid out).
    root.yoga.calculateLayout(columns, undefined, Yoga.DIRECTION_LTR);

    // Render the dynamic frame to a string.
    const output = isScreenReaderEnabled
      ? renderScreenReaderOutput(root, { skipStaticElements: true })
      : paint(root);

    // Tear down: unmount the tree so Vue cleans up child nodes and runs
    // effect cleanup functions. Child yoga nodes are freed by the node-ops
    // remove handler.
    app.unmount();
    teardownSucceeded = true;

    // Free the root yoga node itself (children already freed by unmount).
    detachYoga(root);

    // Re-throw after full cleanup so callers see the original error.
    if (uncaughtError !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      throw uncaughtError instanceof Error ? uncaughtError : new Error(String(uncaughtError));
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
    // Ensure native yoga memory is freed even if rendering or teardown threw.
    // Yoga nodes are WASM-backed and not garbage collected.
    if (!teardownSucceeded) {
      try {
        // If unmount failed, some child nodes may not have been freed.
        // Use freeRecursive to clean up the entire tree as best-effort.
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
