import {
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  type ExtractPublicPropTypes,
  type PropType,
} from "vue";
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

const textProps = {
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
};

const TextImpl = defineComponent({
  name: "Text",
  props: textProps,
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

/** Props accepted by `<Text>` — the vue-tui analogue of Ink's `TextProps`. */
export type TextProps = ExtractPublicPropTypes<typeof textProps>;

function isInsideText(): boolean {
  let parent = getCurrentInstance()?.parent;
  while (parent) {
    const name = parent.type && (parent.type as { name?: string }).name;
    // A <Transform> is also a text context: Ink models it as an ink-text host,
    // so a <Text> directly inside a <Transform> renders inline (as a nested
    // ink-text squashed into the transform's text), matching Ink's
    // <Transform><Text>…</Text></Transform>. (G58)
    if (name === "Text" || name === "Transform") return true;
    parent = parent.parent;
  }
  return false;
}
