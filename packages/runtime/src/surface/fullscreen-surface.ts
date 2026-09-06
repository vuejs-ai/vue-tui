import ansiEscapes from "ansi-escapes";
import { Frame } from "../frame/frame.ts";
import type { TerminalLease, TerminalOutput } from "../terminal/backend.ts";
import { encodeFrame, encodeFrameRow } from "./frame-encoder.ts";
import {
  SurfaceBase,
  type SurfaceDisposeOptions,
  type SurfaceLayoutHeight,
  type SurfacePresentation,
  type SurfaceResize,
  type SurfaceRuntime,
} from "./surface-contract.ts";

/** The fixed alternate-screen viewport surface. */
export class FullscreenSurface extends SurfaceBase {
  readonly kind = "fullscreen-terminal";
  readonly isLive = true;
  readonly acceptsHistory = false;

  private alternateScreenLease: TerminalLease<"alternate-screen"> | undefined;
  private cursorVisibilityLease: TerminalLease<"cursor-visibility"> | undefined;
  private baselineValid = false;
  private baselineColumns: number | null = null;
  private baselineRows: number | null = null;

  get isInputReady(): boolean {
    return (
      this.terminal.isModeActive("alternate-screen") &&
      this.terminal.isModeActive("cursor-visibility")
    );
  }

  layoutHeight(viewportRows: number | null): SurfaceLayoutHeight {
    return viewportRows === null ? { mode: "unbounded" } : { mode: "exact", rows: viewportRows };
  }

  present(presentation: SurfacePresentation, runtime: SurfaceRuntime): boolean {
    return this.repaint(
      presentation.frame,
      runtime,
      presentation.encoded === undefined ? {} : { encoded: presentation.encoded },
    );
  }

  handoffHistory(output: TerminalOutput, data: string, runtime: SurfaceRuntime): void {
    if (data === "") return;
    const frame = this.previousFrame;
    this.repaint(frame, runtime, {
      forceFull: true,
      writeBefore: () => runtime.write(output, data),
    });
  }

  suspend(runtime: SurfaceRuntime): void {
    this.baselineValid = false;
    runtime.setSurfaceAvailable(false);
    this.releaseAlternateScreen(true);
    this.releaseCursorVisibility(true);
    try {
      this.getAttachedWriter()?.reset();
    } catch {
      // Continue the release sequence when log-update has already lost its
      // physical baseline to a failed terminal transaction.
    }
    this.forgetFrame();
    runtime.reportTerminalReleased();
  }

  resume(_runtime: SurfaceRuntime): boolean {
    return this.ensureTerminalLease();
  }

  dispose(runtime: SurfaceRuntime, options: SurfaceDisposeOptions): void {
    const writer = this.getAttachedWriter();
    // Each release stands alone: a throw here must not cost the terminal its
    // main screen or its cursor, which the two releases below restore. The
    // failure is still the teardown's, so it is raised once they have run.
    let releaseFailure: { readonly error: unknown } | undefined;
    if (writer && runtime.isStdoutWritable) {
      try {
        if (options.sync) writer.reset();
        else writer.done();
      } catch (error) {
        releaseFailure = { error };
      }
    }
    this.releaseAlternateScreen(options.sync);
    this.releaseCursorVisibility(options.sync);
    if (releaseFailure) throw releaseFailure.error;
  }

  resize(_runtime: SurfaceRuntime, resize: SurfaceResize): void {
    if (resize.mappingChanged) this.baselineValid = false;
  }

  override createRollback(): () => void {
    const rollbackBase = super.createRollback();
    const snapshot = {
      baselineColumns: this.baselineColumns,
      baselineRows: this.baselineRows,
      baselineValid: this.baselineValid,
    };
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      rollbackBase();
      // Output rollback restores logical frame facts. The physical mode facts
      // belong to the leases, which stay owned: an acquisition may have reached
      // the terminal before a later segment failed.
      this.baselineColumns = snapshot.baselineColumns;
      this.baselineRows = snapshot.baselineRows;
      this.baselineValid = snapshot.baselineValid;
    };
  }

  /**
   * Take the viewport's two modes. Acquisition issues the alternate-screen and
   * hide-cursor sequences; the return value reports whether the device has them,
   * or is about to once the open transaction hands off.
   */
  private ensureTerminalLease(): boolean {
    if (!this.terminal.isModeActive("alternate-screen")) this.baselineValid = false;
    this.alternateScreenLease ??= this.terminal.acquire("alternate-screen");
    this.cursorVisibilityLease ??= this.terminal.acquire("cursor-visibility");
    return (
      this.terminal.isModeSettled("alternate-screen") &&
      this.terminal.isModeSettled("cursor-visibility")
    );
  }

  /** The sole alternate-screen release path, paired with its acquisition above. */
  private releaseAlternateScreen(sync: boolean): void {
    const lease = this.alternateScreenLease;
    this.alternateScreenLease = undefined;
    try {
      lease?.release({ sync });
    } catch {
      // Restoring the main screen is best effort; the cursor release below and
      // the rest of teardown still have to run.
    }
  }

  private releaseCursorVisibility(sync: boolean): void {
    const lease = this.cursorVisibilityLease;
    this.cursorVisibilityLease = undefined;
    try {
      lease?.release({ sync });
    } catch {
      // Revealing the cursor is best effort; teardown continues either way.
    }
  }

  private repaint(
    frame: Frame | undefined,
    runtime: SurfaceRuntime,
    options: {
      readonly encoded?: string;
      readonly forceFull?: boolean;
      readonly writeBefore?: () => void;
    } = {},
  ): boolean {
    const dimensionsMatch =
      this.baselineColumns === runtime.viewportColumns &&
      this.baselineRows === runtime.viewportRows;
    const difference = frame ? Frame.diff(this.previousFrame, frame) : undefined;
    if (
      options.writeBefore === undefined &&
      this.baselineValid &&
      dimensionsMatch &&
      difference !== undefined &&
      !difference.sizeChanged &&
      difference.rows.length === 0
    ) {
      return false;
    }

    runtime.runLifecycleTransaction(() => {
      this.ensureTerminalLease();
      const previousFrame = this.previousFrame;
      const canDiff =
        frame !== undefined &&
        previousFrame !== undefined &&
        options.forceFull !== true &&
        this.baselineValid &&
        dimensionsMatch &&
        runtime.viewportRows !== null &&
        frame.width === runtime.viewportColumns &&
        previousFrame.width === runtime.viewportColumns &&
        frame.height === runtime.viewportRows &&
        previousFrame.height === runtime.viewportRows &&
        !difference!.sizeChanged;

      runtime.runCoordinatedWrite(
        () => {
          // The viewport restates its hidden cursor at the head of every frame,
          // so console output that revealed it cannot outlive one repaint.
          this.cursorVisibilityLease?.reassert();
          options.writeBefore?.();
        },
        () => {
          if (canDiff) {
            const changedRows: string[] = [];
            for (const row of difference!.rows) {
              changedRows.push(
                ansiEscapes.cursorTo(0, row),
                "\x1b[0m",
                encodeFrameRow(frame!, row, this.color),
                "\x1b[0m",
                ansiEscapes.eraseEndLine,
              );
            }
            changedRows.push(ansiEscapes.cursorTo(0, Math.max(0, runtime.viewportRows! - 1)));
            runtime.write(runtime.stdout, changedRows.join(""));
          } else {
            const encoded = options.encoded ?? (frame ? encodeFrame(frame, this.color) : "");
            runtime.write(runtime.stdout, ansiEscapes.clearViewport + encoded);
          }
        },
      );

      this.rememberFrame(frame);
      this.baselineValid = true;
      this.baselineColumns = runtime.viewportColumns;
      this.baselineRows = runtime.viewportRows;
    });
    return true;
  }
}
