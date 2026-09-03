import ansiEscapes from "ansi-escapes";
import { Frame } from "../frame/frame.ts";
import type { TerminalLease, TerminalOutput } from "../terminal/backend.ts";
import { hideCursorEscape, showCursorEscape } from "./cursor-helpers.ts";
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

  private alternateScreen = false;
  private cursorHidden = false;
  private alternateScreenMayBeActive = false;
  private cursorMayBeHidden = false;
  private alternateScreenLease: TerminalLease<"alternate-screen"> | undefined;
  private cursorVisibilityLease: TerminalLease<"cursor-visibility"> | undefined;
  private enterPending = false;
  private hideCursorPending = false;
  private exitPending = false;
  private showCursorPending = false;
  private alternateScreenReleaseGeneration = 0;
  private cursorReleaseGeneration = 0;
  private baselineValid = false;
  private baselineColumns: number | null = null;
  private baselineRows: number | null = null;

  get isInputReady(): boolean {
    return this.alternateScreen && this.cursorHidden;
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
    this.releaseAlternateScreen(runtime, true);
    this.releaseCursorVisibility(runtime, true);
    try {
      this.getAttachedWriter()?.reset({ cursorHidden: false });
    } catch {
      // Continue the release sequence when log-update has already lost its
      // physical baseline to a failed terminal transaction.
    }
    this.forgetFrame();
    runtime.reportTerminalReleased();
  }

  resume(runtime: SurfaceRuntime): boolean {
    return this.ensureTerminalLease(runtime);
  }

  dispose(runtime: SurfaceRuntime, options: SurfaceDisposeOptions): void {
    const writer = this.getAttachedWriter();
    // Each release stands alone: a throw here must not cost the terminal its
    // main screen or its cursor, which the two blocks below restore. The failure
    // is still the teardown's, so it is raised once the restores have run.
    let releaseFailure: { readonly error: unknown } | undefined;
    if (writer && runtime.isStdoutWritable) {
      try {
        if (options.sync) {
          if (writer.isCursorHidden()) {
            runtime.writeBestEffort(runtime.stdout, showCursorEscape, true);
          }
          writer.reset({ cursorHidden: false });
        } else {
          writer.done();
        }
      } catch (error) {
        releaseFailure = { error };
      }
    }
    this.releaseAlternateScreen(runtime, options.sync);
    this.releaseCursorVisibility(runtime, options.sync);
    if (releaseFailure) throw releaseFailure.error;
  }

  resize(_runtime: SurfaceRuntime, resize: SurfaceResize): void {
    if (resize.mappingChanged) this.baselineValid = false;
  }

  abandonPendingOutput(options?: { readonly physicalStateUncertain?: boolean }): void {
    if (options?.physicalStateUncertain) {
      this.baselineValid = false;
    }
    // Each physical write marks its own uncertainty when handoff starts. A
    // later captured segment may never have reached stream.write(), so pending
    // alone is not evidence that its terminal mode changed.
    this.enterPending = false;
    this.hideCursorPending = false;
    this.exitPending = false;
    this.showCursorPending = false;
  }

  override createRollback(): () => void {
    const rollbackBase = super.createRollback();
    const snapshot = {
      alternateScreen: this.alternateScreen,
      alternateScreenMayBeActive: this.alternateScreenMayBeActive,
      alternateScreenLease: this.alternateScreenLease,
      alternateScreenReleaseGeneration: this.alternateScreenReleaseGeneration,
      baselineColumns: this.baselineColumns,
      baselineRows: this.baselineRows,
      baselineValid: this.baselineValid,
      cursorHidden: this.cursorHidden,
      cursorMayBeHidden: this.cursorMayBeHidden,
      cursorVisibilityLease: this.cursorVisibilityLease,
      cursorReleaseGeneration: this.cursorReleaseGeneration,
    };
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      rollbackBase();
      // Output rollback restores logical frame facts. Physical mode facts are
      // conservative unions: acquisition may have reached the terminal before
      // a later segment failed, while a failed release may need to be retried.
      if (this.alternateScreenReleaseGeneration === snapshot.alternateScreenReleaseGeneration) {
        this.alternateScreen ||= snapshot.alternateScreen;
        this.alternateScreenMayBeActive ||= snapshot.alternateScreenMayBeActive;
        this.alternateScreenLease ??= snapshot.alternateScreenLease;
      }
      this.baselineColumns = snapshot.baselineColumns;
      this.baselineRows = snapshot.baselineRows;
      this.baselineValid = snapshot.baselineValid;
      if (this.cursorReleaseGeneration === snapshot.cursorReleaseGeneration) {
        this.cursorHidden ||= snapshot.cursorHidden;
        this.cursorMayBeHidden ||= snapshot.cursorMayBeHidden;
        this.cursorVisibilityLease ??= snapshot.cursorVisibilityLease;
      }
    };
  }

  private ensureTerminalLease(runtime: SurfaceRuntime): boolean {
    let accepted = true;
    if (!this.alternateScreen && !this.enterPending) {
      this.baselineValid = false;
      this.enterPending = true;
      if (
        !runtime.writeTerminal(
          ansiEscapes.enterAlternativeScreen + "\x1b[H",
          () => {
            if (!this.enterPending) return;
            this.enterPending = false;
            this.alternateScreenMayBeActive = false;
            this.alternateScreen = true;
            this.alternateScreenLease ??= runtime.terminal.acquire("alternate-screen");
            this.reportAcquiredIfReady(runtime);
            runtime.requestTerminalReconcile();
          },
          () => {
            if (this.enterPending) this.alternateScreenMayBeActive = true;
          },
        )
      ) {
        this.enterPending = false;
        accepted = false;
      }
    }
    if (!this.cursorHidden && !this.hideCursorPending) {
      this.hideCursorPending = true;
      if (
        !runtime.writeTerminal(
          hideCursorEscape,
          () => {
            if (!this.hideCursorPending) return;
            this.hideCursorPending = false;
            this.cursorMayBeHidden = false;
            this.cursorHidden = true;
            this.cursorVisibilityLease ??= runtime.terminal.acquire("cursor-visibility");
            this.reportAcquiredIfReady(runtime);
            runtime.requestTerminalReconcile();
          },
          () => {
            if (this.hideCursorPending) this.cursorMayBeHidden = true;
          },
        )
      ) {
        this.hideCursorPending = false;
        accepted = false;
      }
    }
    return accepted;
  }

  /** The sole alternate-screen release path, paired with its acquisition above. */
  private releaseAlternateScreen(runtime: SurfaceRuntime, sync: boolean): void {
    if ((!this.alternateScreen && !this.alternateScreenMayBeActive) || this.exitPending) return;
    this.exitPending = true;
    const accepted = runtime.writeBestEffort(
      runtime.stdout,
      ansiEscapes.exitAlternativeScreen,
      sync,
      () => {
        if (!this.exitPending) return;
        this.exitPending = false;
        this.alternateScreen = false;
        this.alternateScreenMayBeActive = false;
        this.alternateScreenLease?.release();
        this.alternateScreenLease = undefined;
        this.alternateScreenReleaseGeneration++;
      },
    );
    if (!accepted) this.exitPending = false;
  }

  private releaseCursorVisibility(runtime: SurfaceRuntime, sync: boolean): void {
    if ((!this.cursorHidden && !this.cursorMayBeHidden) || this.showCursorPending) return;
    this.showCursorPending = true;
    const accepted = runtime.writeBestEffort(runtime.stdout, showCursorEscape, sync, () => {
      if (!this.showCursorPending) return;
      this.showCursorPending = false;
      this.cursorHidden = false;
      this.cursorMayBeHidden = false;
      this.cursorVisibilityLease?.release();
      this.cursorVisibilityLease = undefined;
      this.cursorReleaseGeneration++;
    });
    if (!accepted) this.showCursorPending = false;
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
      this.ensureTerminalLease(runtime);
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
          runtime.write(runtime.stdout, hideCursorEscape);
          options.writeBefore?.();
        },
        () => {
          if (canDiff) {
            const changedRows: string[] = [];
            for (const row of difference!.rows) {
              changedRows.push(
                ansiEscapes.cursorTo(0, row),
                "\x1b[0m",
                encodeFrameRow(frame!, row),
                "\x1b[0m",
                ansiEscapes.eraseEndLine,
              );
            }
            changedRows.push(ansiEscapes.cursorTo(0, Math.max(0, runtime.viewportRows! - 1)));
            runtime.write(runtime.stdout, changedRows.join(""));
          } else {
            const encoded = options.encoded ?? (frame ? encodeFrame(frame) : "");
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

  private reportAcquiredIfReady(runtime: SurfaceRuntime): void {
    if (this.isInputReady && !runtime.isResumeInProgress) runtime.reportTerminalAcquired();
  }
}
