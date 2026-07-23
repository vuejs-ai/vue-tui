import { Comment, defineComponent, h, isVNode, provide, type PropType, type VNode } from "vue";
import { TextContextKey } from "../context.ts";
import type { PublicComponent } from "./with-children.ts";

type TransformFn = (line: string, lineIndex: number) => string;

const transformProps = {
  // `required: true as const` keeps `transform` a required key once the props
  // object lives in a standalone `const` (which would otherwise widen `true` →
  // `boolean`). Matches Ink's `TransformProps`.
  transform: { type: Function as PropType<TransformFn>, required: true as const },
};

const TransformImpl = defineComponent({
  name: "Transform",
  props: transformProps,
  setup(props, { slots }) {
    // A <Transform> is a text context: Ink models it as an ink-text host, so
    // descendant <Text>/<Newline> render inline (squashed into the transform's
    // text). It only provides — it never injects. (G58)
    provide(TextContextKey, true);

    return () => {
      const children = slots.default?.();

      // Mirror Ink's Transform (Transform.tsx:28-30): when there are no children
      // it returns null — creating NO host node — and this guard runs BEFORE the
      // host node. An empty <Transform> in a flex `gap` row therefore adds
      // neither a node nor a gap slot (P13).
      //
      // Ink's exact guard is `children === undefined || children === null`. Vue
      // can't see that raw value — `slots.default?.()` materializes a bare
      // `null`/`false`/falsy-`&&`/`v-if` child as a Comment vnode (the same
      // representation the G52 squash logic skips), and CANNOT tell `null` from
      // `false`. So the predicate treats the whole group as "no children": the slot
      // is undefined OR every resolved vnode is a Comment. This matches Ink for the
      // common conditional idioms (`{null}`, `{cond ? x : null}`) and follows
      // vue-tui's documented comment-anchor model (a null/false/undefined child is
      // inert, output equals omitting the element — see ink-divergences.md). It
      // DELIBERATELY diverges from Ink only for a literal `{false}` / `{cond && x}`
      // (when false): React's `false !== null`, so Ink renders an empty ink-text
      // node (a gap slot); Vue, unable to distinguish it, omits it. Keeping
      // Transform consistent with how every other component treats a `false`/`v-if`
      // child is the principled choice — the pre-fix Transform was the inconsistent
      // one (it rendered a stray node for `{null}` too).
      // (Edge: `{''}` is a TEXT vnode and JSX `{[]}` a Fragment vnode — neither a
      // Comment, so both still render, matching Ink. A non-JSX `() => []` empty
      // array collapses to null here; invisible — an empty-node Transform paints
      // nothing and only the gap-slot differs.)
      if (isNoRenderableChildren(children)) {
        return null;
      }

      return h("tui-transform", { transform: props.transform }, children);
    };
  },
});

export const Transform = TransformImpl as unknown as PublicComponent<TransformProps>;

/**
 * The Vue analogue of Ink's `children === undefined || children === null` guard
 * (Transform.tsx:28). True when the default slot resolves to nothing renderable:
 * either it's absent, or every vnode in it is a Comment — Vue's materialization
 * of a bare `null`/`false`/falsy-`&&`/`v-if` child (the same nodes G52's squash
 * skips). A text-leaf (`{''}`) or Fragment (`{[]}`) vnode is renderable, so it is
 * NOT treated as null — matching Ink, which renders a node for `children === ''`
 * or `[]` (both `!== null`).
 */
function isNoRenderableChildren(children: VNode[] | undefined): boolean {
  if (children === undefined) return true;
  return children.every((child) => isVNode(child) && child.type === Comment);
}

/** Props accepted by `<Transform>` — the vue-tui analogue of Ink's `TransformProps`. */
export interface TransformProps {
  transform: TransformFn;
}
