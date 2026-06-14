import type { ExtractPublicPropTypes } from "vue";

// Spacer takes no props (it is a fixed flex-grow box). The empty object keeps the
// same `*-props.ts` + `ExtractPublicPropTypes` pattern the other components use, so
// `keyof SpacerProps` is `never` — matching Ink's empty `SpacerProps`.
export const spacerProps = {};

/** Props accepted by `<Spacer>` — the vue-tui analogue of Ink's `SpacerProps`. */
export type SpacerProps = ExtractPublicPropTypes<typeof spacerProps>;
