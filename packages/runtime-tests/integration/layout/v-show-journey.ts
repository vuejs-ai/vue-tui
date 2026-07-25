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
  type Ref,
} from "vue";
import {
  Box,
  Text,
  useBoxMetrics,
  useFocus,
  type UseBoxMetricsReturn,
  type UseFocusReturn,
} from "@vue-tui/runtime";

interface VShowJourneyState {
  mounts: number;
  unmounts: number;
  value: Ref<number> | null;
  focus: UseFocusReturn | null;
  size: UseBoxMetricsReturn | null;
}

export const vShowJourneyState: VShowJourneyState = {
  mounts: 0,
  unmounts: 0,
  value: null,
  focus: null,
  size: null,
};

export function resetVShowJourneyState(): void {
  vShowJourneyState.mounts = 0;
  vShowJourneyState.unmounts = 0;
  vShowJourneyState.value = null;
  vShowJourneyState.focus = null;
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
    revision: { type: Number, required: true },
    targetKey: { type: Number, required: true },
  },
  setup(props) {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    const value = ref(props.revision);
    const focus = useFocus(target);
    const metrics = useBoxMetrics(target);

    watch(
      () => props.revision,
      (revision) => {
        value.value = revision;
      },
      { flush: "sync" },
    );

    vShowJourneyState.value = value;
    vShowJourneyState.focus = focus;
    vShowJourneyState.size = metrics;

    onMounted(() => {
      vShowJourneyState.mounts++;
      focus.focus();
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
