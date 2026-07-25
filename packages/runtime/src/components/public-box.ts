import type { ComponentPublicInstance } from "vue";
import BoxSfc from "./box.vue";
import type { BoxProps } from "./box-props.ts";
import type { PublicComponent } from "./with-children.ts";

declare const boxInstanceBrand: unique symbol;

interface BoxInstanceBrand {
  readonly [boxInstanceBrand]: true;
}

/** The nominal public instance produced by the exported Box component. */
export type PublicBoxInstance = ComponentPublicInstance<BoxProps> & BoxInstanceBrand;

// Publish only the stable author-facing constructor shape. Exposing the SFC's
// generated DefineComponent type bakes the build-time Vue patch release's
// private generic arity into our tarball and breaks other supported Vue patches.
export const Box = BoxSfc as unknown as PublicComponent<BoxProps, BoxInstanceBrand>;

/** Runtime check corresponding to the nominal public constructor type above. */
export function isPublicBoxInstance(value: unknown): value is PublicBoxInstance {
  if (typeof value !== "object" || value === null) return false;
  return (value as { readonly $?: { readonly type?: unknown } }).$?.type === BoxSfc;
}
