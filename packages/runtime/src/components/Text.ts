import { defineComponent, getCurrentInstance, h, type PropType } from "vue";

type Color = string | [number, number, number];
type WrapMode =
  | "wrap"
  | "hard"
  | "truncate"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";

export const Text = defineComponent({
  name: "Text",
  props: {
    color: [String, Array] as PropType<Color>,
    backgroundColor: [String, Array] as PropType<Color>,
    dimColor: Boolean,
    bold: Boolean,
    italic: Boolean,
    underline: Boolean,
    strikethrough: Boolean,
    inverse: Boolean,
    wrap: { type: String as PropType<WrapMode>, default: "wrap" },
  },
  setup(props, { slots }) {
    return () => {
      const insideText = isInsideText();
      if (insideText) {
        return h("virtual-text", props as never, slots.default?.());
      }
      // Match Ink's <Text> defaults: flexShrink=1 so text nodes shrink when
      // they overflow their container (e.g. in no-wrap flex rows).
      return h("text", { ...props, flexShrink: 1 } as never, slots.default?.());
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
