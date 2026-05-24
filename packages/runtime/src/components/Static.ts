import { defineComponent, h } from "vue";

export const Static = defineComponent({
  name: "Static",
  props: {
    items: { type: Array, required: true },
  },
  setup(props, { slots }) {
    return () =>
      h(
        "static",
        {},
        (props.items as unknown[]).map((item, index) => slots.default?.({ item, index })),
      );
  },
});
