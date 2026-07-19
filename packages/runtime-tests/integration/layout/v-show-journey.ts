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
  type PropType,
  type Ref,
} from "vue";
import { Box, Text, useBoxPresence, useBoxSize, type BoxSize } from "@vue-tui/runtime";
import { useMouseEvent } from "@vue-tui/runtime/fullscreen";

interface VShowJourneyState {
  mounts: number;
  unmounts: number;
  clicks: Ref<number> | null;
  value: Ref<number> | null;
  presence: Readonly<Ref<boolean>> | null;
  size: Readonly<Ref<BoxSize | null>> | null;
}

export const vShowJourneyState: VShowJourneyState = {
  mounts: 0,
  unmounts: 0,
  clicks: null,
  value: null,
  presence: null,
  size: null,
};

export function resetVShowJourneyState(): void {
  vShowJourneyState.mounts = 0;
  vShowJourneyState.unmounts = 0;
  vShowJourneyState.clicks = null;
  vShowJourneyState.value = null;
  vShowJourneyState.presence = null;
  vShowJourneyState.size = null;
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
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    const value = ref(props.revision);
    const clicks = ref(0);
    const presence = useBoxPresence(target);
    const size = useBoxSize(target);
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
    vShowJourneyState.presence = presence;
    vShowJourneyState.size = size;

    onMounted(() => {
      vShowJourneyState.mounts++;
    });
    onUnmounted(() => {
      vShowJourneyState.unmounts++;
    });

    return () =>
      withDirectives(
        h(
          Box,
          {
            flexDirection: "column",
            paddingLeft: props.targetKey === 0 ? 0 : 4,
          },
          () => [
            h(
              Box,
              {
                key: props.targetKey,
                ref: target,
                display: props.authoredDisplay,
                width: 12,
                height: 1,
                flexShrink: 0,
              },
              () => h(Text, null, () => `probe:${value.value}`),
            ),
          ],
        ),
        [[vShow, props.visible]],
      );
  },
});
