import type { ExtractPublicPropTypes } from "vue";

export const newlineProps = { count: { type: Number, default: 1 } };

/** Props accepted by `<Newline>` — the vue-tui analogue of Ink's `NewlineProps`. */
export type NewlineProps = ExtractPublicPropTypes<typeof newlineProps>;
