import {
  Comment,
  Text as VueText,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  isVNode,
  type ExtractPublicPropTypes,
  type PropType,
  type VNode,
} from "vue";
import { AppContextKey } from "../context.ts";
import { assertValidBackgroundColor } from "../paint/text-style.ts";
import type { WithChildren } from "./with-children.ts";

type WrapMode =
  | "wrap"
  | "hard"
  | "truncate"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";

const textProps = {
  color: String,
  backgroundColor: String,
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

      // Validate backgroundColor during RENDER so a chalk-modifier name (the
      // exact case Ink's colorize.ts throws on) is caught by vue-tui's error
      // boundary, not the post-flush paint pass where a throw wedges the
      // scheduler. See assertValidBackgroundColor / Ink colorize.ts (40b3a75).
      //
      // Gated to mirror Ink WHERE it colorizes. Ink's <Text> attaches a
      // colorizing `transform` to the ink-text node, but that transform only
      // runs on NON-EMPTY text: squash-text-nodes.ts applies it per child only
      // when `nodeText.length > 0`, and render-node-to-output.ts writes (and so
      // colorizes) only when the squashed `text.length > 0`. So Ink does NOT
      // throw for text that squashes to empty — even though it still renders the
      // (empty) node. The `children === null/undefined` early-return above only
      // catches a literal null/undefined child; a `{""}` empty-string child (or
      // a group of only empty/inert children) gets past it, so we additionally
      // skip validation when the content would render empty. (A12)
      if (wouldRenderNonEmptyText(children)) {
        assertValidBackgroundColor(props.backgroundColor);
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

/**
 * Heuristic for Ink's "would this <Text> colorize?" condition: its transform
 * only runs on non-empty squashed text (squash-text-nodes.ts gates each child on
 * `nodeText.length > 0`; render-node-to-output.ts writes only when the whole
 * `text.length > 0`). We can't squash at render time (nested <Text> content isn't
 * known yet), so we conservatively answer true unless the content is provably
 * empty. Provably-empty = an `""`/whitespace-collapsing string, or a children
 * array whose every entry is an empty-string text vnode or an inert Comment
 * (Vue's materialization of a `null`/`false`/`v-if` child). ANY element/component
 * child or any non-empty text makes it true — matching Ink, which would then
 * colorize the squashed result. The only residual over-throw is a contrived
 * element child that itself squashes to empty (e.g. a nested empty <Text>); that
 * is the same irreducible class as Box's content-area gate.
 */
function wouldRenderNonEmptyText(children: string | VNode[]): boolean {
  if (typeof children === "string") return children.length > 0;
  return !children.every((child) => {
    if (!isVNode(child)) return false;
    if (child.type === Comment) return true;
    // A Vue text vnode carries its string in `children`; empty ⇒ no text.
    if (child.type === VueText) return typeof child.children !== "string" || child.children === "";
    return false;
  });
}

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
