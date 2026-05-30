import {
  defineComponent,
  h,
  shallowRef,
  watch,
  type ExtractPublicPropTypes,
  type PropType,
} from "vue";
import type { WithChildren } from "./with-children.ts";

const staticProps = {
  // `required: true as const` (not bare `true`): a standalone `const` widens
  // `true` → `boolean`, which would drop `items` from ExtractPublicPropTypes'
  // required keys (and from the component's own `props.items` typing). The
  // literal keeps `items` required, matching Ink's `StaticProps`.
  items: { type: Array as PropType<unknown[]>, required: true as const },
  style: { type: Object as PropType<Record<string, unknown>>, default: undefined },
};

const StaticImpl = defineComponent({
  name: "Static",
  props: staticProps,
  setup(props, { slots }) {
    const defaultStyle: Record<string, unknown> = {
      position: "absolute",
      flexDirection: "column",
    };

    // Mirrors Ink's `const [index, setIndex] = useState(0)`. Only items at or
    // after `cursor` are rendered; once written, the renderer advances the
    // cursor (via the onWritten callback below) so written items unmount.
    // shallowRef is sufficient — we only ever reassign the number.
    const cursor = shallowRef(0);

    // Invoked by the renderer AFTER a commit has painted the freshly-written
    // items. Together with the watch below this is the vue-tui analogue of Ink's
    // post-commit `useLayoutEffect(() => setIndex(items.length), [items.length])`.
    //
    // This callback handles the GROW / steady-state direction: advancing the
    // cursor only AFTER paint guarantees freshly-appended items are written
    // before they are sliced out and unmounted. It must run post-paint, never
    // during render, which is why it can't be a plain watcher. We SET the cursor
    // to items.length (not max-with-current); assigning an equal number is a
    // reactivity no-op (Vue triggers on Object.is inequality), so the common
    // resync-to-same-length case can't loop.
    const onWritten = () => {
      cursor.value = (props.items as unknown[]).length;
    };

    // Handles the SHRINK direction, mirroring Ink's effect firing on every
    // [items.length] change — including decreases. When items shrink, the
    // already-rendered Static children may already be empty (sliced out), so no
    // host mutation occurs and no commit/onWritten fires; the cursor would stay
    // stranded above the new length and silently drop any later-appended items
    // (e.g. [A,B] cursor→2, shrink to [A], grow to [A,C] → slice(2)=[] drops C).
    // Lowering the cursor on shrink is safe without waiting for a paint: shrinking
    // never needs to write anything, it only re-syncs the slice window down.
    watch(
      () => (props.items as unknown[]).length,
      (len) => {
        if (len < cursor.value) cursor.value = len;
      },
    );

    return () => {
      const merged = { ...defaultStyle, ...props.style };
      const items = props.items as unknown[];
      const start = cursor.value;
      const itemsToRender = items.slice(start);
      return h(
        "static",
        { ...merged, internal_onWritten: onWritten },
        itemsToRender.map((item, i) => slots.default?.({ item, index: start + i })),
      );
    };
  },
});

export const Static = StaticImpl as WithChildren<typeof StaticImpl>;

/** Props accepted by `<Static>` — the vue-tui analogue of Ink's `StaticProps`. */
export type StaticProps = ExtractPublicPropTypes<typeof staticProps>;
