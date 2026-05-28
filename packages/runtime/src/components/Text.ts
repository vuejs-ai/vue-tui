import { defineComponent, getCurrentInstance, h, inject, type PropType } from "vue";
import { AppContextKey } from "../context.ts";
import type { WithChildren } from "./with-children.ts";

type Color = string | [number, number, number];
type WrapMode =
  | "wrap"
  | "hard"
  | "truncate"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";

const TextImpl = defineComponent({
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
    ariaLabel: String,
    ariaHidden: Boolean,
  },
  setup(props, { slots }) {
    const appCtx = inject(AppContextKey, null);

    return () => {
      const isScreenReaderEnabled = appCtx?.isScreenReaderEnabled ?? false;

      // When screen reader is enabled and aria-hidden is set, render nothing.
      if (isScreenReaderEnabled && props.ariaHidden) {
        return null;
      }

      const ariaLabel = props.ariaLabel;
      const children = isScreenReaderEnabled && ariaLabel ? ariaLabel : slots.default?.();

      if (children === undefined || children === null) {
        return null;
      }

      const insideText = isInsideText();
      if (insideText) {
        return h("virtual-text", props as never, children);
      }
      // Match Ink's <Text> defaults: flexShrink=1 so text nodes shrink when
      // they overflow their container (e.g. in no-wrap flex rows).
      return h("text", { ...props, flexShrink: 1 } as never, children);
    };
  },
});

export const Text = TextImpl as WithChildren<typeof TextImpl>;

function isInsideText(): boolean {
  let parent = getCurrentInstance()?.parent;
  while (parent) {
    const name = parent.type && (parent.type as { name?: string }).name;
    if (name === "Text") return true;
    parent = parent.parent;
  }
  return false;
}
