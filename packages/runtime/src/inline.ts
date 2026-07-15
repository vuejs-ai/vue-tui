import StaticSfc from "./components/static.vue";
import type { StaticChildren, StaticProps, StaticSlot } from "./components/static-props.ts";

// Publish only the author-facing generic constructor. Keeping the generated SFC
// type would add a competing non-generic slot signature and leak the build-time
// Vue patch's private DefineComponent shape into the package declaration.
export const Static = StaticSfc as unknown as {
  new <T = unknown>(
    props: StaticProps<T>,
  ): {
    $props: StaticProps<T> & { children?: StaticChildren<T> };
    $slots: { default?: StaticSlot<T> };
  };
};
export type {
  StaticChildren,
  StaticProps,
  StaticSlot,
  StaticSlotProps,
  StaticStyle,
} from "./components/static-props.ts";
