import NewlineSfc from "./newline/newline.vue";
import ScrollBoxSfc from "./scroll-box/scroll-box.vue";
import SpacerSfc from "./spacer/spacer.vue";
import SpinnerSfc from "./spinner/spinner.vue";
import type { PublicComponent, PublicLeafComponent } from "./public-component.ts";
import type { NewlineProps } from "./newline/newline-props.ts";
import type { ScrollBoxExpose, ScrollBoxProps } from "./scroll-box/scroll-box-props.ts";
import type { SpinnerProps } from "./spinner/spinner-props.ts";

// Keep the public constructor independent from the Vue patch release used to
// build this package. Generated DefineComponent arity is not a product API.
export const ScrollBox = ScrollBoxSfc as unknown as PublicComponent<
  ScrollBoxProps,
  ScrollBoxExpose
>;
export type { ScrollBoxProps, ScrollBoxExpose };

export const Spinner = SpinnerSfc as unknown as PublicLeafComponent<SpinnerProps>;
export type { SpinnerProps };

export const Newline = NewlineSfc as unknown as PublicLeafComponent<NewlineProps>;
export type { NewlineProps };

export const Spacer = SpacerSfc as unknown as PublicLeafComponent<Record<string, never>>;
