import { defineComponent, h, nextTick, shallowRef, type Component } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, renderToString } from "@vue-tui/runtime";
import { renderToStringWithScreenReader } from "../../../runtime/dist/internal.mjs";

const removedListeners = [
  "onMousedown",
  "onMouseDown",
  "onMouseup",
  "onMouseUp",
  "onClick",
  "onWheel",
] as const;

function rejection(component: "Box" | "Text", listener: (typeof removedListeners)[number]): RegExp {
  return new RegExp(
    `^<${component}> does not accept the removed mouse listener "${listener}"\\. ` +
      `Targeted mouse input is outside the current Runtime foundation\\.$`,
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

test.each([
  ["Box", Box, "paddingX"],
  ["Box", Box, "flexWrap"],
  ["Box", Box, "marginLeft"],
  ["Box", Box, "padddingLeft"],
  ["Text", Text, "underline"],
  ["Text", Text, "colour"],
] as const)("%s rejects undeclared attribute %s at render time", (name, component, attr) => {
  const App = defineComponent(
    () => () =>
      h(component, { [attr]: 1 } as Record<string, unknown>, {
        default: () => h(Text, null, () => "x"),
      }),
  );

  expect(() => renderToString(App)).toThrow(
    `<${name}> does not accept the undeclared attribute "${attr}"`,
  );
});

test("Vue component mechanics remain available on the closed primitives", () => {
  const App = defineComponent(
    () => () =>
      h(
        Box,
        {
          key: "box",
          ref: () => {},
          onVnodeMounted: () => {},
        },
        { default: () => h(Text, null, () => "x") },
      ),
  );

  expect(renderToString(App)).toBe("x");
});

test.each(["class", "style", "data-state"])(
  "browser-style attribute %s has no silent terminal meaning",
  (attr) => {
    const App = defineComponent(
      () => () =>
        h(Box, { [attr]: "value" } as Record<string, unknown>, {
          default: () => h(Text, null, () => "x"),
        }),
    );
    expect(() => renderToString(App)).toThrow(
      `<Box> does not accept the undeclared attribute "${attr}"`,
    );
  },
);
