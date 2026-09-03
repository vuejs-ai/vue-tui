import { hideCursorEscape, nextLineEscape, showCursorEscape } from "./cursor-helpers.ts";
import {
  SurfaceBase,
  type SurfaceDisposeOptions,
  type SurfaceLayoutHeight,
  type SurfacePresentation,
  type SurfaceResize,
  type SurfaceRuntime,
} from "./surface-contract.ts";

/** The bounded, live main-screen surface. */
export class InlineSurface extends SurfaceBase {
  readonly kind = "inline-terminal";
  readonly isLive = true;

  private regionStarted = false;
  private frameToRender = "";

  private get needsTerminalLineAdvance(): boolean {
    const frame = this.frameToRender;
    return frame !== "" && !frame.endsWith("\n");
  }

  layoutHeight(viewportRows: number | null): SurfaceLayoutHeight {
    return viewportRows === null ? { mode: "unbounded" } : { mode: "at-most", rows: viewportRows };
  }

  limitFrame(frame: string, viewportRows?: number): string {
    return viewportRows === undefined ? frame : frame.split("\n").slice(0, viewportRows).join("\n");
  }

  present(presentation: SurfacePresentation, runtime: SurfaceRuntime): boolean {
    const writer = this.getWriter();
    const staticOutput = presentation.history.output;
    const hasStaticOutput = staticOutput !== "";
    if (presentation.frame !== "" || hasStaticOutput) this.ensureRegionStart(runtime);

    // A frame that fills the viewport gets no trailing newline. A non-TTY
    // stream always receives one so its output remains ordinary line history.
    const fillsViewport =
      runtime.isStdoutTty &&
      runtime.viewportRows !== null &&
      this.frameHeight(presentation.frame) >= runtime.viewportRows;
    const frameToRender = fillsViewport ? presentation.frame : `${presentation.frame}\n`;

    let frameWritten = hasStaticOutput;
    if (hasStaticOutput) {
      runtime.runSynchronizedOutput(() => {
        writer.clear();
        presentation.history.handoff(presentation.onHistoryHandoff);
        presentation.onHistoryPrepared?.();
        writer.write(frameToRender);
      });
    } else {
      // Compare the logical frame so the initial empty render does not acquire
      // a cursor lease merely because log-update has an internal sentinel.
      const willRender = writer.willRender(frameToRender);
      if (presentation.frame !== this.lastFrame) {
        frameWritten = true;
        if (willRender) runtime.runSynchronizedOutput(() => writer.write(frameToRender));
        else writer.write(frameToRender);
      }
    }

    this.rememberInlineFrame(presentation.frame, frameToRender);
    return frameWritten;
  }

  handoffHistory(stream: NodeJS.WriteStream, data: string, runtime: SurfaceRuntime): void {
    if (data === "") return;
    const writer = this.getWriter();
    runtime.runCoordinatedWrite(
      () => {
        writer.clear();
        this.ensureRegionStart(runtime);
        runtime.write(stream, data);
        // History is terminal-owned before the dynamic region is restored. NEL
        // creates a physical boundary without relying on LF/CRLF translation.
        if (!data.endsWith("\n") && (stream === runtime.stdout || Boolean(stream.isTTY))) {
          runtime.write(stream, nextLineEscape);
        }
      },
      () => this.restoreLastOutput(),
    );
  }

  suspend(runtime: SurfaceRuntime): void {
    const writer = this.getAttachedWriter();
    if (!writer) return;
    runtime.setSurfaceAvailable(false);
    if (this.needsTerminalLineAdvance) {
      runtime.writeBestEffort(runtime.stdout, nextLineEscape, true);
    }
    const cursorWasHidden = writer.isCursorHidden();
    const cursorShown =
      !cursorWasHidden || runtime.writeBestEffort(runtime.stdout, showCursorEscape, true);
    try {
      writer.reset({ cursorHidden: cursorWasHidden && !cursorShown });
    } catch {
      // Suspension must release the remaining resources even if writer state is
      // already unusable after an interrupted stream transaction.
    }
    this.forgetInlineFrame();
    this.regionStarted = false;
    runtime.reportTerminalReleased();
  }

  resume(_runtime: SurfaceRuntime): boolean {
    return true;
  }

  dispose(runtime: SurfaceRuntime, options: SurfaceDisposeOptions): void {
    const writer = this.getAttachedWriter();
    if (!writer || !runtime.isStdoutWritable) return;
    if (this.needsTerminalLineAdvance) {
      runtime.writeBestEffort(runtime.stdout, nextLineEscape, options.sync);
    }
    if (options.sync) {
      if (writer.isCursorHidden()) {
        runtime.writeBestEffort(runtime.stdout, showCursorEscape, true);
      }
      writer.reset({ cursorHidden: false });
      return;
    }
    writer.done();
  }

  resize(runtime: SurfaceRuntime, resize: SurfaceResize): void {
    const writer = this.getAttachedWriter();
    if (!writer) return;
    if (resize.mappingChanged && this.regionStarted) {
      // Reflow can make the old relative baseline point at terminal history.
      // Preserve it, anchor a fresh region, and repaint from scratch.
      runtime.runSynchronizedOutput(() => {
        runtime.write(runtime.stdout, hideCursorEscape);
        if (resize.currentRows === null) return;
        runtime.write(runtime.stdout, `\u001b[${resize.currentRows}B${nextLineEscape}`);
        writer.reset();
        this.forgetInlineFrame();
      });
      return;
    }
    if (resize.currentColumns < resize.previousColumns) {
      writer.clear();
      this.forgetInlineFrame();
    }
  }

  override createRollback(): () => void {
    const rollbackBase = super.createRollback();
    const previousRegionStarted = this.regionStarted;
    const previousFrameToRender = this.frameToRender;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      rollbackBase();
      this.regionStarted = previousRegionStarted;
      this.frameToRender = previousFrameToRender;
    };
  }

  private ensureRegionStart(runtime: SurfaceRuntime): void {
    if (this.regionStarted) return;
    // The initial cursor column is unknowable without a terminal query. Start
    // on a fresh physical row so clearing this bounded region cannot consume a
    // caller's partial pre-mount line.
    runtime.write(runtime.stdout, nextLineEscape);
    this.regionStarted = true;
  }

  private restoreLastOutput(): void {
    // `||` deliberately treats the empty initial physical baseline as absent.
    this.getWriter().write(this.frameToRender || `${this.lastFrame}\n`);
  }

  private rememberInlineFrame(frame: string, frameToRender: string): void {
    this.rememberFrame(frame);
    this.frameToRender = frameToRender;
  }

  private forgetInlineFrame(): void {
    this.forgetFrame();
    this.frameToRender = "";
  }

  private frameHeight(frame: string): number {
    return frame === "" ? 0 : frame.split("\n").length;
  }
}
