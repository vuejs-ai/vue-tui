import {
  defineComponent,
  h,
  isReadonly,
  onMounted,
  shallowRef,
  vShow,
  withDirectives,
  type ComponentPublicInstance,
} from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus, type UseFocusReturn } from "@vue-tui/runtime";
import { flushAcceptedRender } from "./harness.ts";

test("creates distinct logical and rendered identities with synchronous void operations", async () => {
  let logical!: UseFocusReturn;
  let rendered!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    logical = useFocus();
    rendered = useFocus(target);
    logical.focus();
    onMounted(() => rendered.focus());
    return () => <Box ref={target} />;
  });

  const result = await render(App);
  try {
    expect(logical.isFocused.value).toBe(false);
    expect(rendered.isFocused.value).toBe(true);
    expect(isReadonly(logical.isFocused)).toBe(true);
    expect(isReadonly(rendered.isFocused)).toBe(true);

    expect(logical.focus()).toBeUndefined();
    expect(logical.isFocused.value).toBe(true);
    expect(rendered.isFocused.value).toBe(false);

    expect(rendered.focus()).toBeUndefined();
    expect(rendered.isFocused.value).toBe(true);
    expect(logical.isFocused.value).toBe(false);

    expect(logical.blur()).toBeUndefined();
    expect(rendered.isFocused.value).toBe(true);
    expect(rendered.blur()).toBeUndefined();
    expect(rendered.isFocused.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("keeps focus ownership independent across mounted apps", async () => {
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;
  const FirstApp = defineComponent(() => {
    first = useFocus();
    first.focus();
    return () => <Text>first app</Text>;
  });
  const SecondApp = defineComponent(() => {
    second = useFocus();
    second.focus();
    return () => <Text>second app</Text>;
  });

  const firstResult = await render(FirstApp);
  const secondResult = await render(SecondApp);
  try {
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(true);

    first.blur();
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);

    first.focus();
    second.blur();
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(false);

    firstResult.dispose();
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(false);

    second.focus();
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);
  } finally {
    firstResult.dispose();
    secondResult.dispose();
  }
});

test("does not queue unavailable acquisition or restore focus after target loss", async () => {
  const shown = shallowRef(false);
  let logical!: UseFocusReturn;
  let rendered!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    logical = useFocus();
    rendered = useFocus(target);
    logical.focus();
    return () => (shown.value ? <Box ref={target} /> : null);
  });

  const result = await render(App);
  try {
    rendered.focus();
    expect(logical.isFocused.value).toBe(true);
    expect(rendered.isFocused.value).toBe(false);

    shown.value = true;
    await flushAcceptedRender(result);
    expect(logical.isFocused.value).toBe(true);
    expect(rendered.isFocused.value).toBe(false);

    rendered.focus();
    expect(logical.isFocused.value).toBe(false);
    expect(rendered.isFocused.value).toBe(true);

    shown.value = false;
    await flushAcceptedRender(result);
    expect(rendered.isFocused.value).toBe(false);
    expect(logical.isFocused.value).toBe(false);

    shown.value = true;
    await flushAcceptedRender(result);
    expect(rendered.isFocused.value).toBe(false);
    expect(logical.isFocused.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("keeps multiple handles for one boundary distinct", async () => {
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    first = useFocus(target);
    second = useFocus(target);
    onMounted(() => first.focus());
    return () => <Box ref={target} />;
  });

  const result = await render(App);
  try {
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(false);
    second.focus();
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);
  } finally {
    result.dispose();
  }
});

test("keeps targetless focus through ancestor v-show and clears it on scope disposal", async () => {
  const shown = shallowRef(true);
  const mounted = shallowRef(true);
  let focus!: UseFocusReturn;
  const Probe = defineComponent(() => {
    focus = useFocus();
    focus.focus();
    return () => <Text>logical</Text>;
  });
  const App = defineComponent(
    () => () =>
      withDirectives(
        h(Box, null, () => (mounted.value ? h(Probe) : null)),
        [[vShow, shown.value]],
      ),
  );

  const result = await render(App);
  try {
    expect(focus.isFocused.value).toBe(true);
    shown.value = false;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(true);

    mounted.value = false;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(false);
    focus.focus();
    expect(focus.isFocused.value).toBe(false);
  } finally {
    result.dispose();
  }
});
