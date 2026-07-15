import {
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  vShow,
  watch,
  withDirectives,
  type ComponentPublicInstance,
  type PropType,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  Box,
  Text,
  useCaret,
  useElementGeometry,
  useFocus,
  type CaretState,
  type ElementGeometry,
  type UseFocusReturn,
} from "@vue-tui/runtime";
import { useMouseEvent } from "@vue-tui/runtime/fullscreen";

interface VShowJourneyState {
  mounts: number;
  unmounts: number;
  clicks: Ref<number> | null;
  value: Ref<number> | null;
  focus: UseFocusReturn | null;
  geometry: Readonly<ShallowRef<ElementGeometry>> | null;
  caret: Readonly<ShallowRef<CaretState>> | null;
}

export const vShowJourneyState: VShowJourneyState = {
  mounts: 0,
  unmounts: 0,
  clicks: null,
  value: null,
  focus: null,
  geometry: null,
  caret: null,
};

export function resetVShowJourneyState(): void {
  vShowJourneyState.mounts = 0;
  vShowJourneyState.unmounts = 0;
  vShowJourneyState.clicks = null;
  vShowJourneyState.value = null;
  vShowJourneyState.focus = null;
  vShowJourneyState.geometry = null;
  vShowJourneyState.caret = null;
}

// Vue's SFC compiler lowers `v-show="visible"` to this exact
// `withDirectives(..., [[vShow, visible]])` runtime contract. The companion
// template fixture proves the author-facing SFC syntax with vue-tsc; this
// component exercises the directive's real runtime-dom hooks in the custom
// renderer without requiring a browser test environment.
export default defineComponent({
  name: "VShowJourney",
  props: {
    visible: { type: Boolean, required: true },
    pointer: { type: Boolean, required: true },
    revision: { type: Number, required: true },
    targetKey: { type: Number, required: true },
    authoredDisplay: {
      type: String as PropType<"flex" | "none">,
      required: true,
    },
  },
  setup(props) {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const value = ref(props.revision);
    const clicks = ref(0);
    const focus = useFocus(target);
    const { geometry } = useElementGeometry(target);
    const { state: caret } = useCaret(target, {
      focus,
      position: () => ({ x: 0, y: 0 }),
    });
    useMouseEvent(
      target,
      "click",
      () => {
        clicks.value++;
        return "consume";
      },
      { isActive: () => props.pointer },
    );

    watch(
      () => props.revision,
      (revision) => {
        value.value = revision;
      },
      { flush: "sync" },
    );

    vShowJourneyState.clicks = clicks;
    vShowJourneyState.value = value;
    vShowJourneyState.focus = focus;
    vShowJourneyState.geometry = geometry;
    vShowJourneyState.caret = caret;

    onMounted(() => {
      vShowJourneyState.mounts++;
    });
    onUnmounted(() => {
      vShowJourneyState.unmounts++;
    });

    return () =>
      withDirectives(
        h(Box, { flexDirection: "column" }, () => [
          h(
            Box,
            {
              key: props.targetKey,
              ref: target,
              display: props.authoredDisplay,
              marginLeft: props.targetKey === 0 ? 0 : 4,
              width: 12,
              height: 1,
              flexShrink: 0,
            },
            () => h(Text, null, () => `probe:${value.value}`),
          ),
        ]),
        [[vShow, props.visible]],
      );
  },
});
