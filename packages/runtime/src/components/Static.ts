import { defineComponent, h, type PropType } from "vue";
import type { WithChildren } from "./with-children.ts";

const StaticImpl = defineComponent({
  name: "Static",
  props: {
    items: { type: Array as PropType<unknown[]>, required: true },
    style: { type: Object as PropType<Record<string, unknown>>, default: undefined },
  },
  setup(props, { slots }) {
    const defaultStyle: Record<string, unknown> = {
      position: "absolute",
      flexDirection: "column",
    };

    return () => {
      const merged = { ...defaultStyle, ...props.style };
      return h(
        "static",
        merged,
        (props.items as unknown[]).map((item, index) => slots.default?.({ item, index })),
      );
    };
  },
});

export const Static = StaticImpl as WithChildren<typeof StaticImpl>;
