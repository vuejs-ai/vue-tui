import { inject, readonly, shallowReactive, type DeepReadonly, type InjectionKey } from "vue";
import { MAX_LAYOUT_VALUE } from "./numeric-limits.ts";
import type { TerminalSizeProbeResult } from "./terminal-size-probe.ts";

/** The terminal screen model requested when an application mounts. */
export type RenderMode = "inline" | "fullscreen";

/** A terminal or deliberately modeled terminal's character-cell dimensions. */
export interface RenderSize {
  readonly columns: number;
  readonly rows: number;
}

/** The root area the renderer promises to lay out. `rows: null` is unbounded. */
export interface RenderLayoutSize {
  readonly columns: number;
  readonly rows: number | null;
}

export interface RenderDimensions {
  readonly terminal: RenderSize | null;
  readonly layout: RenderLayoutSize;
}

export type ResolvedLiveDimensions = RenderDimensions;

/** The requested mode, the mode actually acquired, and any fallback reason. */
export type RenderModeResolution =
  | {
      readonly requested: "inline";
      readonly effective: "inline";
      readonly fallback: null;
    }
  | {
      readonly requested: "fullscreen";
      readonly effective: "fullscreen";
      readonly fallback: null;
    }
  | {
      readonly requested: RenderMode;
      readonly effective: null;
      readonly fallback: "live-updates-disabled" | "stdout-not-tty" | "terminal-size-unavailable";
    };

export type LiveRenderOutput =
  | {
      readonly destination: "terminal";
      readonly dynamicUpdates: "live";
    }
  | {
      readonly destination: "stream";
      readonly dynamicUpdates: "live" | "at-teardown";
    };

export interface StringRenderOutput {
  readonly destination: "document";
  readonly dynamicUpdates: "none";
}

/** Where output goes and when dynamic frames are emitted. */
export type RenderOutput = LiveRenderOutput | StringRenderOutput;

export interface LiveRenderSession {
  readonly host: "live";
  readonly mode: RenderModeResolution;
  readonly output: LiveRenderOutput;
  readonly dimensions: RenderDimensions;
}

export interface StringRenderSession {
  readonly host: "string";
  readonly mode: null;
  readonly output: StringRenderOutput;
  readonly dimensions: {
    readonly terminal: null;
    readonly layout: RenderLayoutSize;
  };
}

/** Readonly reactive facts for one live or synchronous string render tree. */
export type RenderSession = LiveRenderSession | StringRenderSession;

export type InternalLiveRenderSessionSnapshot = LiveRenderSession;
export type InternalStringRenderSessionSnapshot = StringRenderSession;
export type InternalRenderSessionSnapshot = RenderSession;

export interface LiveHostInput {
  readonly requestedMode: RenderMode;
  readonly liveUpdatesOverride: boolean | undefined;
  readonly stdout: {
    readonly isTTY: boolean;
    readonly columns: unknown;
    readonly rows: unknown;
  };
  readonly terminalProbe: TerminalSizeProbeResult;
}

interface ResolvedLiveSurfaceBase {
  readonly liveUpdatesRequested: boolean;
  readonly dimensions: ResolvedLiveDimensions;
  readonly session: InternalLiveRenderSessionSnapshot;
}

export type ResolvedLiveSurface =
  | (ResolvedLiveSurfaceBase & {
      readonly kind: "final-stream";
      readonly reason: "live-updates-disabled" | "terminal-size-unavailable" | "stdout-not-tty";
    })
  | (ResolvedLiveSurfaceBase & {
      readonly kind: "live-stream";
      readonly reason: "stdout-not-tty";
    })
  | (ResolvedLiveSurfaceBase & {
      readonly kind: "inline-terminal";
    })
  | (ResolvedLiveSurfaceBase & {
      readonly kind: "fullscreen-terminal";
    });

/** Validate the accepted mount-mode contract without reading any stream option. */
export function normalizeRequestedMode(options: object): RenderMode {
  const mode = (options as { readonly mode?: unknown }).mode;
  if (mode === undefined) return "inline";
  if (mode === "inline" || mode === "fullscreen") return mode;

  throw new TypeError('Mount option "mode" must be "inline", "fullscreen", or undefined.');
}

export function validateLiveUpdates(value: unknown): boolean | undefined {
  if (value === undefined || typeof value === "boolean") return value;
  throw new TypeError('Mount option "liveUpdates" must be a boolean or undefined.');
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
export const MODELED_DOCUMENT_LAYOUT = Object.freeze({ columns: 80, rows: 24 }) as RenderLayoutSize;

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
    layout: { columns: layoutColumns, rows: null },
  };
}

function sessionSnapshot(options: {
  mode: RenderModeResolution;
  output: LiveRenderOutput;
  dimensions: RenderDimensions;
}): InternalLiveRenderSessionSnapshot {
  return {
    host: "live",
    mode: options.mode,
    output: options.output,
    dimensions: {
      terminal: options.dimensions.terminal,
      layout: options.dimensions.layout,
    },
  };
}

export function resolveLiveSurface(input: LiveHostInput): ResolvedLiveSurface {
  const dimensions = resolveLiveDimensions(input.stdout, input.terminalProbe);
  // Fullscreen on a live TTY always uses live updates; the internal liveUpdates
  // override cannot demote it. On non-TTY stdout the supported document host is
  // selected instead and never owns a screen.
  const liveUpdates =
    input.stdout.isTTY && input.requestedMode === "fullscreen"
      ? true
      : (input.liveUpdatesOverride ?? input.stdout.isTTY);

  // Non-TTY stdout is the supported secondary document host for both Inline and
  // Fullscreen requests: fixed modeled 80×24, no terminal mode, no intermediate
  // dynamic frames unless an internal liveUpdates override forces live stream tests.
  if (!input.stdout.isTTY) {
    const documentDimensions: ResolvedLiveDimensions = {
      terminal: null,
      layout: { columns: MODELED_DOCUMENT_LAYOUT.columns, rows: MODELED_DOCUMENT_LAYOUT.rows },
    };
    if (liveUpdates && input.liveUpdatesOverride === true) {
      const reason = "stdout-not-tty" as const;
      return {
        kind: "live-stream",
        reason,
        liveUpdatesRequested: true,
        dimensions: documentDimensions,
        session: sessionSnapshot({
          mode: { requested: input.requestedMode, effective: null, fallback: reason },
          output: {
            destination: "stream",
            dynamicUpdates: "live",
          },
          dimensions: documentDimensions,
        }),
      };
    }
    const reason = "stdout-not-tty" as const;
    return {
      kind: "final-stream",
      reason,
      liveUpdatesRequested: false,
      dimensions: documentDimensions,
      session: sessionSnapshot({
        mode: { requested: input.requestedMode, effective: null, fallback: reason },
        output: {
          destination: "stream",
          dynamicUpdates: "at-teardown",
        },
        dimensions: documentDimensions,
      }),
    };
  }

  if (!liveUpdates) {
    const reason = "live-updates-disabled" as const;
    return {
      kind: "final-stream",
      reason,
      liveUpdatesRequested: liveUpdates,
      dimensions,
      session: sessionSnapshot({
        mode: { requested: input.requestedMode, effective: null, fallback: reason },
        output: {
          destination: "stream",
          dynamicUpdates: "at-teardown",
        },
        dimensions,
      }),
    };
  }

  if (dimensions.terminal === null) {
    const reason = "terminal-size-unavailable" as const;
    return {
      kind: "final-stream",
      reason,
      liveUpdatesRequested: liveUpdates,
      dimensions,
      session: sessionSnapshot({
        mode: { requested: input.requestedMode, effective: null, fallback: reason },
        output: {
          destination: "stream",
          dynamicUpdates: "at-teardown",
        },
        dimensions,
      }),
    };
  }

  const terminalBoundedDimensions: ResolvedLiveDimensions = {
    terminal: dimensions.terminal,
    layout: dimensions.terminal,
  };

  if (input.requestedMode === "fullscreen") {
    return {
      kind: "fullscreen-terminal",
      liveUpdatesRequested: liveUpdates,
      dimensions: terminalBoundedDimensions,
      session: sessionSnapshot({
        mode: { requested: "fullscreen", effective: "fullscreen", fallback: null },
        output: {
          destination: "terminal",
          dynamicUpdates: "live",
        },
        dimensions: terminalBoundedDimensions,
      }),
    };
  }

  return {
    kind: "inline-terminal",
    liveUpdatesRequested: liveUpdates,
    dimensions: terminalBoundedDimensions,
    session: sessionSnapshot({
      mode: { requested: "inline", effective: "inline", fallback: null },
      output: {
        destination: "terminal",
        dynamicUpdates: "live",
      },
      dimensions: terminalBoundedDimensions,
    }),
  };
}

type MutableLiveRenderSession = Omit<InternalLiveRenderSessionSnapshot, "dimensions"> & {
  dimensions: RenderDimensions;
};

interface InternalRenderSessionServiceBase {
  readonly session: DeepReadonly<InternalRenderSessionSnapshot>;
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
): InternalLiveRenderSessionService {
  const initial = surface.session;
  const state = shallowReactive<MutableLiveRenderSession>({
    host: "live",
    mode: Object.freeze({ ...initial.mode }) as RenderModeResolution,
    output: Object.freeze({ ...initial.output }) as LiveRenderOutput,
    dimensions: frozenDimensions(initial.dimensions),
  });
  let disposed = false;

  return {
    session: readonly(state) as DeepReadonly<InternalLiveRenderSessionSnapshot>,
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
}): InternalStringRenderSessionService {
  const state = shallowReactive<InternalStringRenderSessionSnapshot>({
    host: "string",
    mode: null,
    output: Object.freeze({
      destination: "document",
      dynamicUpdates: "none",
    }),
    dimensions: Object.freeze({
      terminal: null,
      layout: Object.freeze({ columns: options.columns, rows: options.rows }),
    }),
  });
  return {
    session: readonly(state) as DeepReadonly<InternalStringRenderSessionSnapshot>,
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
