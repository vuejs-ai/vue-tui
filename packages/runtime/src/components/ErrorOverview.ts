import { defineComponent, h, type PropType } from "vue";

export const ErrorOverview = defineComponent({
  name: "ErrorOverview",
  props: {
    error: { type: Object as PropType<Error>, required: true },
  },
  setup(props) {
    return () =>
      h("box", { flexDirection: "column" }, [
        h("text", {}, [props.error.name + ": " + props.error.message]),
      ]);
  },
});
