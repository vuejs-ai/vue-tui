import { type ExtractPublicPropTypes, type PropType } from "vue";

export const newlineProps = {
  /** How many newline characters to emit. Must be a non-negative safe integer. */
  count: { type: Number as PropType<number>, default: 1 },
};

/** Props accepted by `<Newline>`. */
export type NewlineProps = ExtractPublicPropTypes<typeof newlineProps>;
