import {
  Comment,
  defineComponent,
  h,
  inject,
  isVNode,
  type ExtractPublicPropTypes,
  type PropType,
  type VNode,
} from "vue";
import { AppContextKey } from "../context.ts";
import type { WithChildren } from "./with-children.ts";

type TransformFn = (line: string, lineIndex: number) => string;

const transformProps = {
  // `required: true as const` keeps `transform` a required key once the props
  // object lives in a standalone `const` (which would otherwise widen `true` →
  // `boolean`). Matches Ink's `TransformProps`.
  transform: { type: Function as PropType<TransformFn>, required: true as const },
  accessibilityLabel: String,
};

const TransformImpl = defineComponent({
  name: "Transform",
  props: transformProps,
  setup(props, { slots }) {
    const appCtx = inject(AppContextKey, null);

    return () => {
      const children = slots.default?.();

      // Mirror Ink's Transform (Transform.tsx:28-30): when there are no children
      // it returns null — creating NO host node — and this guard runs BEFORE the
      // accessibilityLabel substitution. Two consequences we must match:
      //  - an empty <Transform> in a flex `gap` row adds neither a node nor a gap
      //    slot (P13); and
      //  - a childless <Transform accessibilityLabel> emits nothing even in
      //    screen-reader mode, because null wins over the label (P19).
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

      const isScreenReaderEnabled = appCtx?.isScreenReaderEnabled ?? false;

      // When screen reader is enabled and accessibilityLabel is set,
      // render the label text instead of children.
      if (isScreenReaderEnabled && props.accessibilityLabel) {
        return h("transform", { transform: props.transform }, props.accessibilityLabel);
      }

      return h("transform", { transform: props.transform }, children);
    };
  },
});

export const Transform = TransformImpl as WithChildren<typeof TransformImpl>;

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
export type TransformProps = ExtractPublicPropTypes<typeof transformProps>;
