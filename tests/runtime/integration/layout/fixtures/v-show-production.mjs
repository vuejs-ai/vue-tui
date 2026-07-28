import assert from "node:assert/strict";
import { Newline, ScrollBox, Spacer, Spinner } from "@vue-tui/components";
import { Box, Text } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { defineComponent, h, nextTick, shallowRef, vShow, withDirectives } from "vue";

// Run in a child process because Vue selects its production behavior at module load time.
const visible = shallowRef(true);
const revision = shallowRef(0);
const dynamicVisible = shallowRef(false);
const dynamicHasSlot = shallowRef(false);

const App = defineComponent(
  () => () =>
    h(Box, { flexDirection: "column" }, () => [
      withDirectives(
        h(Box, null, () => h(Text, null, () => `box:${revision.value}`)),
        [[vShow, visible.value]],
      ),
      withDirectives(
        h(Text, null, () => `top:${revision.value}`),
        [[vShow, visible.value]],
      ),
      h(Text, null, () => [
        "before[",
        withDirectives(
          h(Text, null, () => `inline:${revision.value}`),
          [[vShow, visible.value]],
        ),
        "]after",
      ]),
      withDirectives(h(Text, null, dynamicHasSlot.value ? () => "dynamic-top" : undefined), [
        [vShow, dynamicVisible.value],
      ]),
      h(Text, null, () => [
        "dynamic[",
        withDirectives(h(Text, null, dynamicHasSlot.value ? () => "inline" : undefined), [
          [vShow, dynamicVisible.value],
        ]),
        "]",
      ]),
      withDirectives(h(Spinner, { frames: ["S"], label: "spin" }), [[vShow, visible.value]]),
      h(Text, null, () => "tail"),
    ]),
);

const result = await render(App, { color: false, columns: 30, rows: 8 });

try {
  assert.equal(result.lastFrame(), "box:0\ntop:0\nbefore[inline:0]after\ndynamic[]\nS spin\ntail");

  visible.value = false;
  await nextTick();
  await result.waitUntilRenderFlush();
  assert.equal(result.lastFrame(), "before[]after\ndynamic[]\ntail");

  revision.value = 2;
  await nextTick();
  await result.waitUntilRenderFlush();
  assert.equal(result.lastFrame(), "before[]after\ndynamic[]\ntail");

  visible.value = true;
  await nextTick();
  await result.waitUntilRenderFlush();
  assert.equal(result.lastFrame(), "box:2\ntop:2\nbefore[inline:2]after\ndynamic[]\nS spin\ntail");

  dynamicHasSlot.value = true;
  await nextTick();
  await result.waitUntilRenderFlush();
  assert.equal(result.lastFrame(), "box:2\ntop:2\nbefore[inline:2]after\ndynamic[]\nS spin\ntail");

  dynamicVisible.value = true;
  await nextTick();
  await result.waitUntilRenderFlush();
  assert.equal(
    result.lastFrame(),
    "box:2\ntop:2\nbefore[inline:2]after\ndynamic-top\ndynamic[inline]\nS spin\ntail",
  );

  result.unmount();
  await result.waitUntilExit();
} finally {
  result.dispose();
}

const componentVisible = shallowRef(true);
const CustomTextRoot = defineComponent({
  props: {
    label: { type: String, required: true },
  },
  setup(props) {
    return () => h(Text, null, () => props.label);
  },
});
const CustomTextRootChain = defineComponent({
  props: {
    label: { type: String, required: true },
  },
  setup(props) {
    return () => h(CustomTextRoot, { label: props.label });
  },
});
const CustomBoxRoot = defineComponent({
  setup() {
    return () => h(Box, null, () => h(Text, null, () => "custom-box"));
  },
});
const ComponentApp = defineComponent(
  () => () =>
    h(Box, { flexDirection: "column" }, () => [
      withDirectives(h(CustomBoxRoot), [[vShow, componentVisible.value]]),
      withDirectives(h(CustomTextRootChain, { label: "custom-text" }), [
        [vShow, componentVisible.value],
      ]),
      h(Text, null, () => [
        "custom[",
        withDirectives(h(CustomTextRootChain, { label: "inline" }), [
          [vShow, componentVisible.value],
        ]),
        "]",
      ]),
      withDirectives(h(Spinner, { frames: ["S"], label: "spin" }), [
        [vShow, componentVisible.value],
      ]),
      h(Text, null, () => [
        "a",
        withDirectives(h(Newline), [[vShow, componentVisible.value]]),
        "b",
      ]),
      h(Box, { width: 6 }, () => [
        h(Text, null, () => "L"),
        withDirectives(h(Spacer), [[vShow, componentVisible.value]]),
        h(Text, null, () => "R"),
      ]),
      withDirectives(
        h(ScrollBox, null, () => h(Text, null, () => "scroll")),
        [[vShow, componentVisible.value]],
      ),
      h(Text, null, () => "tail"),
    ]),
);
const componentResult = await render(ComponentApp, { color: false, columns: 30, rows: 12 });

try {
  assert.equal(
    componentResult.lastFrame(),
    "custom-box\ncustom-text\ncustom[inline]\nS spin\na\nb\nL    R\nscroll\ntail",
  );

  componentVisible.value = false;
  await nextTick();
  await componentResult.waitUntilRenderFlush();
  assert.equal(componentResult.lastFrame(), "custom[]\nab\nLR\ntail");

  componentVisible.value = true;
  await nextTick();
  await componentResult.waitUntilRenderFlush();
  assert.equal(
    componentResult.lastFrame(),
    "custom-box\ncustom-text\ncustom[inline]\nS spin\na\nb\nL    R\nscroll\ntail",
  );

  componentResult.unmount();
  await componentResult.waitUntilExit();
} finally {
  componentResult.dispose();
}

process.stdout.write("v-show-production: ok\n");
