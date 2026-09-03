import ansiEscapes from "ansi-escapes";
import { hideCursorEscape, showCursorEscape } from "./cursor-helpers.ts";
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
  private enterPending = false;
  private hideCursorPending = false;
  private baselineValid = false;
  private baselineColumns: number | null = null;
  private baselineRows: number | null = null;

  get isInputReady(): boolean {
    return this.alternateScreen && this.cursorHidden;
  }

  layoutHeight(viewportRows: number | null): SurfaceLayoutHeight {
    return viewportRows === null ? { mode: "unbounded" } : { mode: "exact", rows: viewportRows };
  }

  limitFrame(frame: string): string {
    return frame;
  }

  present(presentation: SurfacePresentation, runtime: SurfaceRuntime): boolean {
    return this.repaint(presentation.frame, runtime);
  }

  handoffHistory(stream: NodeJS.WriteStream, data: string, runtime: SurfaceRuntime): void {
    if (data === "") return;
    this.repaint(this.lastFrame, runtime, {
      forceFull: true,
      writeBefore: () => runtime.write(stream, data),
    });
  }

  suspend(runtime: SurfaceRuntime): void {
    this.baselineValid = false;
    runtime.setSurfaceAvailable(false);
    if (this.alternateScreen || this.alternateScreenMayBeActive) {
      if (runtime.writeBestEffort(runtime.stdout, ansiEscapes.exitAlternativeScreen, true)) {
        this.alternateScreen = false;
        this.alternateScreenMayBeActive = false;
      }
    }
    if (this.cursorHidden || this.cursorMayBeHidden) {
      if (runtime.writeBestEffort(runtime.stdout, showCursorEscape, true)) {
        this.cursorHidden = false;
        this.cursorMayBeHidden = false;
      }
    }
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
    if (this.alternateScreen || this.alternateScreenMayBeActive) {
      if (
        runtime.writeBestEffort(runtime.stdout, ansiEscapes.exitAlternativeScreen, options.sync)
      ) {
        this.alternateScreen = false;
        this.alternateScreenMayBeActive = false;
      }
    }
    if (this.cursorHidden || this.cursorMayBeHidden) {
      if (runtime.writeBestEffort(runtime.stdout, showCursorEscape, options.sync)) {
        this.cursorHidden = false;
        this.cursorMayBeHidden = false;
      }
    }
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
  }

  override createRollback(): () => void {
    const rollbackBase = super.createRollback();
    const snapshot = {
      alternateScreen: this.alternateScreen,
      alternateScreenMayBeActive: this.alternateScreenMayBeActive,
      baselineColumns: this.baselineColumns,
      baselineRows: this.baselineRows,
      baselineValid: this.baselineValid,
      cursorHidden: this.cursorHidden,
      cursorMayBeHidden: this.cursorMayBeHidden,
    };
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      rollbackBase();
      // Output rollback restores logical frame facts. Physical mode facts are
      // conservative unions: acquisition may have reached the terminal before
      // a later segment failed, while a failed release may need to be retried.
      this.alternateScreen ||= snapshot.alternateScreen;
      this.alternateScreenMayBeActive ||= snapshot.alternateScreenMayBeActive;
      this.baselineColumns = snapshot.baselineColumns;
      this.baselineRows = snapshot.baselineRows;
      this.baselineValid = snapshot.baselineValid;
      this.cursorHidden ||= snapshot.cursorHidden;
      this.cursorMayBeHidden ||= snapshot.cursorMayBeHidden;
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

  private repaint(
    output: string,
    runtime: SurfaceRuntime,
    options: {
      readonly forceFull?: boolean;
      readonly writeBefore?: () => void;
    } = {},
  ): boolean {
    const dimensionsMatch =
      this.baselineColumns === runtime.viewportColumns &&
      this.baselineRows === runtime.viewportRows;
    if (
      options.writeBefore === undefined &&
      this.baselineValid &&
      dimensionsMatch &&
      output === this.lastFrame
    ) {
      return false;
    }

    runtime.runLifecycleTransaction(() => {
      this.ensureTerminalLease(runtime);
      const previousRows = this.lastFrame.split("\n");
      const nextRows = output.split("\n");
      const canDiff =
        options.forceFull !== true &&
        this.baselineValid &&
        dimensionsMatch &&
        runtime.viewportRows !== null &&
        previousRows.length === runtime.viewportRows &&
        nextRows.length === runtime.viewportRows;

      runtime.runCoordinatedWrite(
        () => {
          runtime.write(runtime.stdout, hideCursorEscape);
          options.writeBefore?.();
        },
        () => {
          if (canDiff) {
            const changedRows: string[] = [];
            for (let row = 0; row < runtime.viewportRows!; row++) {
              if (previousRows[row] === nextRows[row]) continue;
              changedRows.push(
                ansiEscapes.cursorTo(0, row),
                "\x1b[0m",
                nextRows[row]!,
                "\x1b[0m",
                ansiEscapes.eraseEndLine,
              );
            }
            changedRows.push(ansiEscapes.cursorTo(0, Math.max(0, runtime.viewportRows! - 1)));
            runtime.write(runtime.stdout, changedRows.join(""));
          } else {
            runtime.write(runtime.stdout, ansiEscapes.clearViewport + output);
          }
          this.getWriter().sync(output);
        },
      );

      this.rememberFrame(output);
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
