import { defineComponent, h, nextTick, shallowRef, type Component } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, renderToString } from "@vue-tui/runtime";

const listenerAttributes = [
  "onMousedown",
  "onMouseDown",
  "onMouseup",
  "onMouseUp",
  "onClick",
  "onWheel",
] as const;

function rejection(
  component: "Box" | "Text",
  listener: (typeof listenerAttributes)[number],
): RegExp {
  return new RegExp(`^<${component}> does not accept the undeclared attribute "${listener}"\\. `);
}

function withListenerAttribute(
  component: Component,
  listener: (typeof listenerAttributes)[number],
  value: unknown = () => {},
): Component {
  return defineComponent(
    () => () =>
      h(component, { [listener]: value } as Record<string, unknown>, {
        default: () => h(Text, null, () => "content"),
      }),
  );
}

test.each(listenerAttributes)("Box rejects the undeclared %s listener", (listener) => {
  expect(() => renderToString(withListenerAttribute(Box, listener))).toThrow(
    rejection("Box", listener),
  );
});

test.each(listenerAttributes)("Text rejects the undeclared %s listener", (listener) => {
  const App = defineComponent(
    () => () => h(Text, { [listener]: () => {} } as Record<string, unknown>, () => "content"),
  );
  expect(() => renderToString(App)).toThrow(rejection("Text", listener));
});

test("childless Text still rejects a listener attribute", () => {
  const App = defineComponent(
    () => () => h(Text, { onMousedown: undefined } as Record<string, unknown>),
  );
  expect(() => renderToString(App)).toThrow(rejection("Text", "onMousedown"));
});

test("a listener attribute introduced by a later render rejects Vue's update", async () => {
  const rejected = shallowRef(false);
  const App = defineComponent(
    () => () =>
      h(Box, rejected.value ? ({ onClick: () => {} } as Record<string, unknown>) : null, () =>
        h(Text, null, () => "content"),
      ),
  );
  const result = await render(App);

  try {
    rejected.value = true;
    await expect(nextTick()).rejects.toThrow(rejection("Box", "onClick"));
    result.unmount();
    await expect(result.waitUntilExit()).resolves.toBeUndefined();
  } finally {
    result.dispose();
  }
});

test.each([
  ["Box", Box, "display"],
  ["Box", Box, "alignContent"],
  ["Box", Box, "aspectRatio"],
  ["Box", Box, "padddingLeft"],
  ["Text", Text, "colour"],
] as const)("%s rejects undeclared attribute %s at render time", (name, component, attr) => {
  const App = defineComponent(
    () => () =>
      h(component as Component, { [attr]: 1 } as Record<string, unknown>, {
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
