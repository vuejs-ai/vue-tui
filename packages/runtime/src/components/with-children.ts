/**
 * Adds an optional `children` prop to a component's JSX `$props` so that TSX
 * written under the automatic runtime (`jsx: "react-jsx"` + `jsxImportSource:
 * "vue"`) accepts child content. Vue's JSX namespace defines no
 * `ElementChildrenAttribute`, so the automatic runtime passes children as a
 * `children` prop — which must be present on `$props` to type-check. Vue routes
 * that prop to the default slot at runtime, so this is a type-only shim with no
 * runtime effect.
 */
export type WithChildren<C, T = unknown> = C & {
  new (): { $props: { children?: T } };
};
