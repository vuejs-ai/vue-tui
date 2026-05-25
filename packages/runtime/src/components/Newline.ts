import { defineComponent, getCurrentInstance, h } from "vue";

export const Newline = defineComponent({
  name: "Newline",
  props: { count: { type: Number, default: 1 } },
  setup(props) {
    return () => {
      const content = "\n".repeat(props.count);
      // Inside a Text parent, render as inline virtual-text.
      // Outside Text, render as "text" (yoga carrier) so Newline participates
      // in layout standalone, matching Ink's ink-text behavior.
      if (isInsideText()) {
        return h("virtual-text", {}, content);
      }
      return h("text", {}, content);
    };
  },
});

function isInsideText(): boolean {
  let parent = getCurrentInstance()?.parent;
  while (parent) {
    const name = parent.type && (parent.type as { name?: string }).name;
    if (name === "Text") return true;
    parent = parent.parent;
  }
  return false;
}
