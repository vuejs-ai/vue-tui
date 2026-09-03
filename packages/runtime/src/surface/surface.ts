import { DocumentSurface } from "./document-surface.ts";
import { FullscreenSurface } from "./fullscreen-surface.ts";
import { InlineSurface } from "./inline-surface.ts";
import type { Surface } from "./surface-contract.ts";
import type { ResolvedLiveSurface } from "./surface-types.ts";
export type {
  Surface,
  SurfaceDisposeOptions,
  SurfaceHistory,
  SurfaceLayoutHeight,
  SurfacePresentation,
  SurfaceResize,
  SurfaceRuntime,
} from "./surface-contract.ts";

/** Select exactly one mounted surface implementation. */
export function createSurface(kind: ResolvedLiveSurface["kind"]): Surface {
  switch (kind) {
    case "inline-terminal":
      return new InlineSurface();
    case "fullscreen-terminal":
      return new FullscreenSurface();
    case "final-stream":
      return new DocumentSurface();
  }
}
