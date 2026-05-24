import { defineComponent, h, type PropType } from "vue";

type TransformFn = (line: string, lineIndex: number) => string;

export const Transform = defineComponent({
  name: "Transform",
  props: {
    transform: { type: Function as PropType<TransformFn>, required: true },
  },
  setup(props, { slots }) {
    return () => h("transform", { transform: props.transform }, slots.default?.());
  },
});
