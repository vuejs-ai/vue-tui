import {
  defineComponent,
  h,
  onMounted,
  shallowRef,
  vShow,
  withDirectives,
  type ComponentPublicInstance,
} from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import {
  Box,
  createApp,
  renderToString,
  Text,
  useFocus,
  type UseFocusReturn,
} from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "../../lifecycle/test-streams.ts";
import { flushAcceptedRender } from "./harness.ts";

test("preserves focus across suspend and resume", async () => {
  let focus!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    focus = useFocus(target);
    onMounted(() => focus.focus());
    return () => <Box ref={target} />;
  });

  const result = await render(App);
  try {
    expect(focus.isFocused.value).toBe(true);
    await result.terminal.suspend();
    expect(focus.isFocused.value).toBe(true);
    await result.terminal.resume();
    expect(focus.isFocused.value).toBe(true);
  } finally {
    result.dispose();
  }
});

test("clears targeted focus when its boundary becomes hidden during suspension", async () => {
  const shown = shallowRef(true);
  let focus!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    focus = useFocus(target);
    onMounted(() => focus.focus());
    return () => withDirectives(h(Box, { ref: target }), [[vShow, shown.value]]);
  });

  const result = await render(App);
  try {
    expect(focus.isFocused.value).toBe(true);
    await result.terminal.suspend();

    shown.value = false;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(false);

    shown.value = true;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(false);

    await result.terminal.resume();
    expect(focus.isFocused.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("keeps focus inert in renderToString and clears retained handles after rollback", () => {
  let logical!: UseFocusReturn;
  let rendered!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    logical = useFocus();
    rendered = useFocus(target);
    logical.focus();
    onMounted(() => rendered.focus());
    return () => (
      <Box ref={target}>
        <Text>string focus</Text>
      </Box>
    );
  });

  expect(renderToString(App)).toBe("string focus");
  expect(logical.isFocused.value).toBe(false);
  expect(rendered.isFocused.value).toBe(false);
  logical.focus();
  rendered.focus();
  expect(logical.isFocused.value).toBe(false);
  expect(rendered.isFocused.value).toBe(false);

  let rolledBack!: UseFocusReturn;
  const Failing = defineComponent(() => {
    rolledBack = useFocus();
    rolledBack.focus();
    throw new Error("focus rollback");
  });
  expect(() => renderToString(Failing)).toThrow("focus rollback");
  expect(rolledBack.isFocused.value).toBe(false);
  rolledBack.focus();
  expect(rolledBack.isFocused.value).toBe(false);
});

test("clears retained focus handles when initial live output fails", async () => {
  const outputError = new Error("focus initial output failure");
  let retained!: UseFocusReturn;
  const App = defineComponent(() => {
    retained = useFocus();
    retained.focus();
    return () => <Text>FOCUS_INITIAL_OUTPUT_FAILURE</Text>;
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const originalWrite = stdout.write.bind(stdout);
  let failedOutput = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    if (!failedOutput && chunk.includes("FOCUS_INITIAL_OUTPUT_FAILURE")) {
      failedOutput = true;
      throw outputError;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const app = createApp(App);
  try {
    let mountError: unknown;
    try {
      app.mount({ stdout, stdin, stderr, patchConsole: false });
    } catch (error) {
      mountError = error;
    }

    expect(mountError).toBe(outputError);
    await expect(app.waitUntilExit()).rejects.toBe(outputError);
    expect(failedOutput).toBe(true);
    expect(retained.isFocused.value).toBe(false);

    expect(retained.focus()).toBeUndefined();
    expect(retained.blur()).toBeUndefined();
    expect(retained.isFocused.value).toBe(false);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
