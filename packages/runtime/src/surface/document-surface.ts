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

/** The final-stream document surface used for non-TTY stdout. */
export class DocumentSurface extends SurfaceBase {
  readonly kind = "final-stream";
  readonly isLive = false;

  layoutHeight(viewportRows: number | null): SurfaceLayoutHeight {
    return viewportRows === null ? { mode: "unbounded" } : { mode: "at-most", rows: viewportRows };
  }

  present(presentation: SurfacePresentation, _runtime: SurfaceRuntime): boolean {
    // Static/history output is durable immediately; the latest dynamic frame
    // stays pending until one clean teardown write.
    if (presentation.history.output !== "") {
      presentation.history.handoff(presentation.onHistoryHandoff);
    }
    this.rememberFrame(presentation.frame);
    return presentation.history.output !== "";
  }

  handoffHistory(output: TerminalOutput, data: string, runtime: SurfaceRuntime): void {
    if (data !== "") runtime.write(output, data);
  }

  suspend(_runtime: SurfaceRuntime): void {
    // A document stream never takes physical terminal ownership.
  }

  resume(_runtime: SurfaceRuntime): boolean {
    // Nothing to reacquire, so every lease write is accepted.
    return true;
  }

  dispose(runtime: SurfaceRuntime, options: SurfaceDisposeOptions): void {
    if (!options.cleanExit) return;
    const frame = this.finalFrame();
    if (frame) runtime.writeBestEffort(runtime.stdout, frame, options.sync);
  }

  resize(_runtime: SurfaceRuntime, _resize: SurfaceResize): void {
    // Its modeled layout does not change with a terminal resize.
  }

  private finalFrame(): string | undefined {
    const frame = this.previousFrame;
    if (!frame) return undefined;
    const output = encodeFrame(frame, this.color);
    if (output === "") return undefined;
    return output.endsWith("\n") ? output : `${output}\n`;
  }
}
