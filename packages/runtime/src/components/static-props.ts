import type { ExtractPublicPropTypes, PropType, VNodeChild } from "vue";
import type { BoxLayoutStyle } from "./box-props.ts";

/** The `{ item, index }` object a `<Static>` scoped slot receives per item. */
export interface StaticSlotProps<T = unknown> {
  item: T;
  index: number;
}

/** A `<Static>` default scoped slot: rendered once per item. */
export type StaticSlot<T = unknown> = (props: StaticSlotProps<T>) => VNodeChild;

/** Accepted `<Static>` children: a bare scoped slot or a `{ default }` slot object. */
export type StaticChildren<T = unknown> = StaticSlot<T> | { default: StaticSlot<T> };

/** `<Static>`'s `style` surface — the same layout style keys a `<Box>` accepts. */
export type StaticStyle = BoxLayoutStyle;

export const staticProps = {
  // `required: true as const` (not bare `true`): a standalone `const` widens
  // `true` -> `boolean`, dropping `items` from the required keys. The literal keeps
  // `items` required, matching Ink's `StaticProps`.
  items: { type: Array as PropType<unknown[]>, required: true as const },
  style: { type: Object as PropType<StaticStyle>, default: undefined },
};

type StaticBaseProps = ExtractPublicPropTypes<typeof staticProps>;

/**
 * Props accepted by `<Static>` — the vue-tui analogue of Ink's `StaticProps`.
 * Generic over the item type so `items: T[]` flows into the scoped slot's `item`.
 */
export type StaticProps<T = unknown> = Omit<StaticBaseProps, "items"> & {
  items: T[];
};
