import { defineComponent, h, nextTick, shallowRef, type Component } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, renderToString } from "@vue-tui/runtime";
import { renderToStringWithScreenReader } from "@vue-tui/runtime/internal";

const removedListeners = ["onMousedown", "onMouseup", "onClick", "onWheel"] as const;

function rejection(component: "Box" | "Text", listener: (typeof removedListeners)[number]): RegExp {
  return new RegExp(
    `^<${component}> does not accept the removed mouse listener "${listener}"\\. ` +
      `Use the mouse composables from "@vue-tui/runtime/fullscreen"\\.$`,
  );
}

function withRemovedListener(
  component: Component,
  listener: (typeof removedListeners)[number],
  value: unknown = () => {},
): Component {
  return defineComponent(
    () => () =>
      h(component, { [listener]: value } as Record<string, unknown>, {
        default: () => h(Text, null, () => "content"),
      }),
  );
}

test.each(removedListeners)("Box rejects the removed %s prop from JavaScript/any", (listener) => {
  expect(() => renderToString(withRemovedListener(Box, listener))).toThrow(
    rejection("Box", listener),
  );
});

test.each(removedListeners)("Text rejects the removed %s prop from JavaScript/any", (listener) => {
  const App = defineComponent(
    () => () => h(Text, { [listener]: () => {} } as Record<string, unknown>, () => "content"),
  );
  expect(() => renderToString(App)).toThrow(rejection("Text", listener));
});

test("rejection happens before screen-reader and ariaHidden branches", () => {
  const HiddenBox = defineComponent(
    () => () =>
      h(Box, { ariaHidden: true, onClick: () => {} } as Record<string, unknown>, () =>
        h(Text, null, () => "secret"),
      ),
  );
  const HiddenText = defineComponent(
    () => () => h(Text, { ariaHidden: true, onWheel: () => {} } as Record<string, unknown>),
  );

  expect(() => renderToStringWithScreenReader(HiddenBox)).toThrow(rejection("Box", "onClick"));
  expect(() => renderToStringWithScreenReader(HiddenText)).toThrow(rejection("Text", "onWheel"));
});

test("childless Text still rejects a removed listener", () => {
  const App = defineComponent(
    () => () => h(Text, { onMousedown: undefined } as Record<string, unknown>),
  );
  expect(() => renderToString(App)).toThrow(rejection("Text", "onMousedown"));
});

test("a removed listener introduced by a later render exits the application", async () => {
  const rejected = shallowRef(false);
  const App = defineComponent(
    () => () =>
      h(Box, rejected.value ? ({ onClick: () => {} } as Record<string, unknown>) : null, () =>
        h(Text, null, () => "content"),
      ),
  );
  const result = await render(App);
  const exited = result.waitUntilExit();

  rejected.value = true;
  await nextTick();

  await expect(exited).rejects.toThrow(rejection("Box", "onClick"));
});
