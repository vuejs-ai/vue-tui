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

/**
 * Terminal layout container: the flexbox primitive every layout is built from.
 *
 * - Yoga flexbox, so `flexDirection` defaults to `"row"`, not CSS block flow.
 * - 62 closed props. Unknown props, misspellings, and listeners like `@click`
 *   throw rather than pass through.
 * - No `display` prop: `v-if` to own creation, Box-rooted `v-show` to hide a
 *   mounted subtree.
 * - `borderStyle` takes one of eight frame names or a complete custom frame;
 *   per-edge color props override the shared one.
 *
 * @example A bordered column
 * ```tsx
 * <Box flexDirection="column" borderStyle="round" padding={1} gap={1}>
 *   <Text bold>Title</Text>
 *   <Text>Body</Text>
 * </Box>
 * ```
 *
 * @example Push content apart with a growing spacer
 * ```tsx
 * <Box width="100%">
 *   <Text>left</Text>
 *   <Box flexGrow={1} />
 *   <Text>right</Text>
 * </Box>
 * ```
 */
export const Box = BoxSfc as unknown as PublicComponent<BoxProps, BoxInstanceBrand>;

/** Runtime check corresponding to the nominal public constructor type above. */
export function isPublicBoxInstance(value: unknown): value is PublicBoxInstance {
  if (typeof value !== "object" || value === null) return false;
  return (value as { readonly $?: { readonly type?: unknown } }).$?.type === BoxSfc;
}
