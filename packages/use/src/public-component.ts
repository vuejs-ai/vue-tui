import type { ComponentPublicInstance, VNodeChild } from "vue";

type DefaultSlot = () => VNodeChild;
type DefaultChildren = VNodeChild | DefaultSlot | { default: DefaultSlot };

/** Stable author-facing constructor that does not expose Vue's patch-specific SFC generics. */
export type PublicEventComponent<Props, Emit> = {
  new (): Omit<ComponentPublicInstance<Props>, "$emit" | "$props" | "$slots"> & {
    $emit: Emit;
    $props: Props & { children?: DefaultChildren };
    $slots: { default?: DefaultSlot };
  };
};
