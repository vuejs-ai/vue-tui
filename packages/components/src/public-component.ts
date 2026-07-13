import type { ComponentPublicInstance, VNodeChild } from "vue";

type DefaultSlot = () => VNodeChild;
type DefaultChildren = VNodeChild | DefaultSlot | { default: DefaultSlot };

/** Stable author-facing constructor that does not expose Vue's patch-specific SFC generics. */
export type PublicComponent<Props, Exposed extends object = object> = {
  new (): ComponentPublicInstance<Props> &
    Exposed & {
      $props: Props & { children?: DefaultChildren };
      $slots: { default?: DefaultSlot };
    };
};

/** Stable author-facing constructor for components that accept no children. */
export type PublicLeafComponent<Props> = {
  new (): ComponentPublicInstance<Props> & {
    $props: Props & { children?: never };
  };
};
