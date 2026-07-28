import { defineComponent, h, shallowRef, vShow, withDirectives } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, renderToString, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { flush, staticTranscript } from "./harness.ts";

test("removed items and style attributes do not reach the internal host", async () => {
  const legacyAttrs = { items: ["ignored"], style: { paddingLeft: 4 } } as Record<string, unknown>;
  const result = await render(
    defineComponent(() => () => (
      <Static {...legacyAttrs}>
        <Text>X</Text>
      </Static>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("X\n");
});

test("an empty Static block adds no blank line to history or the dynamic frame", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Static />
        <Text>[live]</Text>
      </Box>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("");
  expect(result.lastFrame()).toBe("[live]");
});

test("v-show does not change mounted Static eligibility", async () => {
  const visible = shallowRef(false);
  const App = defineComponent(
    () => () =>
      h(Box, { flexDirection: "column" }, () => [
        withDirectives(
          h(Box, null, () => h(Static, null, () => h(Text, null, () => "ANCESTOR"))),
          [[vShow, visible.value]],
        ),
        withDirectives(
          h(Static, null, () => h(Text, null, () => "DIRECT")),
          [[vShow, visible.value]],
        ),
        h(Text, null, () => "[live]"),
      ]),
  );
  const result = await render(App);

  expect(staticTranscript(result.frames)).toBe("ANCESTOR\nDIRECT\n");
  visible.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("ANCESTOR\nDIRECT\n");
});

test("nested v-show ancestors neither defer nor rewrite mounted Static", async () => {
  const outerVisible = shallowRef(false);
  const innerVisible = shallowRef(false);
  const entries = shallowRef([
    { id: "a", text: "old-A" },
    { id: "b", text: "old-B" },
  ]);
  const App = defineComponent(
    () => () =>
      h(Box, null, () => [
        withDirectives(
          h(Box, null, () =>
            withDirectives(
              h(Box, null, () =>
                entries.value.map((entry) =>
                  h(Static, { key: entry.id }, () => h(Text, null, () => entry.text)),
                ),
              ),
              [[vShow, innerVisible.value]],
            ),
          ),
          [[vShow, outerVisible.value]],
        ),
        h(Text, null, () => "[live]"),
      ]),
  );
  const result = await render(App);
  expect(staticTranscript(result.frames)).toBe("old-A\nold-B\n");

  entries.value = [
    { id: "b", text: "new-B" },
    { id: "a", text: "new-A" },
  ];
  outerVisible.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("old-A\nold-B\n");

  innerVisible.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("old-A\nold-B\n");
});

test("v-show does not hide Static from a synchronous document", () => {
  const App = defineComponent(
    () => () =>
      h(Box, null, () => [
        withDirectives(
          h(Box, null, () => h(Static, null, () => h(Text, null, () => "ANCESTOR"))),
          [[vShow, false]],
        ),
        withDirectives(
          h(Static, null, () => h(Text, null, () => "DIRECT")),
          [[vShow, false]],
        ),
      ]),
  );

  expect(renderToString(App)).toBe("ANCESTOR\nDIRECT");
});
