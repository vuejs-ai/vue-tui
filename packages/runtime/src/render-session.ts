import {
  inject,
  readonly,
  shallowReactive,
  shallowRef,
  type DeepReadonly,
  type InjectionKey,
  type ShallowRef,
} from "vue";
import type { TerminalSizeProbeResult } from "./terminal-size-probe.ts";

export type RenderMode = "inline" | "fullscreen";
export type RenderPresentation = "visual" | "screen-reader";

export interface RenderSize {
  readonly columns: number;
  readonly rows: number;
}

export interface RenderLayoutSize {
  readonly columns: number;
  readonly rows: number | null;
}

export interface RenderDimensions {
  readonly terminal: RenderSize | null;
  readonly layout: RenderLayoutSize;
}

export interface ResolvedLiveDimensions extends RenderDimensions {
  /**
   * Temporary numeric row projection for the current useWindowSize() API.
   * It is deliberately not part of the future public render-session facts:
   * Inline layout rows remain unbounded until F1.6.
   */
  readonly legacyWindowRows: number;
}

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
      readonly requested: "fullscreen";
      readonly effective: "inline";
      readonly fallback: "screen-reader-transcript";
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
      readonly presentation: RenderPresentation;
    }
  | {
      readonly destination: "stream";
      readonly dynamicUpdates: "live" | "at-teardown";
      readonly presentation: RenderPresentation;
    };

export interface StringRenderOutput {
  readonly destination: "document";
  readonly dynamicUpdates: "none";
  readonly presentation: RenderPresentation;
}

export interface RenderCapabilities {
  readonly stableOrigin: boolean;
  readonly elementHitTesting: boolean;
  readonly suspension: boolean;
}

export interface InternalLiveRenderSessionSnapshot {
  readonly host: "live";
  readonly mode: RenderModeResolution;
  readonly output: LiveRenderOutput;
  readonly dimensions: RenderDimensions;
  readonly capabilities: RenderCapabilities;
}

export interface InternalStringRenderSessionSnapshot {
  readonly host: "string";
  readonly mode: null;
  readonly output: StringRenderOutput;
  readonly dimensions: {
    readonly terminal: null;
    readonly layout: {
      readonly columns: number;
      readonly rows: null;
    };
  };
  readonly capabilities: {
    readonly stableOrigin: false;
    readonly elementHitTesting: false;
    readonly suspension: false;
  };
}

export type InternalRenderSessionSnapshot =
  | InternalLiveRenderSessionSnapshot
  | InternalStringRenderSessionSnapshot;

export interface LiveHostInput {
  readonly requestedMode: RenderMode;
  readonly liveUpdatesOverride: boolean | undefined;
  readonly isCI: boolean;
  readonly presentation: RenderPresentation;
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
      readonly reason: "live-updates-disabled" | "terminal-size-unavailable";
    })
  | (ResolvedLiveSurfaceBase & {
      readonly kind: "live-stream";
      readonly reason: "stdout-not-tty";
    })
  | (ResolvedLiveSurfaceBase & {
      readonly kind: "inline-terminal";
      readonly fallback: null | "screen-reader-transcript";
    })
  | (ResolvedLiveSurfaceBase & {
      readonly kind: "fullscreen-terminal";
    });

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

/** Validate the accepted mount-mode contract without reading any stream option. */
export function normalizeRequestedMode(options: object): RenderMode {
  for (const removedKey of ["fullscreen", "alternateScreen"] as const) {
    if (hasOwn(options, removedKey)) {
      throw new TypeError(
        `Mount option "${removedKey}" was removed; choose mode: "inline" or mode: "fullscreen".`,
      );
    }
  }
  if (hasOwn(options, "interactive")) {
    throw new TypeError(
      'Mount option "interactive" was removed; use "liveUpdates" only to override output cadence.',
    );
  }
  if (hasOwn(options, "debug")) {
    throw new TypeError(
      'Mount option "debug" was removed; use "liveUpdates" for output cadence and @vue-tui/testing for deterministic content frames.',
    );
  }

  const mode = (options as { readonly mode?: unknown }).mode;
  if (mode === undefined) return "inline";
  if (mode === "inline" || mode === "fullscreen") return mode;

  throw new TypeError('Mount option "mode" must be "inline", "fullscreen", or undefined.');
}

export function validateLiveUpdates(value: unknown): boolean | undefined {
  if (value === undefined || typeof value === "boolean") return value;
  throw new TypeError('Mount option "liveUpdates" must be a boolean or undefined.');
}

function positiveCellCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function needsTerminalSizeProbe(stdout: LiveHostInput["stdout"]): boolean {
  return positiveCellCount(stdout.columns) === null || positiveCellCount(stdout.rows) === null;
}

export function resolveLiveDimensions(
  stdout: LiveHostInput["stdout"],
  probe: TerminalSizeProbeResult,
): ResolvedLiveDimensions {
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
  const terminal = stdout.isTTY ? (stdoutSize ?? probeSize) : null;
  const layoutColumns = terminal?.columns ?? stdoutColumns ?? probeColumns ?? 80;
  const legacyWindowRows = terminal?.rows ?? stdoutRows ?? probeRows ?? 24;

  return {
    terminal,
    layout: { columns: layoutColumns, rows: null },
    legacyWindowRows,
  };
}

function sessionSnapshot(options: {
  mode: RenderModeResolution;
  output: LiveRenderOutput;
  dimensions: RenderDimensions;
  capabilities: RenderCapabilities;
}): InternalLiveRenderSessionSnapshot {
  return {
    host: "live",
    mode: options.mode,
    output: options.output,
    dimensions: {
      terminal: options.dimensions.terminal,
      layout: options.dimensions.layout,
    },
    capabilities: options.capabilities,
  };
}

const unavailableCapabilities: RenderCapabilities = {
  stableOrigin: false,
  elementHitTesting: false,
  suspension: false,
};

export function resolveLiveSurface(input: LiveHostInput): ResolvedLiveSurface {
  const dimensions = resolveLiveDimensions(input.stdout, input.terminalProbe);
  const liveUpdates = input.liveUpdatesOverride ?? (!input.isCI && input.stdout.isTTY);

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
          presentation: input.presentation,
        },
        dimensions,
        capabilities: unavailableCapabilities,
      }),
    };
  }

  if (!input.stdout.isTTY) {
    const reason = "stdout-not-tty" as const;
    return {
      kind: "live-stream",
      reason,
      liveUpdatesRequested: liveUpdates,
      dimensions,
      session: sessionSnapshot({
        mode: { requested: input.requestedMode, effective: null, fallback: reason },
        output: {
          destination: "stream",
          dynamicUpdates: "live",
          presentation: input.presentation,
        },
        dimensions,
        capabilities: unavailableCapabilities,
      }),
    };
  }

  if (input.presentation === "screen-reader") {
    const isFullscreenRequest = input.requestedMode === "fullscreen";
    const fallback = isFullscreenRequest ? "screen-reader-transcript" : null;
    const mode: RenderModeResolution = isFullscreenRequest
      ? { requested: "fullscreen", effective: "inline", fallback: "screen-reader-transcript" }
      : { requested: "inline", effective: "inline", fallback: null };
    return {
      kind: "inline-terminal",
      fallback,
      liveUpdatesRequested: liveUpdates,
      dimensions,
      session: sessionSnapshot({
        mode,
        output: {
          destination: "terminal",
          dynamicUpdates: "live",
          presentation: "screen-reader",
        },
        dimensions,
        capabilities: unavailableCapabilities,
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
          presentation: "visual",
        },
        dimensions,
        capabilities: unavailableCapabilities,
      }),
    };
  }

  if (input.requestedMode === "fullscreen") {
    const fullscreenDimensions: ResolvedLiveDimensions = {
      terminal: dimensions.terminal,
      layout: dimensions.terminal,
      legacyWindowRows: dimensions.legacyWindowRows,
    };
    return {
      kind: "fullscreen-terminal",
      liveUpdatesRequested: liveUpdates,
      dimensions: fullscreenDimensions,
      session: sessionSnapshot({
        mode: { requested: "fullscreen", effective: "fullscreen", fallback: null },
        output: {
          destination: "terminal",
          dynamicUpdates: "live",
          presentation: "visual",
        },
        dimensions: fullscreenDimensions,
        capabilities: {
          stableOrigin: true,
          elementHitTesting: true,
          suspension: false,
        },
      }),
    };
  }

  return {
    kind: "inline-terminal",
    fallback: null,
    liveUpdatesRequested: liveUpdates,
    dimensions,
    session: sessionSnapshot({
      mode: { requested: "inline", effective: "inline", fallback: null },
      output: {
        destination: "terminal",
        dynamicUpdates: "live",
        presentation: "visual",
      },
      dimensions,
      capabilities: unavailableCapabilities,
    }),
  };
}

type MutableLiveRenderSession = Omit<
  InternalLiveRenderSessionSnapshot,
  "dimensions" | "capabilities"
> & {
  dimensions: RenderDimensions;
  capabilities: RenderCapabilities;
};

interface InternalRenderSessionServiceBase {
  readonly session: DeepReadonly<InternalRenderSessionSnapshot>;
  readonly legacyWindowRows: Readonly<ShallowRef<number>>;
  dispose(): void;
}

export interface InternalLiveRenderSessionService extends InternalRenderSessionServiceBase {
  readonly session: DeepReadonly<InternalLiveRenderSessionSnapshot>;
  updateDimensions(next: ResolvedLiveDimensions): void;
  updateElementHitTesting(value: boolean): void;
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
    capabilities: Object.freeze({ ...initial.capabilities }),
  });
  const legacyWindowRows = shallowRef(surface.dimensions.legacyWindowRows);
  const publicLegacyWindowRows = readonly(legacyWindowRows);
  let disposed = false;

  return {
    session: readonly(state) as DeepReadonly<InternalLiveRenderSessionSnapshot>,
    legacyWindowRows: publicLegacyWindowRows,
    updateDimensions(next) {
      if (disposed) return;
      state.dimensions = frozenDimensions(next);
      legacyWindowRows.value = next.legacyWindowRows;
    },
    updateElementHitTesting(value) {
      if (disposed || state.capabilities.elementHitTesting === value) return;
      state.capabilities = Object.freeze({ ...state.capabilities, elementHitTesting: value });
    },
    dispose() {
      disposed = true;
    },
  };
}

export function createStringRenderSessionService(options: {
  readonly columns: number;
  readonly presentation: RenderPresentation;
}): InternalStringRenderSessionService {
  const state = shallowReactive<InternalStringRenderSessionSnapshot>({
    host: "string",
    mode: null,
    output: Object.freeze({
      destination: "document",
      dynamicUpdates: "none",
      presentation: options.presentation,
    }),
    dimensions: Object.freeze({
      terminal: null,
      layout: Object.freeze({ columns: options.columns, rows: null }),
    }),
    capabilities: Object.freeze({
      stableOrigin: false,
      elementHitTesting: false,
      suspension: false,
    }),
  });
  // useWindowSize() remains public until F1.8 and still requires a numeric row
  // value. A document has no bounded rows, so keep the deliberate 24-row value
  // as a temporary projection without placing it in the truthful session.
  const legacyWindowRows = readonly(shallowRef(24));
  return {
    session: readonly(state) as DeepReadonly<InternalStringRenderSessionSnapshot>,
    legacyWindowRows,
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
