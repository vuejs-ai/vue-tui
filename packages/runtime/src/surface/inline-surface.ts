import { hideCursorEscape, nextLineEscape, showCursorEscape } from "./cursor-helpers.ts";
import { Frame } from "../frame/frame.ts";
import type { TerminalOutput } from "../terminal/backend.ts";
import { encodeFrame } from "./frame-encoder.ts";
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

  layoutHeight(viewportRows: number | null): SurfaceLayoutHeight {
    return viewportRows === null ? { mode: "unbounded" } : { mode: "at-most", rows: viewportRows };
  }

  present(presentation: SurfacePresentation, runtime: SurfaceRuntime): boolean {
    const writer = this.getWriter();
    const frame = presentation.frame;
    const staticOutput = presentation.history.output;
    const hasStaticOutput = staticOutput !== "";
    const previousFrame = this.previousFrame;
    const difference = frame ? Frame.diff(previousFrame, frame) : undefined;
    const frameChanged =
      difference === undefined
        ? previousFrame !== undefined
        : difference.sizeChanged || difference.rows.length > 0;
    const hasOutput = frame !== undefined && (frame.hasContent() || frame.height > 1);
    const hadOutput =
      previousFrame !== undefined && (previousFrame.hasContent() || previousFrame.height > 1);

    if (!hasStaticOutput && !frameChanged) return false;
    if (!hasStaticOutput && !hasOutput && !hadOutput) {
      this.rememberFrame(frame);
      return false;
    }

    const encoded = presentation.encoded ?? (frame ? encodeFrame(frame) : "");
    if (encoded !== "" || hasStaticOutput) this.ensureRegionStart(runtime);

    // A frame that fills the viewport gets no trailing newline. A non-TTY
    // stream always receives one so its output remains ordinary line history.
    const fillsViewport =
      runtime.isStdoutTty &&
      runtime.viewportRows !== null &&
      frame !== undefined &&
      hasOutput &&
      frame.height >= runtime.viewportRows;
    const frameToRender = fillsViewport ? encoded : `${encoded}\n`;

    let frameWritten = hasStaticOutput;
    if (hasStaticOutput) {
      runtime.runSynchronizedOutput(() => {
        writer.clear();
        presentation.history.handoff(presentation.onHistoryHandoff);
        presentation.onHistoryPrepared?.();
        writer.write(frameToRender);
      });
    } else {
      frameWritten = true;
      runtime.runSynchronizedOutput(() => writer.write(frameToRender));
    }

    this.rememberFrame(frame, frameToRender !== "" && !frameToRender.endsWith("\n"));
    return frameWritten;
  }

  handoffHistory(output: TerminalOutput, data: string, runtime: SurfaceRuntime): void {
    if (data === "") return;
    const writer = this.getWriter();
    runtime.runCoordinatedWrite(
      () => {
        writer.clear();
        this.ensureRegionStart(runtime);
        runtime.write(output, data);
        // History is terminal-owned before the dynamic region is restored. NEL
        // creates a physical boundary without relying on LF/CRLF translation.
        if (
          !data.endsWith("\n") &&
          (output === runtime.stdout || runtime.terminal.capabilities[output].isTTY)
        ) {
          runtime.write(output, nextLineEscape);
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
    this.forgetFrame();
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
        this.forgetFrame();
      });
      return;
    }
    if (resize.currentColumns < resize.previousColumns) {
      writer.clear();
      this.forgetFrame();
    }
  }

  override createRollback(): () => void {
    const rollbackBase = super.createRollback();
    const previousRegionStarted = this.regionStarted;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      rollbackBase();
      this.regionStarted = previousRegionStarted;
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
    const frame = this.previousFrame;
    const output = frame ? encodeFrame(frame) : "";
    if (output === "") {
      this.getWriter().write("\n");
      return;
    }
    this.getWriter().write(
      this.needsTerminalLineAdvance || output.endsWith("\n") ? output : `${output}\n`,
    );
  }
}
