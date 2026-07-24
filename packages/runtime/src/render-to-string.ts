import { createRenderer, createVNode, type Component, type VNode } from "vue";
import { Readable, Writable } from "node:stream";
import Yoga from "yoga-layout";
import { createRoot, type TuiNode } from "./host/nodes.ts";
import { calculateLayoutWithContentGuards } from "./host/layout-guards.ts";
import { attachYoga, detachYoga } from "./host/yoga.ts";
import { buildNodeOps } from "./host/node-ops.ts";
import { createHostYogaAllocationLedger } from "./host/yoga-allocation-ledger.ts";
import { paint } from "./paint/paint.ts";
import { prepareStaticOutput } from "./paint/static-channel.ts";
import { AppContextKey, StdinContextKey, type AppContext, type StdinContext } from "./context.ts";
import { createInternalInputSubscriptions } from "./io/input-subscriptions.ts";
import { createRenderedTargetController, setRenderedTargetController } from "./rendered-target.ts";
import { createInternalFocusController } from "./focus/focus-controller.ts";
import { InternalFocusControllerKey } from "./focus/focus-context.ts";
import { isErrorInput, messageForNonError } from "./error-value.ts";
import {
  InternalRenderSessionKey,
  createStringRenderSessionService,
  type InternalStringRenderSessionService,
} from "./render-session.ts";
import { MAX_LAYOUT_VALUE } from "./numeric-limits.ts";
import { createVueCleanupGuard } from "./vue-cleanup-guard.ts";

export interface RenderToStringOptions {
  /**
   * Modeled root layout width in terminal cells.
   *
   * @default 80
   */
  readonly width?: number;
  /**
   * Modeled root layout height in terminal cells. Use `Infinity` for no vertical bound.
   *
   * @default 24
   */
  readonly height?: number;
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
 * sharing a component with a live tree, and its `exit()` operation is a no-op.
 *
 * The `<Static>` component is supported --- its output is prepended to the
 * dynamic output.
 *
 * If a component throws during rendering, the error is propagated to the
 * caller after cleanup.
 */
export function renderToString(component: Component, options?: RenderToStringOptions): string {
  return renderToStringInternal(component, normalizePublicOptions(options));
}

interface NormalizedStringOptions {
  readonly width: number;
  /** `null` is Runtime's private unbounded representation. */
  readonly height: number | null;
}

function renderToStringInternal(component: Component, options: NormalizedStringOptions): string {
  const renderSession = createStringRenderSessionService({
    columns: options.width,
    rows: options.height,
  });
  const contexts = createStringContexts(options.width);
  try {
    return renderStringDocument(component, options, renderSession, contexts);
  } finally {
    renderSession.dispose();
    contexts.dispose();
  }
}

function renderStringDocument(
  component: Component,
  options: NormalizedStringOptions,
  renderSession: InternalStringRenderSessionService,
  contexts: ReturnType<typeof createStringContexts>,
): string {
  // Create a standalone root node --- no stdout, stdin, or terminal bindings.
  const { appContext, stdinContext } = contexts;
  const root = createRoot(appContext);
  const focusController = createInternalFocusController({
    root,
    inert: true,
  });
  const renderedTargets = createRenderedTargetController(root, focusController);
  setRenderedTargetController(appContext, renderedTargets);
  const hostYogaLedger = createHostYogaAllocationLedger();
  const renderer = createRenderer<TuiNode, TuiNode>(
    buildNodeOps({
      // Unlike the live renderer, the synchronous string host must not settle
      // Static on each host mutation: the tui-static host is inserted before
      // its slot children. The complete tree is collected once after render.
      onCommit: () => {},
      hostYogaLifetime: hostYogaLedger.lifetime,
    }),
  );
  const app = renderer.createApp(component);
  type VueContainer = typeof root & { _vnode?: VNode | null };
  const container = root as VueContainer;
  let rootAttached = false;
  let renderCompleted = false;
  let treeUnmounted = false;
  let vnode: VNode | undefined;
  const vueCleanupGuard = createVueCleanupGuard();
  let errored = false;
  let caught: unknown;
  const captureError = (error: unknown): void => {
    if (errored) return;
    errored = true;
    caught = error;
  };
  app.config.errorHandler = captureError;

  try {
    attachYoga(root);
    rootAttached = true;
    root.yoga.setWidth(options.width);

    // Provide isolated string-host contexts so shared components can inject
    // their normal services without acquiring a terminal.
    app.provide(InternalRenderSessionKey, renderSession);
    app.provide(AppContextKey, appContext);
    app.provide(InternalFocusControllerKey, focusController);
    app.provide(StdinContextKey, stdinContext);

    // Capture the first uncaught error so we can re-throw after cleanup.
    // Vue's error handling catches component errors internally; for a
    // synchronous utility like renderToString, callers expect errors to throw.
    //
    // Track occurrence with a SEPARATE boolean — NOT a `uncaughtError !== undefined`
    // sentinel. A component can throw literal `undefined` (e.g.
    // `onMounted(() => { throw undefined })`); a sentinel can't tell that apart from
    // "no error", so it would SWALLOW the error and return the normal frame,
    // violating the documented "errors propagate to the caller" contract. First-wins
    // (guarded by `errored`) preserves the first Vue error observed by this
    // synchronous utility.
    // Synchronously render the Vue tree into the root.
    const ownedVNode = createVNode(component);
    ownedVNode.appContext = app._context;
    vnode = ownedVNode;
    renderer.render(ownedVNode, root);
    renderCompleted = true;
    renderedTargets.reconcile();

    // Finite height is a maximum available root layout bound. Map public
    // Infinity to the private unbounded representation (`null`) and never pass
    // JavaScript Infinity into Yoga. Compute natural height first so short
    // documents are not padded or percentage-perturbed against an artificial max.
    let restoreLayoutGuards = calculateLayoutWithContentGuards(
      root,
      options.width,
      undefined,
      Yoga.DIRECTION_LTR,
    );
    let output: string;
    let capturedStaticOutput = "";
    try {
      if (options.height !== null) {
        const naturalHeight = Math.max(0, Math.floor(root.yoga.getComputedLayout().height));
        if (naturalHeight > options.height) {
          restoreLayoutGuards();
          restoreLayoutGuards = calculateLayoutWithContentGuards(
            root,
            options.width,
            options.height,
            Yoga.DIRECTION_LTR,
          );
        }
      }

      // String rendering has no physical handoff. Snapshot every complete open
      // Static subtree only after mount, then accept that local document prefix
      // before painting the mutable region that excludes Static hosts.
      const preparedStatic = prepareStaticOutput(root, options.width);
      capturedStaticOutput = preparedStatic.output;
      preparedStatic.accept();

      // Paint the computed layout without manufacturing a hard paint viewport for
      // short documents. Yoga already applied a finite height bound when content
      // exceeded it; shorter output stays unpadded. Clip only by line count so
      // ordinary horizontal overflow behavior matches the previous unbounded paint.
      output = paint(root);
      if (options.height !== null && output !== "") {
        const lines = output.split("\n");
        if (lines.length > options.height) {
          output = lines.slice(0, options.height).join("\n");
        }
      }
    } finally {
      restoreLayoutGuards();
    }

    // Run component and host cleanup before deciding whether the first
    // uncaught lifecycle error should propagate to the caller.
    if (vnode) vueCleanupGuard.guardVNode(vnode, captureError);
    renderer.render(null, root);
    treeUnmounted = true;

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
    // renderToString returns clean output.
    const normalizedStaticOutput = capturedStaticOutput.endsWith("\n")
      ? capturedStaticOutput.slice(0, -1)
      : capturedStaticOutput;

    if (normalizedStaticOutput && output) {
      return normalizedStaticOutput + "\n" + output;
    }

    return normalizedStaticOutput || output;
  } finally {
    // Vue only records container._vnode after a successful patch. When the
    // initial synchronous patch throws after creating the root component,
    // temporarily seed that ownership link so render(null) can traverse the
    // partial tree, stop every created scope, and invoke normal host removals.
    if (!treeUnmounted && vnode?.component) {
      if (!renderCompleted && container._vnode == null) {
        container._vnode = vnode;
      }
      try {
        vueCleanupGuard.guardVNode(vnode, captureError);
        renderer.render(null, root);
        treeUnmounted = true;
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
      focusController.dispose();
    } catch {
      // Best-effort: F3/string-host cleanup below must still run.
    }

    // An interrupted initial patch can allocate a host before Vue attaches it
    // to the root. Such nodes are unreachable from ordinary unmount traversal,
    // so release every still-owned allocation in reverse creation order.
    hostYogaLedger.rollback();

    // The root itself is outside the render-local host ledger.
    if (rootAttached) {
      try {
        detachYoga(root);
      } catch {
        // Best-effort: root may already be partially freed.
      }
    }
  }
}

function normalizeWidth(value: unknown): number {
  if (value === undefined) return 80;
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_LAYOUT_VALUE
  ) {
    return value;
  }
  throw new TypeError(
    `renderToString option "width" must be an integer between 1 and ${MAX_LAYOUT_VALUE}.`,
  );
}

function normalizeHeight(value: unknown): number | null {
  if (value === undefined) return 24;
  if (value === Number.POSITIVE_INFINITY) return null;
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_LAYOUT_VALUE
  ) {
    return value;
  }
  throw new TypeError(
    `renderToString option "height" must be a positive integer at most ${MAX_LAYOUT_VALUE}, or Infinity.`,
  );
}

function normalizeOptionsObject(options: unknown): Record<PropertyKey, unknown> {
  if (options === undefined) return {};
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("renderToString options must be an object or undefined.");
  }
  return options as Record<PropertyKey, unknown>;
}

function normalizePublicOptions(options: unknown): NormalizedStringOptions {
  const object = normalizeOptionsObject(options);
  return {
    width: normalizeWidth(object.width),
    height: normalizeHeight(object.height),
  };
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

function createStringContexts(columns: number): {
  readonly appContext: AppContext;
  readonly stdinContext: StdinContext;
  dispose(): void;
} {
  const stdout = createDiscardWritable(columns);
  const stderr = createDiscardWritable(columns);
  const stdin = createInertReadable();
  const appContext: AppContext = {
    exit: () => {},
    stdout,
    stderr,
    stdin,
    isRawModeSupported: false,
    setRawMode: () => {},
    writeToStdout: () => ({ status: "accepted", writable: true }),
    writeToStderr: () => ({ status: "accepted", writable: true }),
  };

  const stdinContext = createNoOpStdinContext(stdin);
  return {
    appContext,
    stdinContext,
    dispose() {
      stdinContext.inputSubscriptions.clear();
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
    inputSubscriptions: createInternalInputSubscriptions(),
    acquirePublicRawMode: () => () => {},
  };
}
