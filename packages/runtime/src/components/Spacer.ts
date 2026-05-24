import { defineComponent, h } from "vue";

export const Spacer = defineComponent({
  name: "Spacer",
  setup() {
    return () => h("box", { flexGrow: 1, flexShrink: 1 });
  },
});
