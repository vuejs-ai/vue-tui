import { defineComponent, h, inject, type PropType } from "vue";
import { AppContextKey } from "../context.ts";

type TransformFn = (line: string, lineIndex: number) => string;

export const Transform = defineComponent({
  name: "Transform",
  props: {
    transform: { type: Function as PropType<TransformFn>, required: true },
    accessibilityLabel: String,
  },
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
