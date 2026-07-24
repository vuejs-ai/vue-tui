import type { ComponentPublicInstance, VNodeChild } from "vue";

export type DefaultSlot = () => VNodeChild;

export type DefaultChildren = VNodeChild | DefaultSlot | { default: DefaultSlot };

/**
 * Adds an optional `children` prop to a component's JSX `$props` so that TSX
 * written under the automatic runtime (`jsx: "react-jsx"` + `jsxImportSource:
 * "vue"`) accepts child content. Vue's JSX namespace defines no
 * `ElementChildrenAttribute`, so the automatic runtime passes children as a
 * `children` prop — which must be present on `$props` to type-check. Vue routes
 * that prop to the default slot at runtime, so this is a type-only shim with no
 * runtime effect.
 */
export type PublicComponent<
  Props,
  InstanceBrand extends object = object,
  Children = DefaultChildren,
  Slots = { default?: DefaultSlot },
> = {
  new (): ComponentPublicInstance<Props> &
    InstanceBrand & {
      $props: Props & { children?: Children };
      $slots: Slots;
    };
};
