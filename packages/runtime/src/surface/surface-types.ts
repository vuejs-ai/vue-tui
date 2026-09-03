/** A terminal or deliberately modeled terminal's character-cell dimensions. */
export interface SurfaceSize {
  readonly columns: number;
  readonly rows: number;
}

/** The root area a surface asks Runtime to lay out. `rows: null` is unbounded. */
export interface SurfaceLayoutSize {
  readonly columns: number;
  readonly rows: number | null;
}

/** The terminal and layout dimensions a live surface exchanges with Session. */
export interface ResolvedLiveDimensions {
  readonly terminal: SurfaceSize | null;
  readonly layout: SurfaceLayoutSize;
}

/** The supported concrete surface selected from a mounted host's facts. */
export type ResolvedLiveSurface =
  | {
      readonly kind: "final-stream";
      readonly reason: "stdout-not-tty";
      readonly dimensions: ResolvedLiveDimensions;
    }
  | {
      readonly kind: "inline-terminal";
      readonly dimensions: ResolvedLiveDimensions;
    }
  | {
      readonly kind: "fullscreen-terminal";
      readonly dimensions: ResolvedLiveDimensions;
    };
