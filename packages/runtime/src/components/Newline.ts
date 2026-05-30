import { defineComponent, getCurrentInstance, h, type ExtractPublicPropTypes } from "vue";

const newlineProps = { count: { type: Number, default: 1 } };

export const Newline = defineComponent({
  name: "Newline",
  props: newlineProps,
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
    // A <Transform> is also a text context: Ink models it as an ink-text host,
    // so a <Newline> directly inside a standalone <Transform> renders inline
    // (an inline line break in the transform's text), not as a standalone yoga
    // "text" node. (G58)
    if (name === "Text" || name === "Transform") return true;
    parent = parent.parent;
  }
  return false;
}

/** Props accepted by `<Newline>` — the vue-tui analogue of Ink's `NewlineProps`. */
export type NewlineProps = ExtractPublicPropTypes<typeof newlineProps>;
