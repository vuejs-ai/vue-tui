import type { TerminalBackend, TerminalOutput } from "../terminal/backend.ts";
import type { FrameWriter } from "./frame-writer.ts";
import type { ResolvedLiveSurface } from "./surface-types.ts";

/** Static/history output already prepared by Runtime's host tree. */
export interface SurfaceHistory {
  readonly output: string;
  handoff(onHandoff?: () => void): void;
}

/** One dynamic frame plus any history that must be handed off beside it. */
export interface SurfacePresentation {
  readonly frame: string;
  readonly history: SurfaceHistory;
  readonly onHistoryHandoff?: () => void;
  readonly onHistoryPrepared?: () => void;
}

/** Runtime operations a surface needs while it writes through the terminal boundary. */
export interface SurfaceRuntime {
  readonly terminal: TerminalBackend;
  readonly stdout: TerminalOutput;
  readonly isResumeInProgress: boolean;
  readonly isStdoutTty: boolean;
  readonly isStdoutWritable: boolean;
  readonly viewportColumns: number;
  readonly viewportRows: number | null;
  write(output: TerminalOutput, data: string, onHandoff?: () => void): boolean;
  writeBestEffort(
    output: TerminalOutput,
    data: string,
    sync: boolean,
    onHandoff?: () => void,
  ): boolean;
  /** Track both a physical write attempt and its later confirmed handoff. */
  writeTerminal(data: string, onAccepted?: () => void, onAttempt?: () => void): boolean;
  runCoordinatedWrite(body: () => void, finalize: () => void): void;
  runLifecycleTransaction<T>(operation: () => T): T;
  runSynchronizedOutput(body: () => void): void;
  requestTerminalReconcile(): void;
  reportTerminalAcquired(): void;
  reportTerminalReleased(): void;
  setSurfaceAvailable(available: boolean): void;
}

/** A live terminal resize observed by the session coordinator. */
export interface SurfaceResize {
  readonly currentColumns: number;
  readonly currentRows: number | null;
  readonly mappingChanged: boolean;
  readonly previousColumns: number;
}

export interface SurfaceDisposeOptions {
  readonly cleanExit: boolean;
  readonly sync: boolean;
}

/** The one layout-height policy a surface supplies to the session. */
export type SurfaceLayoutHeight =
  | { readonly mode: "exact"; readonly rows: number }
  | { readonly mode: "at-most"; readonly rows: number }
  | { readonly mode: "unbounded" };

/** Shared contract for one mounted output target. */
export interface Surface {
  readonly kind: ResolvedLiveSurface["kind"];
  /** Whether a rendered frame can be shown before teardown. */
  readonly isLive: boolean;
  /** Whether `Static` and coordinated output become terminal history here. */
  readonly acceptsHistory: boolean;
  /** Whether Fullscreen's terminal lease is currently ready for managed input. */
  readonly isInputReady: boolean;
  attachWriter(writer: FrameWriter): void;
  layoutHeight(viewportRows: number | null): SurfaceLayoutHeight;
  limitFrame(frame: string, viewportRows?: number): string;
  present(presentation: SurfacePresentation, runtime: SurfaceRuntime): boolean;
  handoffHistory(output: TerminalOutput, data: string, runtime: SurfaceRuntime): void;
  suspend(runtime: SurfaceRuntime): void;
  resume(runtime: SurfaceRuntime): boolean;
  dispose(runtime: SurfaceRuntime, options: SurfaceDisposeOptions): void;
  resize(runtime: SurfaceRuntime, resize: SurfaceResize): void;
  abandonPendingOutput(options?: { readonly physicalStateUncertain?: boolean }): void;
  /** Restore logical output facts after an unhanded transaction. */
  createRollback(): () => void;
}

/** Shared frame bookkeeping, owned separately by each concrete surface. */
export abstract class SurfaceBase implements Surface {
  abstract readonly kind: ResolvedLiveSurface["kind"];
  abstract readonly isLive: boolean;

  readonly acceptsHistory: boolean = true;

  private writer: FrameWriter | undefined;

  private frame = "";

  protected get lastFrame(): string {
    return this.frame;
  }

  get isInputReady(): boolean {
    return true;
  }

  attachWriter(writer: FrameWriter): void {
    this.writer = writer;
  }

  protected getWriter(): FrameWriter {
    if (!this.writer)
      throw new Error(`${this.kind} surface was used before its writer was attached`);
    return this.writer;
  }

  protected getAttachedWriter(): FrameWriter | undefined {
    return this.writer;
  }

  protected rememberFrame(frame: string): void {
    this.frame = frame;
  }

  protected forgetFrame(): void {
    this.rememberFrame("");
  }

  protected createFrameRollback(): () => void {
    const frame = this.frame;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.frame = frame;
    };
  }

  createRollback(): () => void {
    const rollbackFrame = this.createFrameRollback();
    const rollbackWriter = this.writer?.createRollback();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      rollbackWriter?.();
      rollbackFrame();
    };
  }

  abstract layoutHeight(viewportRows: number | null): SurfaceLayoutHeight;
  abstract limitFrame(frame: string, viewportRows?: number): string;
  abstract present(presentation: SurfacePresentation, runtime: SurfaceRuntime): boolean;
  abstract handoffHistory(output: TerminalOutput, data: string, runtime: SurfaceRuntime): void;
  abstract suspend(runtime: SurfaceRuntime): void;
  abstract resume(runtime: SurfaceRuntime): boolean;
  abstract dispose(runtime: SurfaceRuntime, options: SurfaceDisposeOptions): void;
  abstract resize(runtime: SurfaceRuntime, resize: SurfaceResize): void;

  abandonPendingOutput(_options?: { readonly physicalStateUncertain?: boolean }): void {
    // Most surfaces have no asynchronous physical acquisition to abandon.
  }
}
