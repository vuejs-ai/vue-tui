import {
  defineComponent,
  Fragment,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  vShow,
  withDirectives,
} from "vue";
import { expect, test, vi } from "vite-plus/test";
import { Box, Text, useFocus, type UseFocusReturn } from "@vue-tui/runtime";
import { render, type RenderResult } from "@vue-tui/testing";
import VShowJourney, { resetVShowJourneyState, vShowJourneyState } from "./v-show-journey.ts";

async function flushUpdate(result: RenderResult): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}

test.each(["inline", "fullscreen"] as const)(
  "v-show preserves a stateful subtree and invalidates its %s focus target",
  async (mode) => {
    resetVShowJourneyState();
    const visible = shallowRef(true);
    const revision = shallowRef(0);
    const targetKey = shallowRef(0);
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <VShowJourney
          visible={visible.value}
          revision={revision.value}
          targetKey={targetKey.value}
        />
        <Text>tail</Text>
      </Box>
    ));
    const result = await render(App, {
      columns: 20,
      rows: 8,
      mode,
    });

    try {
      expect(vShowJourneyState.mounts).toBe(1);
      expect(vShowJourneyState.unmounts).toBe(0);
      expect(result.lastFrame()).toBe("probe:0\ntail");
      expect(vShowJourneyState.size?.hasMeasured.value).toBe(true);
      expect(vShowJourneyState.size?.width.value).toBe(12);
      expect(vShowJourneyState.size?.height.value).toBe(1);
      expect(vShowJourneyState.focus?.isFocused.value).toBe(true);

      visible.value = false;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("tail");
      expect(vShowJourneyState.mounts).toBe(1);
      expect(vShowJourneyState.unmounts).toBe(0);
      expect(vShowJourneyState.focus?.isFocused.value).toBe(false);
      expect(vShowJourneyState.size?.hasMeasured.value).toBe(false);
      expect(vShowJourneyState.size?.width.value).toBe(0);

      // Reactive state and the rendered target can both change while the
      // directive keeps the mounted subtree out of layout and paint.
      revision.value = 2;
      targetKey.value = 1;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("tail");
      expect(vShowJourneyState.value?.value).toBe(2);
      expect(vShowJourneyState.mounts).toBe(1);
      expect(vShowJourneyState.unmounts).toBe(0);

      visible.value = true;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("    probe:2\ntail");
      expect(vShowJourneyState.focus?.isFocused.value).toBe(false);
      expect(vShowJourneyState.size?.hasMeasured.value).toBe(true);
      expect(vShowJourneyState.size?.width.value).toBe(12);
      expect(vShowJourneyState.size?.height.value).toBe(1);
      vShowJourneyState.focus?.focus();
      expect(vShowJourneyState.focus?.isFocused.value).toBe(true);
      result.unmount();
      expect(vShowJourneyState.unmounts).toBe(1);
      expect(vShowJourneyState.focus?.isFocused.value).toBe(false);
      expect(vShowJourneyState.size?.hasMeasured.value).toBe(false);
      expect(vShowJourneyState.size?.width.value).toBe(0);
    } finally {
      result.dispose();
    }
  },
);

test.each(["inline", "fullscreen"] as const)(
  "v-show hides direct top-level and nested Text roots in %s mode without unmounting",
  async (mode) => {
    const visible = shallowRef(true);
    const revision = shallowRef(0);
    let mounts = 0;
    let unmounts = 0;
    const focuses = new Map<string, UseFocusReturn>();
    const StatefulTextContent = defineComponent({
      name: "StatefulTextContent",
      props: {
        label: { type: String, required: true },
        revision: { type: Number, required: true },
      },
      setup(props) {
        onMounted(() => mounts++);
        onUnmounted(() => unmounts++);
        return () => `${props.label}:${props.revision}`;
      },
    });
    const VShowText = defineComponent({
      name: "VShowText",
      props: {
        label: { type: String, required: true },
        visible: { type: Boolean, required: true },
        revision: { type: Number, required: true },
      },
      setup(props) {
        const target = shallowRef<InstanceType<typeof Text> | null>(null);
        const focus = useFocus(target);
        focuses.set(props.label, focus);
        return () =>
          withDirectives(
            h(Text, { ref: target }, () =>
              h(StatefulTextContent, {
                label: props.label,
                revision: props.revision,
              }),
            ),
            [[vShow, props.visible]],
          );
      },
    });
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <VShowText label="top" visible={visible.value} revision={revision.value} />
        <Text>
          before[
          <VShowText label="inline" visible={visible.value} revision={revision.value} />
          ]after
        </Text>
        <Text>tail</Text>
      </Box>
    ));
    const result = await render(App, {
      columns: 30,
      rows: 8,
      mode,
    });

    try {
      expect(result.lastFrame()).toBe("top:0\nbefore[inline:0]after\ntail");
      expect(mounts).toBe(2);
      expect(unmounts).toBe(0);
      const inlineFocus = focuses.get("inline");
      expect(inlineFocus).toBeDefined();
      inlineFocus?.focus();
      expect(inlineFocus?.isFocused.value).toBe(true);

      visible.value = false;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("before[]after\ntail");
      expect(mounts).toBe(2);
      expect(unmounts).toBe(0);
      expect(inlineFocus?.isFocused.value).toBe(false);

      revision.value = 2;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("before[]after\ntail");
      expect(mounts).toBe(2);
      expect(unmounts).toBe(0);

      visible.value = true;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("top:2\nbefore[inline:2]after\ntail");
      expect(mounts).toBe(2);
      expect(unmounts).toBe(0);
      expect(inlineFocus?.isFocused.value).toBe(false);

      const topFocus = focuses.get("top");
      expect(topFocus).toBeDefined();
      topFocus?.focus();
      expect(topFocus?.isFocused.value).toBe(true);

      visible.value = false;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("before[]after\ntail");
      expect(topFocus?.isFocused.value).toBe(false);

      visible.value = true;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("top:2\nbefore[inline:2]after\ntail");
      expect(topFocus?.isFocused.value).toBe(false);

      result.unmount();
      expect(unmounts).toBe(2);
    } finally {
      result.dispose();
    }
  },
);

test.each(["inline", "fullscreen"] as const)(
  "v-show follows Text changing between a Comment and host root in %s mode",
  async (mode) => {
    const hasSlot = shallowRef(false);
    const visible = shallowRef(false);
    const DynamicText = defineComponent({
      name: "DynamicText",
      props: {
        label: { type: String, required: true },
      },
      setup(props) {
        return () =>
          withDirectives(h(Text, null, hasSlot.value ? () => props.label : undefined), [
            [vShow, visible.value],
          ]);
      },
    });
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <DynamicText label="top" />
        <Text>
          before[
          <DynamicText label="inline" />
          ]after
        </Text>
        <Text>tail</Text>
      </Box>
    ));
    const result = await render(App, {
      columns: 30,
      rows: 8,
      mode,
    });

    try {
      expect(result.lastFrame()).toBe("before[]after\ntail");

      hasSlot.value = true;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("before[]after\ntail");

      visible.value = true;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("top\nbefore[inline]after\ntail");

      hasSlot.value = false;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("before[]after\ntail");

      hasSlot.value = true;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("top\nbefore[inline]after\ntail");
    } finally {
      result.dispose();
    }
  },
);

test.each(["inline", "fullscreen"] as const)(
  "v-show reaches Box and Text through arbitrary single-root component chains in %s mode",
  async (mode) => {
    const visible = shallowRef(true);
    const revision = shallowRef(0);
    const TextRoot = defineComponent({
      name: "TextRoot",
      props: {
        label: { type: String, required: true },
        revision: { type: Number, required: true },
      },
      setup(props) {
        return () => h(Text, null, () => `${props.label}:${props.revision}`);
      },
    });
    const TextRootChain = defineComponent({
      name: "TextRootChain",
      props: {
        label: { type: String, required: true },
        revision: { type: Number, required: true },
      },
      setup(props) {
        return () => h(TextRoot, { label: props.label, revision: props.revision });
      },
    });
    const BoxRoot = defineComponent({
      name: "BoxRoot",
      props: {
        revision: { type: Number, required: true },
      },
      setup(props) {
        return () => h(Box, null, () => h(Text, null, () => `box:${props.revision}`));
      },
    });
    const BoxRootChain = defineComponent({
      name: "BoxRootChain",
      props: {
        revision: { type: Number, required: true },
      },
      setup(props) {
        return () => h(BoxRoot, { revision: props.revision });
      },
    });
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        {withDirectives(h(BoxRootChain, { revision: revision.value }), [[vShow, visible.value]])}
        {withDirectives(
          h(TextRootChain, {
            label: "top",
            revision: revision.value,
          }),
          [[vShow, visible.value]],
        )}
        <Text>
          before[
          {withDirectives(
            h(TextRootChain, {
              label: "inline",
              revision: revision.value,
            }),
            [[vShow, visible.value]],
          )}
          ]after
        </Text>
        <Text>tail</Text>
      </Box>
    ));
    const result = await render(App, {
      columns: 30,
      rows: 8,
      mode,
    });

    try {
      expect(result.lastFrame()).toBe("box:0\ntop:0\nbefore[inline:0]after\ntail");

      visible.value = false;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("before[]after\ntail");

      revision.value = 2;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("before[]after\ntail");

      visible.value = true;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("box:2\ntop:2\nbefore[inline:2]after\ntail");
    } finally {
      result.dispose();
    }
  },
);

test("v-show follows Vue by rejecting even a single-child normal Fragment root", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const FragmentRoot = defineComponent(
    () => () => h(Fragment, null, [h(Text, null, () => "still-visible")]),
  );
  const App = defineComponent(
    () => () => h(Box, null, () => withDirectives(h(FragmentRoot), [[vShow, false]])),
  );

  const result = await render(App, { patchConsole: false });
  try {
    expect(result.lastFrame()).toBe("still-visible");
    expect(
      warning.mock.calls.some((args) =>
        args.some(
          (value) =>
            typeof value === "string" &&
            value.includes("Runtime directive used on component with non-element root"),
        ),
      ),
    ).toBe(true);
  } finally {
    result.dispose();
    warning.mockRestore();
  }
});
