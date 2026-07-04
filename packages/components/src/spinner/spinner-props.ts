import { type ExtractPublicPropTypes, type PropType } from "vue";
import type { PresetName } from "./spinners.ts";

export const spinnerProps = {
  type: { type: String as PropType<PresetName>, default: "dots" as PresetName },
  frames: { type: Array as PropType<string[]> },
  interval: Number,
  color: String,
  label: String,
};

/** Props accepted by `<Spinner>`. */
export type SpinnerProps = ExtractPublicPropTypes<typeof spinnerProps>;
