import { defineComponent, h } from "vue";

export const Newline = defineComponent({
  name: "Newline",
  props: { count: { type: Number, default: 1 } },
  setup(props) {
    return () => h("virtual-text", {}, "\n".repeat(props.count));
  },
});
