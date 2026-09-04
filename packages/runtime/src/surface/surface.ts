import { DocumentSurface } from "./document-surface.ts";
import { FullscreenSurface } from "./fullscreen-surface.ts";
import { InlineSurface } from "./inline-surface.ts";
import type { Surface } from "./surface-contract.ts";
import type { ColorCapability } from "../frame/color-profile.ts";
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
export function createSurface(kind: ResolvedLiveSurface["kind"], color: ColorCapability): Surface {
  switch (kind) {
    case "inline-terminal":
      return new InlineSurface(color);
    case "fullscreen-terminal":
      return new FullscreenSurface(color);
    case "final-stream":
      return new DocumentSurface(color);
  }
}
