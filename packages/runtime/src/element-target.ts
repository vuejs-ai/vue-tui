import type { ComponentPublicInstance, MaybeRefOrGetter } from "vue";

/** A rendered terminal cell relative to the coordinate space named by its operation. */
export interface CellPoint {
  readonly x: number;
  readonly y: number;
}

/** A Vue component ref or getter used by a ref-bound Runtime primitive. */
export type ElementTarget = MaybeRefOrGetter<ComponentPublicInstance | null | undefined>;
