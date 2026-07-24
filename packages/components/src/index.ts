import ScrollBoxSfc from "./scroll-box/scroll-box.vue";
import SpinnerSfc from "./spinner/spinner.vue";
import type { PublicComponent, PublicLeafComponent } from "./public-component.ts";
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
