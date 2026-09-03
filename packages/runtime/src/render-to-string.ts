import { createRenderer, createVNode, type Component, type VNode } from "vue";
import { createRoot, type TuiNode } from "./host/nodes.ts";
import { runLayoutTransaction } from "./layout/layout-transaction.ts";
import { attachYoga, detachYoga } from "./layout/yoga.ts";
import { buildNodeOps } from "./vue/node-ops.ts";
import { createHostYogaAllocationLedger } from "./layout/yoga-allocation-ledger.ts";
import { paint } from "./paint/paint.ts";
import { findStatics, prepareStaticOutput } from "./paint/static-channel.ts";
import { encodeFrame, encodeFrameHistory } from "./surface/frame-encoder.ts";
import { AppContextKey, StdinContextKey } from "./vue/context.ts";
import {
  createRenderedTargetController,
  setRenderedTargetController,
} from "./session/rendered-target.ts";
import { createInternalFocusController } from "./session/focus-controller.ts";
import { InternalFocusControllerKey } from "./vue/focus-context.ts";
import { isErrorInput, messageForNonError } from "./vue/error-value.ts";
import {
  InternalRenderSessionKey,
  createStringRenderSessionService,
  type InternalStringRenderSessionService,
} from "./render-session.ts";
import { MAX_LAYOUT_VALUE } from "./layout/numeric-limits.ts";
import { resolveTerminalStyle } from "./text/terminal-style.ts";
import { normalizeColorOption, type ColorProfile } from "./frame/color-profile.ts";
import { createNodeStringContexts, type NodeStringContexts } from "./session/string-context.ts";
import { getDefaultNodeTerminalStyleFacts, isNodeProduction } from "./terminal/node/backend.ts";

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
  /**
   * Select terminal styling for the returned string. Omission and `false`
   * produce plain output. `true` automatically detects process stdout, while a
   * named profile forces that capability. The policy also constrains SGR
   * already present in rendered text.
   *
   * @default false
   */
  readonly color?: boolean | ColorProfile;
}

/**
 * Render a component to a string synchronously, with no terminal session.
 *
 * - Writes nothing and installs no listeners; input, focus, and stream
 *   composables get inert services and `useApp().exit()` is a no-op.
 * - `<Static>` output is prepended to the dynamic output.
 * - Models 80x24 by default; pass `height: Infinity` for an unbounded document.
 *
 * @example Snapshot a component in a test
 * ```ts
 * expect(renderToString(Summary)).toContain("2 passed");
 * ```
 *
 * @example Render an unbounded document
 * ```ts
 * const report = renderToString(Report, { height: Infinity });
 * ```
 */
export function renderToString(component: Component, options?: RenderToStringOptions): string {
  return renderToStringInternal(component, normalizePublicOptions(options));
}

interface NormalizedStringOptions {
  readonly width: number;
  /** `null` is Runtime's private unbounded representation. */
  readonly height: number | null;
  readonly color: boolean | ColorProfile;
}

function renderToStringInternal(component: Component, options: NormalizedStringOptions): string {
  const nodeStyleFacts = options.color === true ? getDefaultNodeTerminalStyleFacts() : undefined;
  const terminalStyle =
    options.color === true
      ? resolveTerminalStyle({
          color: true,
          stdout: nodeStyleFacts!.stdout,
          environment: nodeStyleFacts!.environment,
        })
      : resolveTerminalStyle({ color: options.color });
  const renderSession = createStringRenderSessionService({
    columns: options.width,
    rows: options.height,
    terminalStyle,
  });
  const contexts = createNodeStringContexts();
  try {
    return renderStringDocument(component, options, renderSession, contexts, isNodeProduction());
  } finally {
    renderSession.dispose();
    contexts.dispose();
  }
}

function renderStringDocument(
  component: Component,
  options: NormalizedStringOptions,
  renderSession: InternalStringRenderSessionService,
  contexts: NodeStringContexts,
  isProduction: boolean,
): string {
  // Create a standalone root node with no live terminal bindings.
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
      isProduction: () => isProduction,
      hostYogaLifecycle: hostYogaLedger,
    }),
  );
  const app = renderer.createApp(component);
  let rootAttached = false;
  let renderCompleted = false;
  let treeUnmounted = false;
  let vnode: VNode | undefined;
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

    const layout = runLayoutTransaction({
      dynamicRoot: root,
      staticRoots: findStatics(root),
      columns: options.width,
      dynamicHeight:
        options.height === null ? { mode: "unbounded" } : { mode: "at-most", rows: options.height },
    });
    let output: string;
    let capturedStaticOutput = "";
    let preparedStatic: ReturnType<typeof prepareStaticOutput>;
    try {
      focusController.reconcileAfterLayout();
      // String rendering has no physical handoff. Snapshot every complete open
      // Static subtree after mount while its transaction-owned geometry is
      // available. Acceptance follows transaction disposal below so callbacks
      // cannot observe temporary Yoga parentage.
      preparedStatic = prepareStaticOutput(layout, renderSession.terminalStyle);
      capturedStaticOutput = encodeFrameHistory(preparedStatic.frames);

      // Paint the computed layout without manufacturing a hard paint viewport for
      // short documents. Yoga already applied a finite height bound when content
      // exceeded it; shorter output stays unpadded. Clip only by line count so
      // ordinary horizontal overflow behavior matches the previous unbounded paint.
      output = encodeFrame(
        paint(root, { layout: layout.computed, terminalStyle: renderSession.terminalStyle }),
      );
      if (options.height !== null && output !== "") {
        const lines = output.split("\n");
        if (lines.length > options.height) {
          output = lines.slice(0, options.height).join("\n");
        }
      }
    } finally {
      layout.dispose();
    }
    preparedStatic.accept();

    // Run component and host cleanup before deciding whether the first
    // uncaught lifecycle error should propagate to the caller.
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
    // Vue only takes container ownership after a successful patch, so this can
    // unmount only a tree Vue actually took ownership of. When the initial
    // synchronous patch throws, Vue never took that ownership and runs no
    // cleanup of its own; Runtime matches that instead of seeding the missing
    // link from Vue-private state. Runtime-owned resources are still released
    // by the Yoga ledger and the stream disposal below.
    if (!treeUnmounted && renderCompleted && vnode?.component) {
      try {
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
    color: normalizeColorOption(object.color, false, "renderToString"),
  };
}
