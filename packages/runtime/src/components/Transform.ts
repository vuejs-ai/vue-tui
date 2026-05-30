import { defineComponent, h, inject, type ExtractPublicPropTypes, type PropType } from "vue";
import { AppContextKey } from "../context.ts";
import type { WithChildren } from "./with-children.ts";

type TransformFn = (line: string, lineIndex: number) => string;

const transformProps = {
  // `required: true as const` keeps `transform` a required key once the props
  // object lives in a standalone `const` (which would otherwise widen `true` →
  // `boolean`). Matches Ink's `TransformProps`.
  transform: { type: Function as PropType<TransformFn>, required: true as const },
  accessibilityLabel: String,
};

const TransformImpl = defineComponent({
  name: "Transform",
  props: transformProps,
  setup(props, { slots }) {
    const appCtx = inject(AppContextKey, null);

    return () => {
      const isScreenReaderEnabled = appCtx?.isScreenReaderEnabled ?? false;

      // When screen reader is enabled and accessibilityLabel is set,
      // render the label text instead of children.
      if (isScreenReaderEnabled && props.accessibilityLabel) {
        return h("transform", { transform: props.transform }, props.accessibilityLabel);
      }

      return h("transform", { transform: props.transform }, slots.default?.());
    };
  },
});

export const Transform = TransformImpl as WithChildren<typeof TransformImpl>;

/** Props accepted by `<Transform>` — the vue-tui analogue of Ink's `TransformProps`. */
export type TransformProps = ExtractPublicPropTypes<typeof transformProps>;
