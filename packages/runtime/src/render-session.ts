import { inject, readonly, shallowReactive, type DeepReadonly, type InjectionKey } from "vue";
import type { TerminalStyle } from "./paint/terminal-style.ts";
import { MAX_LAYOUT_VALUE } from "./layout/numeric-limits.ts";
import type {
  ResolvedLiveDimensions,
  ResolvedLiveSurface,
  SurfaceLayoutSize,
  SurfaceSize,
} from "./surface/surface-types.ts";
import type { TerminalSizeProbeResult } from "./terminal/node/terminal-size-probe.ts";

export type { ResolvedLiveDimensions, ResolvedLiveSurface } from "./surface/surface-types.ts";

/** The terminal screen model requested when an application mounts. */
export type RenderMode = "inline" | "fullscreen";

export type RenderSize = SurfaceSize;
export type RenderLayoutSize = SurfaceLayoutSize;
export type RenderDimensions = ResolvedLiveDimensions;

/**
 * Reactive root-layout dimensions for one mounted live render tree.
 * Live vs document behavior is derived from the resolved surface kind, not from
 * snapshot host/mode/output mirrors.
 */
export interface InternalLiveRenderSessionSnapshot {
  readonly dimensions: RenderDimensions;
}

/** Fixed dimensions for one synchronous string render tree. */
export interface InternalStringRenderSessionSnapshot {
  readonly dimensions: {
    readonly terminal: null;
    readonly layout: RenderLayoutSize;
  };
}

export type InternalRenderSessionSnapshot =
  | InternalLiveRenderSessionSnapshot
  | InternalStringRenderSessionSnapshot;

export interface LiveHostInput {
  readonly requestedMode: RenderMode;
  readonly stdout: {
    readonly isTTY: boolean;
    readonly columns: unknown;
    readonly rows: unknown;
  };
  readonly terminalProbe: TerminalSizeProbeResult;
}

/** Validate the accepted mount-mode contract without reading any stream option. */
export function normalizeRequestedMode(options: object): RenderMode {
  const mode = (options as { readonly mode?: unknown }).mode;
  if (mode === undefined) return "inline";
  if (mode === "inline" || mode === "fullscreen") return mode;

  throw new TypeError('Mount option "mode" must be "inline", "fullscreen", or undefined.');
}

export function validateExitOnCtrlC(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  throw new TypeError('Mount option "exitOnCtrlC" must be a boolean or undefined.');
}

function positiveCellCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_LAYOUT_VALUE
    ? value
    : null;
}

export function needsTerminalSizeProbe(stdout: LiveHostInput["stdout"]): boolean {
  return positiveCellCount(stdout.columns) === null || positiveCellCount(stdout.rows) === null;
}

/** Fixed modeled document layout shared by default `renderToString()` and non-TTY mounts. */
export const MODELED_DOCUMENT_LAYOUT = Object.freeze({
  columns: 80,
  rows: 24,
} satisfies RenderLayoutSize);

export function resolveLiveDimensions(
  stdout: LiveHostInput["stdout"],
  probe: TerminalSizeProbeResult,
): ResolvedLiveDimensions {
  // Non-TTY mounts use the supported secondary document host with a fixed
  // modeled 80×24 root. Stream-reported columns/rows are not live layout facts.
  if (!stdout.isTTY) {
    return {
      terminal: null,
      layout: { columns: MODELED_DOCUMENT_LAYOUT.columns, rows: MODELED_DOCUMENT_LAYOUT.rows },
    };
  }

  const stdoutColumns = positiveCellCount(stdout.columns);
  const stdoutRows = positiveCellCount(stdout.rows);
  const probeColumns = probe.kind === "detected" ? positiveCellCount(probe.size.columns) : null;
  const probeRows = probe.kind === "detected" ? positiveCellCount(probe.size.rows) : null;
  const stdoutSize =
    stdoutColumns !== null && stdoutRows !== null
      ? { columns: stdoutColumns, rows: stdoutRows }
      : null;
  const probeSize =
    probeColumns !== null && probeRows !== null ? { columns: probeColumns, rows: probeRows } : null;
  // A physical terminal size is one coherent observation. Never splice a
  // column from one source together with a row from another source and then
  // claim the result as an addressable viewport.
  const terminal = stdoutSize ?? probeSize;
  const layoutColumns = terminal?.columns ?? stdoutColumns ?? probeColumns ?? 80;

  return {
    terminal,
    // Every mounted host exposes a finite root-layout height. A live terminal
    // uses its coherent detected height; an unavailable size falls back to the
    // same conventional modeled height as the document host. Only an explicit
    // renderToString({ height: Infinity }) selects the private null sentinel.
    layout: {
      columns: layoutColumns,
      rows: terminal?.rows ?? MODELED_DOCUMENT_LAYOUT.rows,
    },
  };
}

/**
 * Resolve the supported mounted surface from host facts.
 *
 * - Non-TTY stdout → document final-stream (modeled 80×24).
 * - TTY Inline → live `inline-terminal` (modeled layout when physical size is missing).
 * - TTY Fullscreen → live `fullscreen-terminal`.
 *
 * Surface kind is decided by host facts alone: TTY is always live and non-TTY
 * is always the document final host.
 */
export function resolveLiveSurface(input: LiveHostInput): ResolvedLiveSurface {
  const dimensions = resolveLiveDimensions(input.stdout, input.terminalProbe);

  if (!input.stdout.isTTY) {
    const documentDimensions: ResolvedLiveDimensions = {
      terminal: null,
      layout: { columns: MODELED_DOCUMENT_LAYOUT.columns, rows: MODELED_DOCUMENT_LAYOUT.rows },
    };
    return {
      kind: "final-stream",
      reason: "stdout-not-tty",
      dimensions: documentDimensions,
    };
  }

  // Prefer a coherent physical viewport when present; otherwise keep live
  // surface kind with the modeled layout already chosen by resolveLiveDimensions.
  const surfaceDimensions: ResolvedLiveDimensions =
    dimensions.terminal !== null
      ? { terminal: dimensions.terminal, layout: dimensions.terminal }
      : dimensions;

  if (input.requestedMode === "fullscreen") {
    return {
      kind: "fullscreen-terminal",
      dimensions: surfaceDimensions,
    };
  }

  return {
    kind: "inline-terminal",
    dimensions: surfaceDimensions,
  };
}

type MutableLiveRenderSession = {
  dimensions: RenderDimensions;
};

interface InternalRenderSessionServiceBase {
  readonly session: DeepReadonly<InternalRenderSessionSnapshot>;
  readonly terminalStyle: TerminalStyle;
  dispose(): void;
}

export interface InternalLiveRenderSessionService extends InternalRenderSessionServiceBase {
  readonly session: DeepReadonly<InternalLiveRenderSessionSnapshot>;
  updateDimensions(next: ResolvedLiveDimensions): void;
}

export interface InternalStringRenderSessionService extends InternalRenderSessionServiceBase {
  readonly session: DeepReadonly<InternalStringRenderSessionSnapshot>;
}

export type InternalRenderSessionService =
  | InternalLiveRenderSessionService
  | InternalStringRenderSessionService;

function frozenDimensions(dimensions: RenderDimensions): RenderDimensions {
  return Object.freeze({
    terminal: dimensions.terminal === null ? null : Object.freeze({ ...dimensions.terminal }),
    layout: Object.freeze({ ...dimensions.layout }),
  });
}

export function createLiveRenderSessionService(
  surface: ResolvedLiveSurface,
  terminalStyle: TerminalStyle,
): InternalLiveRenderSessionService {
  const state = shallowReactive<MutableLiveRenderSession>({
    dimensions: frozenDimensions(surface.dimensions),
  });
  let disposed = false;

  return {
    session: readonly(state) as DeepReadonly<InternalLiveRenderSessionSnapshot>,
    terminalStyle,
    updateDimensions(next) {
      if (disposed) return;
      state.dimensions = frozenDimensions(next);
    },
    dispose() {
      disposed = true;
    },
  };
}

export function createStringRenderSessionService(options: {
  readonly columns: number;
  /** `null` is Runtime's private unbounded vertical layout representation. */
  readonly rows: number | null;
  readonly terminalStyle: TerminalStyle;
}): InternalStringRenderSessionService {
  const state = shallowReactive<InternalStringRenderSessionSnapshot>({
    dimensions: Object.freeze({
      terminal: null,
      layout: Object.freeze({ columns: options.columns, rows: options.rows }),
    }),
  });
  return {
    session: readonly(state) as DeepReadonly<InternalStringRenderSessionSnapshot>,
    terminalStyle: options.terminalStyle,
    dispose() {
      // The readonly snapshot remains valid after the synchronous tree is gone.
    },
  };
}

export const InternalRenderSessionKey: InjectionKey<InternalRenderSessionService> =
  Symbol("vue-tui:render-session");

export function useOptionalInternalRenderSession(): InternalRenderSessionService | undefined {
  return inject(InternalRenderSessionKey, undefined);
}

export function useInternalRenderSession(): InternalRenderSessionService {
  const service = useOptionalInternalRenderSession();
  if (!service) {
    throw new Error("render session is unavailable outside a vue-tui render tree");
  }
  return service;
}
